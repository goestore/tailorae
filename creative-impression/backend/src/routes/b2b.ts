import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, b2bOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { isNonEmptyString, parseDateInput, randomSuffix, round2 } from '@/utils/helpers';

const router = Router();

/** Whitelist + validate B2B profile fields. */
const pickB2BProfileFields = (
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const field of ['companyName', 'businessType'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (!isNonEmptyString(value)) errors.push(`${field} must be a non-empty string`);
    else data[field] = value.trim();
  }
  for (const field of [
    'companyRegistration',
    'gstNumber',
    'panNumber',
    'businessCategory',
    'businessDescription',
    'website',
  ] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string') errors.push(`${field} must be a string`);
    else data[field] = value;
  }
  if (body.monthlyBudget !== undefined && body.monthlyBudget !== null) {
    const num = Number(body.monthlyBudget);
    if (!Number.isFinite(num) || num < 0) errors.push('monthlyBudget must be a non-negative number');
    else data.monthlyBudget = num;
  }
  if (body.employeeCount !== undefined && body.employeeCount !== null) {
    const num = Number(body.employeeCount);
    if (!Number.isInteger(num) || num < 0) errors.push('employeeCount must be a non-negative integer');
    else data.employeeCount = num;
  }

  return { data, errors };
};

/** Fetch the caller's B2B profile or null. */
const getOwnB2BProfile = (userId: string) => prisma.b2BProfile.findUnique({ where: { userId } });

// @route   GET /api/b2b/profile
// @desc    Get B2B profile
// @access  Private (B2B only)
router.get('/profile', authMiddleware, b2bOnly, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getOwnB2BProfile(req.userId!);

    if (!profile) {
      res.status(404).json({ success: false, message: 'B2B profile not found' });
      return;
    }

    res.json({
      success: true,
      message: 'B2B profile fetched',
      data: { profile },
    });
  } catch (error) {
    console.error('[B2B] get profile failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch B2B profile',
    });
  }
});

// @route   POST /api/b2b/profile
// @desc    Create or update own B2B profile
// @access  Private (B2B only)
router.post('/profile', authMiddleware, b2bOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { data, errors } = pickB2BProfileFields((req.body ?? {}) as Record<string, unknown>);

    const existing = await getOwnB2BProfile(req.userId!);
    if (!existing) {
      // companyName and businessType are required by the schema on create.
      if (!isNonEmptyString(data.companyName)) errors.push('companyName is required');
      if (!isNonEmptyString(data.businessType)) errors.push('businessType is required');
    }
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided' });
      return;
    }

    const profile = existing
      ? await prisma.b2BProfile.update({
          where: { userId: req.userId! },
          data: data as unknown as Prisma.B2BProfileUncheckedUpdateInput,
        })
      : await prisma.b2BProfile.create({
          data: {
            userId: req.userId!,
            ...(data as unknown as Omit<Prisma.B2BProfileUncheckedCreateInput, 'userId'>),
          } as Prisma.B2BProfileUncheckedCreateInput,
        });

    res.status(existing ? 200 : 201).json({
      success: true,
      message: existing ? 'B2B profile updated' : 'B2B profile created',
      data: { profile },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'GST or PAN number is already registered' });
      return;
    }
    console.error('[B2B] save profile failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save B2B profile',
    });
  }
});

// @route   POST /api/b2b/rfq
// @desc    Create RFQ (Request for Quote)
// @access  Private (B2B only)
router.post('/rfq', authMiddleware, b2bOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, productName, quantity, targetPrice, description, deadline } = req.body ?? {};

    // The RFQ model requires a productId.
    if (!isNonEmptyString(productId)) {
      res.status(400).json({ success: false, message: 'productId is required' });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      res.status(400).json({ success: false, message: 'quantity must be an integer of at least 1' });
      return;
    }
    let desiredPrice: number | null = null;
    if (targetPrice !== undefined && targetPrice !== null) {
      const num = Number(targetPrice);
      if (!Number.isFinite(num) || num < 0) {
        res.status(400).json({ success: false, message: 'targetPrice must be a non-negative number' });
        return;
      }
      desiredPrice = num;
    }
    let deliveryDate: Date | null = null;
    if (deadline !== undefined && deadline !== null && deadline !== '') {
      const parsed = parseDateInput(deadline);
      if (!parsed) {
        res.status(400).json({ success: false, message: 'deadline must be a valid date' });
        return;
      }
      deliveryDate = parsed;
    }

    const profile = await getOwnB2BProfile(req.userId!);
    if (!profile) {
      res.status(400).json({ success: false, message: 'Create your B2B profile before submitting an RFQ' });
      return;
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    // The RFQ model has no productName column — fold it into specialRequirements.
    const requirementParts: string[] = [];
    if (isNonEmptyString(productName)) requirementParts.push(`Product: ${productName.trim()}`);
    if (isNonEmptyString(description)) requirementParts.push(description.trim());

    const rfq = await prisma.rFQ.create({
      data: {
        rfqNumber: `RFQ-${Date.now()}-${randomSuffix(4)}`,
        b2bProfileId: profile.id,
        productId,
        quantity: qty,
        desiredPrice,
        deliveryDate,
        specialRequirements: requirementParts.length > 0 ? requirementParts.join(' — ') : null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'RFQ created',
      data: { rfq },
    });
  } catch (error) {
    console.error('[B2B] create RFQ failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create RFQ',
    });
  }
});

// @route   GET /api/b2b/rfq
// @desc    Get RFQs for B2B buyer
// @access  Private (B2B only)
router.get('/rfq', authMiddleware, b2bOnly, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getOwnB2BProfile(req.userId!);
    if (!profile) {
      res.status(404).json({ success: false, message: 'B2B profile not found' });
      return;
    }

    const rfqs = await prisma.rFQ.findMany({
      where: { b2bProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      message: 'RFQs fetched',
      data: { rfqs },
    });
  } catch (error) {
    console.error('[B2B] list RFQs failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch RFQs',
    });
  }
});

// @route   POST /api/b2b/bulk-orders
// @desc    Create bulk order
// @access  Private (B2B only)
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

    res.status(201).json({
      success: true,
      message: 'Bulk order created',
      data: { bulkOrder },
    });
  } catch (error) {
    console.error('[B2B] create bulk order failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create bulk order',
    });
  }
});

// @route   GET /api/b2b/bulk-orders
// @desc    Get bulk orders
// @access  Private (B2B only)
router.get('/bulk-orders', authMiddleware, b2bOnly, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getOwnB2BProfile(req.userId!);
    if (!profile) {
      res.status(404).json({ success: false, message: 'B2B profile not found' });
      return;
    }

    const bulkOrders = await prisma.bulkOrder.findMany({
      where: { b2bProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      message: 'Bulk orders fetched',
      data: { bulkOrders },
    });
  } catch (error) {
    console.error('[B2B] list bulk orders failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bulk orders',
    });
  }
});

export default router;
