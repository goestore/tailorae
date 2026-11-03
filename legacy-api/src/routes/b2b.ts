import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, b2bOnly, createSession, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { generateToken } from '@/utils/jwt';
import { isValidGstin, isValidPan, normalizeId } from '@/utils/kyc';
import { isNonEmptyString, parseDateInput, randomSuffix, round2 } from '@/utils/helpers';

/*
 * Wholesale buyers: business profile, requests for quote, bulk orders.
 *
 * Who may do what — the decision this file encodes:
 *
 * - Any signed-in, ACTIVE account may create its own business profile and ask
 *   for a quote. A quote request costs us nothing but a reply, and an admin
 *   prices every one by hand, so there is nothing to protect by gating it.
 *   (authMiddleware already refuses accounts that are not ACTIVE.)
 *
 * - Creating a profile does NOT make anyone a wholesale buyer. The profile is
 *   stored unverified and the account keeps its role. The B2B_BUYER role is
 *   what unlocks wholesale tier pricing on bulk orders and trade-only coupons
 *   (utils/coupons.ts), and it is granted only when an admin verifies the
 *   profile (routes/admin-b2b.ts), and only to a RETAIL_CUSTOMER — an ADMIN or
 *   VENDOR is never re-roled.
 *
 * - Changing the company identity (name, GSTIN or PAN) on a verified profile
 *   puts it back to unverified and takes B2B_BUYER away again, because the
 *   verification was of the old details. That is the one place a buyer's own
 *   request changes their role, so it reissues a token the way seller /apply
 *   does.
 */

const router = Router();

const RFQ_STATUSES = ['PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
const MAX_RFQ_QUANTITY = 1_000_000;
const MAX_TEXT = 2000;
/** businessType is required by the schema; a one-step RFQ does not ask for it. */
const UNSPECIFIED_BUSINESS_TYPE = 'Unspecified';
/** Fields whose change voids an admin's verification. */
const IDENTITY_FIELDS = ['companyName', 'gstNumber', 'panNumber'] as const;

/** Whitelist + validate B2B profile fields. Credit, tier and verification are admin-only. */
const pickB2BProfileFields = (
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  const label: Record<string, string> = {
    companyName: 'Company name',
    businessType: 'Business type',
    companyRegistration: 'Company registration number',
    businessCategory: 'Business category',
    businessDescription: 'Business description',
    website: 'Website',
  };

  for (const field of ['companyName', 'businessType'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (!isNonEmptyString(value)) errors.push(`${label[field]} cannot be empty`);
    else if (value.trim().length > 120) errors.push(`${label[field]} must be 120 characters or fewer`);
    else data[field] = value.trim();
  }
  for (const field of [
    'companyRegistration',
    'businessCategory',
    'businessDescription',
    'website',
  ] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string') {
      errors.push(`${label[field]} must be text`);
      continue;
    }
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed.length > MAX_TEXT) errors.push(`${label[field]} is too long`);
    else data[field] = trimmed || null;
  }

  // Tax identity: normalised to upper case without spaces, checked for shape.
  if (body.panNumber !== undefined) {
    const pan = normalizeId(body.panNumber);
    if (pan && !isValidPan(pan)) errors.push('PAN must look like ABCDE1234F');
    else data.panNumber = pan || null;
  }
  if (body.gstNumber !== undefined) {
    const gstin = normalizeId(body.gstNumber);
    if (gstin && !isValidGstin(gstin)) errors.push('GSTIN is not valid. Check for a typo');
    else data.gstNumber = gstin || null;
  }

  if (body.monthlyBudget !== undefined) {
    if (body.monthlyBudget === null || body.monthlyBudget === '') data.monthlyBudget = null;
    else {
      const num = Number(body.monthlyBudget);
      if (!Number.isFinite(num) || num < 0) errors.push('Monthly budget must be a non-negative number');
      else data.monthlyBudget = num;
    }
  }
  if (body.employeeCount !== undefined) {
    if (body.employeeCount === null || body.employeeCount === '') data.employeeCount = null;
    else {
      const num = Number(body.employeeCount);
      if (!Number.isInteger(num) || num < 0) errors.push('Employee count must be a whole number');
      else data.employeeCount = num;
    }
  }

  return { data, errors };
};

/** Fetch the caller's B2B profile or null. */
const getOwnB2BProfile = (userId: string) => prisma.b2BProfile.findUnique({ where: { userId } });

/** The product fields an RFQ or bulk order row is shown with. */
const PRODUCT_SUMMARY = {
  id: true,
  name: true,
  slug: true,
  thumbnail: true,
  price: true,
} satisfies Prisma.ProductSelect;

type ProductSummary = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SUMMARY }>;

/** RFQ and BulkOrder carry a bare productId; attach the product they refer to. */
export const withProducts = async <T extends { productId: string }>(
  rows: T[]
): Promise<Array<T & { product: ProductSummary | null }>> => {
  const ids = Array.from(new Set(rows.map((row) => row.productId)));
  const products = ids.length
    ? await prisma.product.findMany({ where: { id: { in: ids } }, select: PRODUCT_SUMMARY })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return rows.map((row) => ({ ...row, product: byId.get(row.productId) ?? null }));
};

/** A quote past its expiry can no longer be accepted; record that it lapsed. */
export const expireStaleQuotes = (where: Prisma.RFQWhereInput = {}) =>
  prisma.rFQ.updateMany({
    where: { ...where, status: 'QUOTED', expiryDate: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });

/** quotedBy is an internal admin id; the buyer has no use for it. */
const buyerView = <T extends { quotedBy: string | null }>({ quotedBy: _quotedBy, ...rest }: T) => rest;

/** P2002 on the profile table means someone else already registered that GSTIN/PAN. */
const isDuplicateTaxId = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

// @route   GET /api/b2b/profile
// @desc    Get own B2B profile (null when none exists yet)
// @access  Private (any signed-in account)
router.get('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getOwnB2BProfile(req.userId!);
    res.json({
      success: true,
      message: profile ? 'B2B profile fetched' : 'No B2B profile yet',
      data: { profile, role: req.user?.role ?? null },
    });
  } catch (error) {
    console.error('[B2B] get profile failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch B2B profile' });
  }
});

// @route   POST /api/b2b/profile
// @desc    Create or update own B2B profile. Always stored unverified on create.
// @access  Private (any signed-in account)
router.post('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { data, errors } = pickB2BProfileFields((req.body ?? {}) as Record<string, unknown>);

    const existing = await getOwnB2BProfile(req.userId!);
    if (!existing && !isNonEmptyString(data.companyName)) errors.push('Company name is required');

    // When both are on file the GSTIN must embed the PAN (characters 3–12).
    const pan = (data.panNumber !== undefined ? data.panNumber : existing?.panNumber) as string | null;
    const gstin = (data.gstNumber !== undefined ? data.gstNumber : existing?.gstNumber) as string | null;
    if (pan && gstin && isValidGstin(gstin) && gstin.slice(2, 12) !== pan) {
      errors.push('GSTIN does not belong to this PAN');
    }

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No profile details were provided' });
      return;
    }

    let roleChanged = false;
    let profile;
    if (existing) {
      const identityChanged = IDENTITY_FIELDS.some(
        (field) => data[field] !== undefined && data[field] !== existing[field]
      );
      const voidsVerification = existing.isVerified && identityChanged;

      profile = await prisma.$transaction(async (tx) => {
        const updated = await tx.b2BProfile.update({
          where: { userId: req.userId! },
          data: {
            ...(data as Prisma.B2BProfileUncheckedUpdateInput),
            ...(voidsVerification ? { isVerified: false } : {}),
          },
        });
        if (voidsVerification) {
          const demoted = await tx.user.updateMany({
            where: { id: req.userId!, role: 'B2B_BUYER' },
            data: { role: 'RETAIL_CUSTOMER' },
          });
          roleChanged = demoted.count > 0;
        }
        return updated;
      });
    } else {
      profile = await prisma.b2BProfile.create({
        data: {
          ...(data as Omit<Prisma.B2BProfileUncheckedCreateInput, 'userId'>),
          businessType: (data.businessType as string | undefined) ?? UNSPECIFIED_BUSINESS_TYPE,
          userId: req.userId!,
          // Explicit: a self-made profile never starts verified.
          isVerified: false,
        },
      });
    }

    // Same as seller /apply: hand back a token carrying the new role.
    let token: string | null = null;
    if (roleChanged) {
      const account = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { id: true, email: true, role: true },
      });
      if (account) {
        token = generateToken({ userId: account.id, email: account.email, role: account.role });
        await createSession(token, account.id, req);
      }
    }

    res.status(existing ? 200 : 201).json({
      success: true,
      message: existing
        ? roleChanged || (existing.isVerified && !profile.isVerified)
          ? 'Profile updated. Your company details changed, so it will be verified again.'
          : 'B2B profile updated'
        : 'B2B profile created. Our team will verify it before wholesale pricing is unlocked.',
      data: { profile, token },
    });
  } catch (error) {
    if (isDuplicateTaxId(error)) {
      res.status(409).json({ success: false, message: 'That GSTIN or PAN is already registered to another account' });
      return;
    }
    console.error('[B2B] save profile failed:', error);
    res.status(500).json({ success: false, message: 'Failed to save B2B profile' });
  }
});

// @route   POST /api/b2b/rfq
// @desc    Create RFQ (Request for Quote). Creates a minimal profile from
//          companyName when the caller has none, so it works in one step.
// @access  Private (any signed-in account)
router.post('/rfq', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, productName, quantity, targetPrice, description, deadline, companyName } =
      req.body ?? {};

    const errors: string[] = [];
    if (!isNonEmptyString(productId)) errors.push('Choose a product');
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) errors.push('Quantity must be a whole number of at least 1');
    else if (qty > MAX_RFQ_QUANTITY) errors.push(`Quantity cannot exceed ${MAX_RFQ_QUANTITY.toLocaleString('en-IN')}`);

    let desiredPrice: number | null = null;
    if (targetPrice !== undefined && targetPrice !== null && targetPrice !== '') {
      const num = Number(targetPrice);
      if (!Number.isFinite(num) || num <= 0) errors.push('Target price must be a positive number');
      else desiredPrice = round2(num);
    }
    let deliveryDate: Date | null = null;
    if (deadline !== undefined && deadline !== null && deadline !== '') {
      const parsed = parseDateInput(deadline);
      if (!parsed) errors.push('Deadline must be a valid date');
      else if (parsed.getTime() < Date.now() - 24 * 60 * 60 * 1000) errors.push('Deadline cannot be in the past');
      else deliveryDate = parsed;
    }
    if (description !== undefined && description !== null && typeof description !== 'string') {
      errors.push('Requirements must be text');
    } else if (typeof description === 'string' && description.length > MAX_TEXT) {
      errors.push(`Requirements must be ${MAX_TEXT} characters or fewer`);
    }
    if (companyName !== undefined && companyName !== null && typeof companyName !== 'string') {
      errors.push('Company name must be text');
    }

    let profile = await getOwnB2BProfile(req.userId!);
    if (!profile && !isNonEmptyString(companyName)) {
      errors.push('Company name is required for your first quote request');
    }
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: productId as string },
      select: { id: true, name: true, status: true, moderationStatus: true },
    });
    if (!product || product.status !== 'ACTIVE' || product.moderationStatus !== 'APPROVED') {
      res.status(404).json({ success: false, message: 'That product is not available for quotes' });
      return;
    }

    let profileCreated = false;
    if (!profile) {
      try {
        profile = await prisma.b2BProfile.create({
          data: {
            userId: req.userId!,
            companyName: (companyName as string).trim().slice(0, 120),
            businessType: UNSPECIFIED_BUSINESS_TYPE,
            isVerified: false,
          },
        });
        profileCreated = true;
      } catch (error) {
        // A concurrent request created it first: use that one.
        if (!isDuplicateTaxId(error)) throw error;
        profile = await getOwnB2BProfile(req.userId!);
        if (!profile) throw error;
      }
    }

    // The RFQ model has no productName column — fold it into specialRequirements.
    const requirementParts: string[] = [];
    if (isNonEmptyString(productName) && productName.trim() !== product.name) {
      requirementParts.push(`Product: ${productName.trim()}`);
    }
    if (isNonEmptyString(description)) requirementParts.push(description.trim());

    const rfq = await prisma.rFQ.create({
      data: {
        rfqNumber: `RFQ-${Date.now()}-${randomSuffix(4)}`,
        b2bProfileId: profile.id,
        productId: product.id,
        quantity: qty,
        desiredPrice,
        deliveryDate,
        specialRequirements: requirementParts.length > 0 ? requirementParts.join(' — ') : null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Quote request received. Our B2B team will reply with pricing.',
      data: { rfq: { ...rfq, product: { id: product.id, name: product.name } }, profileCreated },
    });
  } catch (error) {
    console.error('[B2B] create RFQ failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create RFQ' });
  }
});

// @route   GET /api/b2b/rfq
// @desc    The caller's own RFQs with quote details
// @access  Private (any signed-in account; empty without a profile)
router.get('/rfq', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getOwnB2BProfile(req.userId!);
    if (!profile) {
      res.json({ success: true, message: 'No B2B profile yet', data: { rfqs: [] } });
      return;
    }

    await expireStaleQuotes({ b2bProfileId: profile.id });
    const rfqs = await prisma.rFQ.findMany({
      where: { b2bProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      message: 'RFQs fetched',
      data: { rfqs: await withProducts(rfqs.map(buyerView)) },
    });
  } catch (error) {
    console.error('[B2B] list RFQs failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch RFQs' });
  }
});

// @route   PATCH /api/b2b/rfq/:id/respond
// @desc    Accept or reject a quote. Accepting turns it into a bulk order at
//          the quoted unit price.
// @access  Private (RFQ owner only)
router.patch('/rfq/:id/respond', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const decision = (req.body ?? {}).decision;
    if (decision !== 'accept' && decision !== 'reject') {
      res.status(400).json({ success: false, message: "decision must be 'accept' or 'reject'" });
      return;
    }

    const rfq = await prisma.rFQ.findUnique({
      where: { id: String(req.params.id) },
      include: { b2bProfile: { select: { userId: true } } },
    });
    // Someone else's RFQ reads as not found rather than forbidden.
    if (!rfq || rfq.b2bProfile.userId !== req.userId) {
      res.status(404).json({ success: false, message: 'Quote request not found' });
      return;
    }
    if (rfq.status === 'QUOTED' && rfq.expiryDate && rfq.expiryDate.getTime() < Date.now()) {
      await expireStaleQuotes({ id: rfq.id });
      res.status(409).json({ success: false, message: 'This quote has expired. Please request a new one.' });
      return;
    }
    if (rfq.status !== 'QUOTED' || rfq.quotedPrice === null) {
      res.status(409).json({
        success: false,
        message:
          rfq.status === 'PENDING'
            ? 'This request has not been quoted yet'
            : `This quote is already ${rfq.status.toLowerCase()}`,
      });
      return;
    }

    const quotedPrice = rfq.quotedPrice;
    const result = await prisma.$transaction(async (tx) => {
      // Conditional on status so two clicks cannot both succeed.
      const changed = await tx.rFQ.updateMany({
        where: { id: rfq.id, status: 'QUOTED' },
        data: { status: decision === 'accept' ? 'ACCEPTED' : 'REJECTED' },
      });
      if (changed.count === 0) return null;
      const bulkOrder =
        decision === 'accept'
          ? await tx.bulkOrder.create({
              data: {
                orderNumber: `BO-${Date.now()}-${randomSuffix(4)}`,
                b2bProfileId: rfq.b2bProfileId,
                productId: rfq.productId,
                quantity: rfq.quantity,
                unitPrice: round2(quotedPrice),
                totalPrice: round2(quotedPrice * rfq.quantity),
                expectedDelivery: rfq.deliveryDate,
                specialRequirements: `From quote ${rfq.rfqNumber}${
                  rfq.specialRequirements ? ` — ${rfq.specialRequirements}` : ''
                }`,
              },
            })
          : null;
      const updated = await tx.rFQ.findUniqueOrThrow({ where: { id: rfq.id } });
      return { rfq: buyerView(updated), bulkOrder };
    });

    if (!result) {
      res.status(409).json({ success: false, message: 'This quote was already answered' });
      return;
    }

    res.json({
      success: true,
      message:
        decision === 'accept'
          ? `Quote accepted. Bulk order ${result.bulkOrder?.orderNumber} has been created.`
          : 'Quote declined.',
      data: result,
    });
  } catch (error) {
    console.error('[B2B] respond to RFQ failed:', error);
    res.status(500).json({ success: false, message: 'Failed to record your response' });
  }
});

// @route   POST /api/b2b/bulk-orders
// @desc    Create bulk order at wholesale tier pricing
// @access  Private (verified B2B buyers only — this is the wholesale price)
router.post('/bulk-orders', authMiddleware, b2bOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity, expectedDelivery, specialRequirements, paymentTerms } = req.body ?? {};

    if (!isNonEmptyString(productId)) {
      res.status(400).json({ success: false, message: 'productId is required' });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      res.status(400).json({ success: false, message: 'quantity must be an integer of at least 1' });
      return;
    }
    let expectedDeliveryDate: Date | null = null;
    if (expectedDelivery !== undefined && expectedDelivery !== null && expectedDelivery !== '') {
      const parsed = parseDateInput(expectedDelivery);
      if (!parsed) {
        res.status(400).json({ success: false, message: 'expectedDelivery must be a valid date' });
        return;
      }
      expectedDeliveryDate = parsed;
    }
    if (specialRequirements !== undefined && specialRequirements !== null && typeof specialRequirements !== 'string') {
      res.status(400).json({ success: false, message: 'specialRequirements must be a string' });
      return;
    }
    if (paymentTerms !== undefined && paymentTerms !== null && typeof paymentTerms !== 'string') {
      res.status(400).json({ success: false, message: 'paymentTerms must be a string' });
      return;
    }

    const profile = await getOwnB2BProfile(req.userId!);
    if (!profile) {
      res.status(400).json({ success: false, message: 'Create your B2B profile before placing a bulk order' });
      return;
    }
    if (!profile.isVerified) {
      res.status(403).json({ success: false, message: 'Your business profile is awaiting verification' });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { bulkPricings: true },
    });
    if (!product || product.status !== 'ACTIVE') {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    if (!product.allowBulkOrders) {
      res.status(400).json({ success: false, message: 'This product does not allow bulk orders' });
      return;
    }

    // Unit price: matching bulk-pricing tier if any, else base product price.
    const tier = product.bulkPricings.find(
      (t) => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty)
    );
    const unitPrice = round2(tier ? tier.price : product.price);
    const totalPrice = round2(unitPrice * qty);

    const bulkOrder = await prisma.bulkOrder.create({
      data: {
        orderNumber: `BO-${Date.now()}-${randomSuffix(4)}`,
        b2bProfileId: profile.id,
        productId,
        quantity: qty,
        unitPrice,
        totalPrice,
        expectedDelivery: expectedDeliveryDate,
        specialRequirements: isNonEmptyString(specialRequirements) ? specialRequirements.trim() : null,
        paymentTerms: isNonEmptyString(paymentTerms) ? paymentTerms.trim() : null,
      },
    });

    res.status(201).json({ success: true, message: 'Bulk order created', data: { bulkOrder } });
  } catch (error) {
    console.error('[B2B] create bulk order failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create bulk order' });
  }
});

// @route   GET /api/b2b/bulk-orders
// @desc    The caller's bulk orders (including those created by accepting a quote)
// @access  Private (any signed-in account; empty without a profile)
router.get('/bulk-orders', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getOwnB2BProfile(req.userId!);
    if (!profile) {
      res.json({ success: true, message: 'No B2B profile yet', data: { bulkOrders: [] } });
      return;
    }

    const bulkOrders = await prisma.bulkOrder.findMany({
      where: { b2bProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      message: 'Bulk orders fetched',
      data: { bulkOrders: await withProducts(bulkOrders) },
    });
  } catch (error) {
    console.error('[B2B] list bulk orders failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bulk orders' });
  }
});

export { RFQ_STATUSES };
export default router;
