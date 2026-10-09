import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Router, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { OrderStatus, Prisma } from '@prisma/client';
import { authMiddleware, roleMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { UPLOAD_DIR } from '@/routes/media';
import { notifyRestocked } from '@/services/notifications';
import { formatRupees, isHttpError, isNonEmptyString } from '@/utils/helpers';
import { encryptField, last4 } from '@/utils/field-crypto';
import { isValidIfsc, normalizeId, validateKyc } from '@/utils/kyc';
import { deleteKycDocument, readKycDocument, storeKycDocument } from '@/utils/private-files';
import { pickVariantListingFields } from '@/utils/product-spec';
import { generateToken } from '@/utils/jwt';
import { revalidateCatalog } from '@/utils/revalidate';
import { applySellerOrderStatus } from '@/utils/order-status';
import { RETURN_WINDOW_DAYS, heldWhere, holdReason, payableWhere } from '@/utils/settlement';
import { balance as ledgerBalance, statement as ledgerStatement, syncSales } from '@/utils/ledger';
import { pickCompanyFields, sellingBlockedReason, uniqueShopSlug } from '@/utils/vendor';
import { getSetting } from '@/utils/settings';

/**
 * A seller's own shop: applying to sell, and everything about their side of it.
 *
 * Distinct from `/api/products/sellers/*`, which is the public directory. Every
 * route here is scoped to the signed-in user's own `VendorProfile` — the id is
 * never taken from the request, so there is no shape of request that reads
 * another shop's orders or earnings.
 */

const router = Router();

/** Fields a shop may set about itself. Verification and money are not among them. */
const pickShopFields = (
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  if (body.shopName !== undefined) {
    if (!isNonEmptyString(body.shopName)) errors.push('shopName must be a non-empty string');
    else data.shopName = body.shopName.trim().slice(0, 80);
  }
  for (const field of ['shopDescription', 'shopImage', 'shopBanner'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || value === '') data[field] = null;
    else if (typeof value !== 'string') errors.push(`${field} must be a string`);
    else data[field] = value.trim().slice(0, 2000);
  }
  // Bank details are writable by the seller — they are how the seller gets
  // paid — but never readable back in full. See the masking below.
  for (const field of ['bankAccountName', 'bankName'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || value === '') data[field] = null;
    else if (typeof value !== 'string') errors.push(`${field} must be a string`);
    else data[field] = value.trim().slice(0, 80);
  }
  if (body.bankAccountNumber !== undefined) {
    const value = body.bankAccountNumber;
    if (value === null || value === '') data.bankAccountNumber = null;
    else if (typeof value !== 'string' || !/^\d{9,18}$/.test(value.replace(/\s+/g, ''))) {
      errors.push('bankAccountNumber must be 9 to 18 digits');
    } else {
      // Encrypted before it reaches Prisma, so plaintext never hits the database.
      data.bankAccountNumber = encryptField(value.replace(/\s+/g, ''));
    }
  }
  if (body.bankIFSC !== undefined) {
    const value = body.bankIFSC;
    if (value === null || value === '') data.bankIFSC = null;
    else if (!isValidIfsc(value)) errors.push('bankIFSC must look like HDFC0001234');
    else data.bankIFSC = normalizeId(value);
  }
  if (body.lowStockThreshold !== undefined) {
    const num = Number(body.lowStockThreshold);
    if (!Number.isInteger(num) || num < 0 || num > 1000) {
      errors.push('lowStockThreshold must be a whole number from 0 to 1000');
    } else data.lowStockThreshold = num;
  }

  return { data, errors };
};

/**
 * What a seller may see of their own record.
 *
 * `commissionRate` is included because a seller is entitled to know what they
 * are charged. The account number is masked rather than returned: the seller
 * needs to confirm which account is on file, not to read it back, and an
 * endpoint that returns full bank details is one XSS away from being a leak.
 */
const shopView = (shop: {
  bankAccountNumber: string | null;
  [key: string]: unknown;
}): Record<string, unknown> => {
  const { bankAccountNumber, kycDocuments, ...rest } = shop;
  return {
    ...rest,
    bankAccountLast4: last4(bankAccountNumber),
    hasBankDetails: Boolean(bankAccountNumber),
    kycDocuments: Array.isArray(kycDocuments) ? kycDocuments : [],
  };
};

const SHOP_SELECT = {
  id: true,
  shopName: true,
  shopSlug: true,
  shopDescription: true,
  shopImage: true,
  shopBanner: true,
  bankAccountName: true,
  bankAccountNumber: true,
  bankIFSC: true,
  bankName: true,
  isVerified: true,
  isActive: true,
  commissionRate: true,
  rating: true,
  ratingCount: true,
  pan: true,
  gstin: true,
  kycStatus: true,
  kycDocuments: true,
  kycSubmittedAt: true,
  kycReviewedAt: true,
  kycRejectionReason: true,
  lowStockThreshold: true,
  legalName: true,
  businessType: true,
  registeredAddress: true,
  contactPhone: true,
  contactEmail: true,
  applicationStatus: true,
  applicationNote: true,
  applicationReviewedAt: true,
  createdAt: true,
} satisfies Prisma.VendorProfileSelect;

/**
 * Everything after `/apply` needs the VENDOR role, not just a shop row.
 *
 * Before this, the routes only checked that a shop existed. Taking the role
 * away from a user (the quickest way to cut off a bad seller) left their whole
 * seller area working. Admins pass so they can support a shop.
 */
const sellerOnly = roleMiddleware(['VENDOR', 'ADMIN']);

/** The caller's shop, or null. Every route below starts here. */
async function myShop(userId: string) {
  return prisma.vendorProfile.findUnique({ where: { userId }, select: SHOP_SELECT });
}


// @route   GET /api/seller/me
// @desc    The caller's shop, if they have one
// @access  Private
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }
    res.json({ success: true, message: 'Shop fetched', data: { shop: shopView(shop) } });
  } catch (error) {
    console.error('[SELLER] me failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load your shop' });
  }
});

// @route   GET /api/seller/applications-open
// @desc    Whether the public can apply to sell right now
// @access  Public
//
// The owner can close self-service applications from the admin console; /sell
// and the apply page read this so they say "by invitation" up front rather
// than letting someone fill in the whole form and then refusing it.
router.get('/applications-open', async (_req, res: Response) => {
  try {
    const open = await getSetting('seller.applicationsOpen');
    // Not cached: the owner flipping the switch should show on /sell at once.
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { open } });
  } catch (error) {
    console.error('[SELLER] applications-open failed:', error);
    // Failing open would invite applications the server then refuses.
    res.json({ success: true, data: { open: false } });
  }
});

// @route   POST /api/seller/apply
// @desc    Become a seller
// @access  Private
//
// The shop starts as an application: it exists, so the seller can add bank and
// identity details, but nothing can be listed until the owner approves it
// (`applicationStatus`, see utils/vendor.ts sellingBlockedReason). The business
// behind the shop — legal name, type, registered address, contact — is
// required up front because that is what the owner decides on.
router.post('/apply', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await getSetting('seller.applicationsOpen'))) {
      res.status(403).json({
        success: false,
        message: 'Seller registration is by invitation only right now. Contact us if you would like to sell with us.',
      });
      return;
    }

    const existing = await myShop(req.userId!);
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'You already have a seller account',
        data: { shop: shopView(existing) },
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const { data, errors } = pickShopFields(body);
    if (!isNonEmptyString(data.shopName)) errors.push('shopName is required');
    const company = pickCompanyFields(body, { required: true });
    errors.push(...company.errors);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const shop = await prisma.$transaction(async (tx) => {
      const created = await tx.vendorProfile.create({
        data: {
          ...(company.data as Prisma.VendorProfileUncheckedCreateInput),
          userId: req.userId!,
          shopName: data.shopName as string,
          shopSlug: await uniqueShopSlug(data.shopName as string),
          shopDescription: (data.shopDescription as string | null) ?? null,
          isVerified: false,
          isActive: true,
          applicationStatus: 'APPLIED',
        },
        select: SHOP_SELECT,
      });

      // The role is what lets them reach the seller area and list products at
      // all; an admin stays an admin.
      await tx.user.updateMany({
        where: { id: req.userId!, role: { not: 'ADMIN' } },
        data: { role: 'VENDOR' },
      });

      return created;
    });

    /**
     * A fresh token, because the role just changed.
     *
     * `authMiddleware` reads the role out of the JWT rather than the database,
     * so the token the caller is holding still says RETAIL_CUSTOMER — and
     * would for up to seven days. Without this, "you are a seller now" is
     * followed by every listing attempt being refused until they happen to
     * sign in again.
     */
    const account = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, role: true },
    });
    const token = account
      ? generateToken({ userId: account.id, email: account.email, role: account.role })
      : null;

    res.status(201).json({
      success: true,
      message: 'Application received. We will review it and let you know — meanwhile, add your bank and identity details.',
      data: { shop: shopView(shop), token },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'That shop name is already taken' });
      return;
    }
    console.error('[SELLER] apply failed:', error);
    res.status(500).json({ success: false, message: 'Could not create your seller account' });
  }
});

// @route   PUT /api/seller/me
// @desc    Update the caller's own shop
// @access  Private
router.put('/me', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await myShop(req.userId!);
    if (!existing) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const { data, errors } = pickShopFields(body);
    // Company details stay editable after approval (an address moves, a phone
    // number changes) without sending the shop back for review; a rejected
    // seller corrects them here before asking to be reconsidered.
    const company = pickCompanyFields(body, { required: false });
    errors.push(...company.errors);
    Object.assign(data, company.data);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    const shop = await prisma.vendorProfile.update({
      where: { id: existing.id },
      data: data as unknown as Prisma.VendorProfileUncheckedUpdateInput,
      select: SHOP_SELECT,
    });

    // A renamed or reactivated shop should not linger in the cached directory.
    void revalidateCatalog('sellers');

    res.json({ success: true, message: 'Shop updated', data: { shop: shopView(shop) } });
  } catch (error) {
    console.error('[SELLER] update failed:', error);
    res.status(500).json({ success: false, message: 'Could not save your shop' });
  }
});

// @route   GET /api/seller/summary
// @desc    The seller's own dashboard figures
// @access  Private
//
// Every number is read from that shop's own sub-orders, which already carry a
// snapshotted commission and payout — nothing is recomputed here, so what a
// seller is shown is exactly what was recorded at order time.
router.get('/summary', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }

    // Credit anything that has just cleared the return window, so "due" here
    // is the same ledger balance the admin will pay.
    await prisma.$transaction((tx) => syncSales(tx, shop.id));
    const balanceNow = await ledgerBalance(prisma, shop.id);

    const threshold = shop.lowStockThreshold;
    const [
      products,
      liveProducts,
      orderCount,
      pending,
      settled,
      lifetime,
      payable,
      held,
      recent,
      awaitingReview,
      rejected,
      lowStockProducts,
      lowStockVariants,
    ] =
      await Promise.all([
        prisma.product.count({ where: { vendorId: shop.id } }),
        // "Live" means a shopper can actually see it: active and approved.
        prisma.product.count({
          where: { vendorId: shop.id, status: 'ACTIVE', moderationStatus: 'APPROVED' },
        }),
        prisma.sellerOrder.count({ where: { vendorId: shop.id } }),
        prisma.sellerOrder.count({
          where: { vendorId: shop.id, status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] } },
        }),
        prisma.sellerOrder.aggregate({
          where: { vendorId: shop.id, settledAt: { not: null } },
          _sum: { payoutAmount: true },
        }),
        // Sales a shop has actually made, settled or not. Scoping this to
        // unsettled orders would make a seller's lifetime sales fall every time
        // they got paid.
        prisma.sellerOrder.aggregate({
          where: { vendorId: shop.id, status: { notIn: ['CANCELLED', 'RETURNED'] } },
          _sum: { commissionAmount: true, total: true },
        }),
        // Due and held are separate figures: "due" is money that has cleared
        // the return window and can be paid now, "held" is money that exists
        // but is still in fulfilment or inside the customer's return window.
        prisma.sellerOrder.aggregate({
          where: payableWhere(shop.id),
          _sum: { payoutAmount: true },
          _count: { _all: true },
        }),
        prisma.sellerOrder.aggregate({
          where: heldWhere(shop.id),
          _sum: { payoutAmount: true },
          _count: { _all: true },
        }),
        prisma.sellerOrder.findMany({
          where: { vendorId: shop.id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            payoutAmount: true,
            createdAt: true,
          },
        }),
        prisma.product.count({ where: { vendorId: shop.id, moderationStatus: 'PENDING' } }),
        prisma.product.count({ where: { vendorId: shop.id, moderationStatus: 'REJECTED' } }),
        // Products without sizes carry their own stock; products with sizes
        // are judged size by size, so one sold-out size is not hidden by the
        // total.
        prisma.product.findMany({
          where: {
            vendorId: shop.id,
            status: 'ACTIVE',
            quantity: { lte: threshold },
            variants: { none: {} },
          },
          orderBy: { quantity: 'asc' },
          take: 10,
          select: { id: true, name: true, sku: true, quantity: true, thumbnail: true },
        }),
        prisma.productVariant.findMany({
          where: {
            quantity: { lte: threshold },
            product: { vendorId: shop.id, status: 'ACTIVE' },
          },
          orderBy: { quantity: 'asc' },
          take: 10,
          select: {
            id: true,
            name: true,
            sku: true,
            quantity: true,
            product: { select: { id: true, name: true, thumbnail: true } },
          },
        }),
      ]);

    const lowStock = [
      ...lowStockProducts.map((p) => ({
        productId: p.id,
        variantId: null as string | null,
        name: p.name,
        sku: p.sku,
        quantity: p.quantity,
        thumbnail: p.thumbnail,
      })),
      ...lowStockVariants.map((v) => ({
        productId: v.product.id,
        variantId: v.id as string | null,
        name: `${v.product.name} · ${v.name}`,
        sku: v.sku,
        quantity: v.quantity,
        thumbnail: v.product.thumbnail,
      })),
    ]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 10);

    res.json({
      success: true,
      message: 'Summary fetched',
      data: {
        shop: shopView(shop),
        stats: {
          products,
          liveProducts,
          orders: orderCount,
          openOrders: pending,
          grossSales: lifetime._sum.total ?? 0,
          commissionCharged: lifetime._sum.commissionAmount ?? 0,
          // The ledger balance: cleared sales less payouts, reversals and
          // adjustments. Negative means a return is owed back from future sales.
          payoutDue: Math.max(0, balanceNow),
          ledgerBalance: balanceNow,
          ordersDue: payable._count._all,
          payoutHeld: held._sum.payoutAmount ?? 0,
          ordersHeld: held._count._all,
          payoutSettled: settled._sum.payoutAmount ?? 0,
          awaitingReview,
          rejected,
        },
        lowStock,
        lowStockThreshold: threshold,
        recentOrders: recent,
      },
    });
  } catch (error) {
    console.error('[SELLER] summary failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load your dashboard' });
  }
});

// @route   GET /api/seller/orders
// @desc    The seller's own sub-orders
// @access  Private
router.get('/orders', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }

    const orders = await prisma.sellerOrder.findMany({
      where: { vendorId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        items: {
          select: {
            id: true,
            quantity: true,
            price: true,
            sku: true,
            product: { select: { id: true, name: true, slug: true, thumbnail: true } },
          },
        },
        // Only where it ships — never the buyer's contact details, which are
        // not this shop's to hold.
        order: {
          select: {
            orderNumber: true,
            createdAt: true,
            shippingAddress: { select: { city: true, state: true, postalCode: true } },
          },
        },
      },
    });

    res.json({ success: true, message: 'Orders fetched', data: { orders } });
  } catch (error) {
    console.error('[SELLER] orders failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load your orders' });
  }
});

/**
 * The fulfilment path a seller may walk their own sub-order along.
 *
 * Forward only, one step at a time. A seller cannot mark an order delivered
 * from pending, and cannot cancel or mark returned — those affect the money
 * and stay with the platform.
 */
const SELLER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: ['CONFIRMED'],
  CONFIRMED: ['PROCESSING'],
  PROCESSING: ['READY_FOR_SHIPMENT'],
  READY_FOR_SHIPMENT: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
};

// @route   PATCH /api/seller/orders/:id
// @desc    Advance one of the seller's own sub-orders, or attach tracking
// @access  Private
//
// A seller moving their own half also moves the parent order, through
// `applySellerOrderStatus` — but only once every other shop on that order has
// reached the same stage. Before that rollup existed a seller could mark their
// parcel delivered and the customer's order stayed PENDING forever, which among
// other things made a return impossible to open.
router.patch('/orders/:id', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }

    // Scoped to this shop, so another shop's sub-order is simply not found.
    const existing = await prisma.sellerOrder.findFirst({
      where: { id: req.params.id, vendorId: shop.id },
      select: { id: true, status: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }

    const { status, trackingNumber, carrier } = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.SellerOrderUncheckedUpdateInput = {};
    let nextStatus: OrderStatus | null = null;

    if (status !== undefined) {
      const allowed = SELLER_TRANSITIONS[existing.status] ?? [];
      if (typeof status !== 'string' || !allowed.includes(status as OrderStatus)) {
        res.status(409).json({
          success: false,
          message: allowed.length
            ? `From ${existing.status} the next step is ${allowed.join(' or ')}`
            : `A ${existing.status} order cannot be advanced further`,
        });
        return;
      }
      nextStatus = status as OrderStatus;
    }

    for (const [key, value] of [
      ['trackingNumber', trackingNumber],
      ['carrier', carrier],
    ] as const) {
      if (value === undefined) continue;
      if (value === null || value === '') data[key] = null;
      else if (typeof value !== 'string') {
        res.status(400).json({ success: false, message: `${key} must be a string` });
        return;
      } else data[key] = value.trim().slice(0, 120);
    }

    if (nextStatus === null && Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'Nothing to update' });
      return;
    }

    // Tracking on its own touches nothing but this row; a status change has to
    // take the parent order with it, so it goes through one transaction.
    const result = nextStatus
      ? await prisma.$transaction(async (tx) => {
          const rollup = await applySellerOrderStatus(tx, {
            sellerOrderId: existing.id,
            next: nextStatus!,
            actorId: req.userId!,
            extra: data,
          });
          const updated = await tx.sellerOrder.findUniqueOrThrow({ where: { id: existing.id } });
          return { order: updated, rollup };
        })
      : {
          order: await prisma.sellerOrder.update({ where: { id: existing.id }, data }),
          rollup: null,
        };

    res.json({
      success: true,
      message: result.rollup?.parentStatus
        ? `Order updated — the customer's order is now ${result.rollup.parentStatus}`
        : 'Order updated',
      data: { order: result.order, parentStatus: result.rollup?.parentStatus ?? null },
    });
  } catch (error) {
    console.error('[SELLER] order update failed:', error);
    res.status(500).json({ success: false, message: 'Could not update that order' });
  }
});

// @route   GET /api/seller/products
// @desc    The seller's own listings, live or not
// @access  Private
router.get('/products', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }

    const products = await prisma.product.findMany({
      where: { vendorId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        price: true,
        quantity: true,
        status: true,
        moderationStatus: true,
        moderationNote: true,
        thumbnail: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
    });

    res.json({ success: true, message: 'Products fetched', data: { products } });
  } catch (error) {
    console.error('[SELLER] products failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load your products' });
  }
});

// @route   GET /api/seller/earnings
// @desc    Every unsettled sub-order with the reason it is not payable yet
// @access  Private
//
// The dashboard shows one "held" total; this is the itemisation behind it, so a
// seller can see which order is holding their money and until when rather than
// having to ask. Each order lists its lines with the commission rate and amount
// snapshotted at order time, and the ledger statement says what has actually
// been credited, paid, and taken back.
router.get('/earnings', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }

    await prisma.$transaction((tx) => syncSales(tx, shop.id));

    const [orders, withdrawals, stmt] = await Promise.all([
      prisma.sellerOrder.findMany({
        where: { vendorId: shop.id, settledAt: null, status: { notIn: ['CANCELLED', 'RETURNED'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          commissionRate: true,
          commissionAmount: true,
          payoutAmount: true,
          deliveredAt: true,
          settledAt: true,
          createdAt: true,
          // Read so the hold can say "the customer has opened a return" rather
          // than showing money as due that the query is quietly withholding.
          order: { select: { returnRequest: { select: { status: true } } } },
          items: {
            select: {
              id: true,
              sku: true,
              quantity: true,
              price: true,
              commissionRate: true,
              commissionAmount: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
      prisma.withdrawalRequest.findMany({
        where: { vendorId: shop.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          amount: true,
          status: true,
          transactionId: true,
          rejectionReason: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      ledgerStatement(prisma, shop.id),
    ]);

    // Newest first, and the last hundred are plenty on screen.
    const recentEntries = stmt.entries.slice(-100).reverse();
    const subIds = [
      ...new Set(recentEntries.map((e) => e.sellerOrderId).filter((id): id is string => Boolean(id))),
    ];
    const subs = subIds.length
      ? await prisma.sellerOrder.findMany({
          where: { id: { in: subIds } },
          select: { id: true, orderNumber: true },
        })
      : [];

    res.json({
      success: true,
      message: 'Earnings fetched',
      data: {
        returnWindowDays: RETURN_WINDOW_DAYS,
        orders: orders.map(({ order: parent, items, ...row }) => ({
          ...row,
          items: items.map(({ product, ...item }) => ({ ...item, name: product.name })),
          hold: holdReason({ ...row, returnStatus: parent?.returnRequest?.status ?? null }),
        })),
        withdrawals,
        ledger: {
          balance: stmt.closingBalance,
          entries: recentEntries.map(({ createdBy: _createdBy, ...entry }) => ({
            ...entry,
            orderNumber: subs.find((sub) => sub.id === entry.sellerOrderId)?.orderNumber ?? null,
          })),
        },
      },
    });
  } catch (error) {
    console.error('[SELLER] earnings failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load your earnings' });
  }
});

// @route   POST /api/seller/withdrawals
// @desc    Ask to be paid what has cleared the return window
// @access  Private
//
// The ceiling is the seller's ledger balance — cleared sales less payouts,
// reversals and adjustments — never a figure from the request body. A seller
// may ask for less (`amount`), not more. Sub-orders are not stamped here: they
// are claimed when an admin actually settles, so a request sitting unapproved
// never blocks the money from being recounted. Money only goes to a shop whose
// identity check has passed and that has given an account to pay into.
router.post('/withdrawals', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }
    if (shop.kycStatus !== 'APPROVED') {
      res.status(403).json({
        success: false,
        message: 'Your KYC must be approved before you can request a payout',
      });
      return;
    }
    if (!shop.bankAccountNumber || !shop.bankIFSC) {
      res.status(400).json({
        success: false,
        message: 'Add your bank details before requesting a payout',
      });
      return;
    }

    const open = await prisma.withdrawalRequest.findFirst({
      where: { vendorId: shop.id, status: 'PENDING' },
    });
    if (open) {
      res.status(409).json({
        success: false,
        message: 'You already have a payout request waiting to be processed',
      });
      return;
    }

    await prisma.$transaction((tx) => syncSales(tx, shop.id));
    const available = await ledgerBalance(prisma, shop.id);
    if (available <= 0) {
      res.status(409).json({
        success: false,
        message:
          available < 0
            ? `Returns of ${formatRupees(-available)} are being recovered from your next sales`
            : 'Nothing has cleared the return window yet',
      });
      return;
    }

    const requested = req.body?.amount;
    let amount = available;
    if (requested !== undefined && requested !== null && requested !== '') {
      amount = Math.round(Number(requested) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ success: false, message: 'Enter a payout amount above zero' });
        return;
      }
      if (amount > available) {
        res.status(400).json({
          success: false,
          message: `You can request at most ${formatRupees(available)}`,
        });
        return;
      }
    }

    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        vendorId: shop.id,
        amount,
        status: 'PENDING',
        // A snapshot of where the seller expected it to land, so a later change
        // of bank details cannot silently redirect a request already made.
        bankDetails: `${shop.bankAccountName ?? ''} · ${shop.bankName ?? ''} · ****${last4(shop.bankAccountNumber)} · ${shop.bankIFSC}`.trim(),
      },
      select: { id: true, amount: true, status: true, createdAt: true },
    });

    res.status(201).json({
      success: true,
      message: `Payout of ${formatRupees(amount)} requested`,
      data: { withdrawal },
    });
  } catch (error) {
    console.error('[SELLER] withdrawal request failed:', error);
    res.status(500).json({ success: false, message: 'Could not request that payout' });
  }
});

// ── Catalogue ─────────────────────────────────────────────────────────
//
// A seller creates and edits products through the public `/api/products`
// routes, which already admit VENDOR and enforce ownership. What those routes
// cannot do is hand a seller back their own *unpublished* work: `GET
// /api/products/:idOrSlug` answers 404 for anything that is not ACTIVE in a
// verified shop unless the caller is an admin. So a seller's first draft — and
// every listing belonging to a shop still awaiting approval — was unreadable
// to the only person entitled to edit it. These routes close that gap, scoped
// the same way as everything above: the shop comes from the session, so a
// product id belonging to another shop is simply not found.

/** The caller's own product, or null. Every catalogue route below starts here. */
async function myProduct(userId: string, productId: string) {
  const shop = await myShop(userId);
  if (!shop) return { shop: null, product: null };
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId: shop.id },
    select: { id: true, name: true, sku: true },
  });
  return { shop, product };
}

/**
 * Whitelist and validate variant fields.
 *
 * A variant is one size of one colour. Deliberately a copy of the admin
 * console's picker rather than a shared import: that one lives inside a router
 * mounted behind `adminOnly`, and reaching into it from here would tie a
 * seller-facing contract to a file whose rules are written for admins. Two
 * short pickers that can each be read in full beat one that has to be trusted.
 */
const pickSellerVariantFields = (
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name)) errors.push('name must be a non-empty string');
    else data.name = body.name.trim().slice(0, 120);
  }
  if (body.sku !== undefined) {
    if (!isNonEmptyString(body.sku)) errors.push('sku must be a non-empty string');
    else data.sku = body.sku.trim().toUpperCase().slice(0, 60);
  }
  for (const field of ['size', 'color', 'material'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || value === '') data[field] = null;
    else if (typeof value !== 'string') errors.push(`${field} must be a string`);
    else data[field] = value.trim().slice(0, 60);
  }
  if (body.price !== undefined) {
    if (body.price === null || body.price === '') {
      // Null means "same as the product": a size that costs extra names a
      // figure, the rest inherit rather than each carrying a copy of the price.
      data.price = null;
    } else {
      const num = Number(body.price);
      if (!Number.isFinite(num) || num < 0) errors.push('price must be a non-negative number');
      else data.price = num;
    }
  }
  if (body.quantity !== undefined) {
    const num = Number(body.quantity);
    if (!Number.isInteger(num) || num < 0) errors.push('quantity must be a non-negative integer');
    else data.quantity = num;
  }
  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.some((image) => typeof image !== 'string')) {
      errors.push('images must be an array of strings');
    } else {
      // Six is the practical ceiling a colour gallery is designed around.
      data.images = (body.images as string[]).slice(0, 6);
    }
  }

  // Per-size listing values: standard size, label flag, GTIN, measurements.
  const listing = pickVariantListingFields(body);
  Object.assign(data, listing.data);
  errors.push(...listing.errors);

  return { data, errors };
};

// @route   GET /api/seller/products/:id
// @desc    One of the caller's own listings, draft or live, with its variants
// @access  Private
router.get('/products/:id', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }

    const product = await prisma.product.findFirst({
      where: { id: req.params.id, vendorId: shop.id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true } },
        variants: { orderBy: [{ color: 'asc' }, { createdAt: 'asc' }] },
        customizations: true,
      },
    });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    res.json({ success: true, message: 'Product fetched', data: { product } });
  } catch (error) {
    console.error('[SELLER] product fetch failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load that product' });
  }
});

// @route   GET /api/seller/products/:id/variants
// @desc    Every size of every colour of one of the caller's own listings
// @access  Private
router.get('/products/:id/variants', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { shop, product } = await myProduct(req.userId!, req.params.id);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const variants = await prisma.productVariant.findMany({
      where: { productId: product.id },
      orderBy: [{ color: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, message: 'Variants fetched', data: { variants } });
  } catch (error) {
    console.error('[SELLER] variants list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load those sizes' });
  }
});

// @route   POST /api/seller/products/:id/variants
// @desc    Add one size of one colour to the caller's own listing
// @access  Private
router.post('/products/:id/variants', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { shop, product } = await myProduct(req.userId!, req.params.id);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const blocked = sellingBlockedReason(shop);
    if (blocked) {
      res.status(403).json({ success: false, message: blocked });
      return;
    }

    const { data, errors } = pickSellerVariantFields((req.body ?? {}) as Record<string, unknown>);
    if (!isNonEmptyString(data.sku)) errors.push('sku is required');
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    // A readable default, so the picker on the product page has something to
    // show when the seller did not type a name.
    const fallbackName = [data.color, data.size].filter(Boolean).join(' - ') || product.name;

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: (data.name as string) || fallbackName,
        sku: data.sku as string,
        size: (data.size as string | null) ?? null,
        color: (data.color as string | null) ?? null,
        material: (data.material as string | null) ?? null,
        price: (data.price as number | null) ?? null,
        quantity: (data.quantity as number | undefined) ?? 0,
        images: (data.images as string[] | undefined) ?? [],
        // `isDefault` is not offered here: which colour a shopper lands on
        // first is merchandising, and stays with the platform.
        isDefault: false,
        // Listing values (standard size, label flag, GTIN, measurements) are
        // saved on create too, not only on a later update.
        standardSize: (data.standardSize as string | null | undefined) ?? null,
        sizeOnLabel: (data.sizeOnLabel as boolean | null | undefined) ?? null,
        gtin: (data.gtin as string | null | undefined) ?? null,
        ...(data.measurements !== undefined
          ? { measurements: data.measurements as Prisma.InputJsonValue }
          : {}),
      },
    });

    res.status(201).json({ success: true, message: 'Size added', data: { variant } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'A variant with this SKU already exists' });
      return;
    }
    console.error('[SELLER] variant create failed:', error);
    res.status(500).json({ success: false, message: 'Could not add that size' });
  }
});

// @route   PUT /api/seller/products/:id/variants/:variantId
// @desc    Update one size of the caller's own listing
// @access  Private
router.put(
  '/products/:id/variants/:variantId',
  authMiddleware,
  sellerOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      const { shop, product } = await myProduct(req.userId!, req.params.id);
      if (!shop) {
        res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
        return;
      }
      if (!product) {
        res.status(404).json({ success: false, message: 'Product not found' });
        return;
      }

      const blocked = sellingBlockedReason(shop);
      if (blocked) {
        res.status(403).json({ success: false, message: blocked });
        return;
      }

      const { data, errors } = pickSellerVariantFields((req.body ?? {}) as Record<string, unknown>);
      if (errors.length > 0) {
        res.status(400).json({ success: false, message: errors.join('. ') });
        return;
      }
      if (Object.keys(data).length === 0) {
        res.status(400).json({ success: false, message: 'No valid fields provided to update' });
        return;
      }

      // Scoped to the product in the path, which is itself scoped to this
      // shop, so a variant id from anywhere else is simply not found.
      const existing = await prisma.productVariant.findFirst({
        where: { id: req.params.variantId, productId: product.id },
        select: { id: true, quantity: true },
      });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Size not found' });
        return;
      }

      const variant = await prisma.productVariant.update({
        where: { id: existing.id },
        data: data as unknown as Prisma.ProductVariantUncheckedUpdateInput,
      });

      // Restocking a size is what the back-in-stock list is waiting for, and a
      // seller restocking counts for exactly as much as an admin doing it.
      if (existing.quantity <= 0 && variant.quantity > 0) {
        void notifyRestocked(product.id, variant.id);
      }

      res.json({ success: true, message: 'Size updated', data: { variant } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ success: false, message: 'A variant with this SKU already exists' });
        return;
      }
      console.error('[SELLER] variant update failed:', error);
      res.status(500).json({ success: false, message: 'Could not save that size' });
    }
  }
);

// @route   DELETE /api/seller/products/:id/variants/:variantId
// @desc    Remove one size from the caller's own listing
// @access  Private
router.delete(
  '/products/:id/variants/:variantId',
  authMiddleware,
  sellerOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      const { shop, product } = await myProduct(req.userId!, req.params.id);
      if (!shop) {
        res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
        return;
      }
      if (!product) {
        res.status(404).json({ success: false, message: 'Product not found' });
        return;
      }

      const blocked = sellingBlockedReason(shop);
      if (blocked) {
        res.status(403).json({ success: false, message: blocked });
        return;
      }

      const deleted = await prisma.productVariant.deleteMany({
        where: { id: req.params.variantId, productId: product.id },
      });
      if (deleted.count === 0) {
        res.status(404).json({ success: false, message: 'Size not found' });
        return;
      }

      res.json({ success: true, message: 'Size removed' });
    } catch (error) {
      // A variant referenced by an order line cannot be deleted without losing
      // what that order actually contained.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        res.status(409).json({
          success: false,
          message:
            'This size appears on an existing order. Set its stock to 0 instead of deleting it.',
        });
        return;
      }
      console.error('[SELLER] variant delete failed:', error);
      res.status(500).json({ success: false, message: 'Could not remove that size' });
    }
  }
);

// ── Photos ────────────────────────────────────────────────────────────
//
// The image library at `/api/admin/media` is mounted behind `adminOnly`, so
// until now the only way for a seller to put a photo on a listing was to host
// it somewhere else and paste a URL — which is not a thing a seller can do, and
// which would have left the storefront serving images from arbitrary origins.
// This is the same pipeline, reachable by a seller: bytes are held in memory,
// re-encoded by sharp before anything is written, and named after the hash of
// the result, so a file that lies about its type never reaches the disk and the
// same picture uploaded twice reuses one file.

/** The largest edge we keep. Anything bigger is a photo straight off a phone. */
const SELLER_IMAGE_MAX_EDGE = 2400;

const sellerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

// @route   POST /api/seller/media
// @desc    Upload one product photo
// @access  Private
router.post(
  '/media',
  authMiddleware,
  sellerOnly,
  sellerUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const shop = await myShop(req.userId!);
      if (!shop) {
        res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file was uploaded.' });
        return;
      }

      const image = sharp(req.file.buffer, { failOn: 'error' });
      const meta = await image.metadata();
      if (!meta.width || !meta.height) {
        res.status(400).json({ success: false, message: 'That file is not an image.' });
        return;
      }

      const encoded = await image
        .rotate() // honour EXIF orientation before it is stripped
        .resize({
          width: SELLER_IMAGE_MAX_EDGE,
          height: SELLER_IMAGE_MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });

      const hash = createHash('sha256').update(encoded.data).digest('hex').slice(0, 32);
      const filename = `${hash}.webp`;
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const target = path.join(UPLOAD_DIR, filename);
      try {
        await fs.access(target);
      } catch {
        await fs.writeFile(target, encoded.data);
      }

      // The relative path, never a hostname: a stored value that carried one
      // would go stale the moment the API moved.
      const url = `/uploads/${filename}`;

      // The original name is kept only as a label; it never touches the path.
      const asset = await prisma.mediaAsset.upsert({
        where: { hash },
        update: {},
        create: {
          hash,
          url,
          filename: path.basename(req.file.originalname || 'upload').slice(0, 120),
          alt: '',
          width: encoded.info.width,
          height: encoded.info.height,
          bytes: encoded.data.length,
          uploadedById: req.userId!,
        },
        select: { id: true, url: true, width: true, height: true },
      });

      res.status(201).json({ success: true, message: 'Photo uploaded', data: { asset } });
    } catch (error) {
      // sharp throws on anything it cannot decode, which is the common case
      // here: a PDF or a text file renamed to .jpg.
      if (error instanceof Error && /unsupported image|Input buffer/i.test(error.message)) {
        res.status(400).json({ success: false, message: 'That file is not an image we can read.' });
        return;
      }
      console.error('[SELLER] photo upload failed:', error);
      res.status(500).json({ success: false, message: 'Could not upload that photo' });
    }
  }
);

// ── Identity check (KYC) ─────────────────────────────────────────────
//
// A public marketplace pays strangers. Before a shop can be verified, the
// seller submits a PAN (and GSTIN if registered) plus supporting documents,
// and an admin approves or rejects it. Documents go to private storage and are
// only ever streamed back to the shop that uploaded them or to an admin.

const MAX_KYC_DOCUMENTS = 6;

const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

/** Once approved, identity is locked: changing it means asking support. */
const kycLocked = (status: string): boolean => status === 'APPROVED';

// @route   GET /api/seller/kyc
// @desc    The caller's identity-check status
// @access  Seller
router.get('/kyc', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }
    res.json({
      success: true,
      data: {
        kyc: {
          status: shop.kycStatus,
          pan: shop.pan,
          gstin: shop.gstin,
          documents: shop.kycDocuments,
          submittedAt: shop.kycSubmittedAt,
          reviewedAt: shop.kycReviewedAt,
          rejectionReason: shop.kycRejectionReason,
          maxDocuments: MAX_KYC_DOCUMENTS,
        },
      },
    });
  } catch (error) {
    console.error('[SELLER] kyc fetch failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load your verification status' });
  }
});

// @route   POST /api/seller/kyc/documents
// @desc    Upload one identity document (PDF or photo)
// @access  Seller
router.post(
  '/kyc/documents',
  authMiddleware,
  sellerOnly,
  kycUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const shop = await myShop(req.userId!);
      if (!shop) {
        res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
        return;
      }
      if (kycLocked(shop.kycStatus)) {
        res.status(409).json({ success: false, message: 'Your verification is already approved' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file was uploaded.' });
        return;
      }
      if (shop.kycDocuments.length >= MAX_KYC_DOCUMENTS) {
        res.status(400).json({
          success: false,
          message: `You can upload up to ${MAX_KYC_DOCUMENTS} documents. Remove one first.`,
        });
        return;
      }

      const name = await storeKycDocument(shop.id, req.file.buffer);
      const documents = shop.kycDocuments.includes(name)
        ? shop.kycDocuments
        : [...shop.kycDocuments, name];
      await prisma.vendorProfile.update({
        where: { id: shop.id },
        data: { kycDocuments: documents },
      });

      res.status(201).json({ success: true, message: 'Document uploaded', data: { documents } });
    } catch (error) {
      if (isHttpError(error)) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      console.error('[SELLER] kyc upload failed:', error);
      res.status(500).json({ success: false, message: 'Could not upload that document' });
    }
  }
);

// @route   GET /api/seller/kyc/documents/:name
// @desc    View one of the caller's own documents
// @access  Seller
router.get(
  '/kyc/documents/:name',
  authMiddleware,
  sellerOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      const shop = await myShop(req.userId!);
      if (!shop || !shop.kycDocuments.includes(req.params.name)) {
        res.status(404).json({ success: false, message: 'Document not found' });
        return;
      }
      const file = await readKycDocument(shop.id, req.params.name);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(file.bytes);
    } catch (error) {
      if (isHttpError(error)) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      console.error('[SELLER] kyc read failed:', error);
      res.status(500).json({ success: false, message: 'Could not load that document' });
    }
  }
);

// @route   DELETE /api/seller/kyc/documents/:name
// @desc    Remove one of the caller's documents before approval
// @access  Seller
router.delete(
  '/kyc/documents/:name',
  authMiddleware,
  sellerOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      const shop = await myShop(req.userId!);
      if (!shop || !shop.kycDocuments.includes(req.params.name)) {
        res.status(404).json({ success: false, message: 'Document not found' });
        return;
      }
      if (kycLocked(shop.kycStatus)) {
        res.status(409).json({ success: false, message: 'Your verification is already approved' });
        return;
      }
      const documents = shop.kycDocuments.filter((doc) => doc !== req.params.name);
      await prisma.vendorProfile.update({
        where: { id: shop.id },
        data: { kycDocuments: documents },
      });
      await deleteKycDocument(shop.id, req.params.name);
      res.json({ success: true, message: 'Document removed', data: { documents } });
    } catch (error) {
      console.error('[SELLER] kyc delete failed:', error);
      res.status(500).json({ success: false, message: 'Could not remove that document' });
    }
  }
);

// @route   POST /api/seller/kyc/submit
// @desc    Send PAN, GSTIN and documents for review
// @access  Seller
router.post('/kyc/submit', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }
    if (kycLocked(shop.kycStatus)) {
      res.status(409).json({ success: false, message: 'Your verification is already approved' });
      return;
    }

    const { pan, gstin, errors } = validateKyc(req.body ?? {});
    if (shop.kycDocuments.length === 0) {
      errors.push('Upload at least one document, such as your PAN card or GST certificate');
    }
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const updated = await prisma.vendorProfile.update({
      where: { id: shop.id },
      data: {
        pan,
        gstin,
        kycStatus: 'PENDING',
        kycSubmittedAt: new Date(),
        kycReviewedAt: null,
        kycRejectionReason: null,
      },
      select: SHOP_SELECT,
    });

    res.json({
      success: true,
      message: 'Submitted for review. We will let you know once an admin has checked it.',
      data: { shop: shopView(updated) },
    });
  } catch (error) {
    console.error('[SELLER] kyc submit failed:', error);
    res.status(500).json({ success: false, message: 'Could not submit your verification' });
  }
});

// ── Brands ───────────────────────────────────────────────────────────
//
// A shop that sells under a brand name proves it may: either it owns the
// trademark or it holds an authorised-reseller letter. The proof goes to the
// same private storage as KYC documents (it often carries a registration
// number and a signature), and the brand stays PENDING — usable only by this
// shop, with no storefront page — until an admin approves it.

const AUTHORIZATION_TYPES = ['TRADEMARK_OWNER', 'AUTHORISED_RESELLER'] as const;

const BRAND_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logo: true,
  status: true,
  isActive: true,
  authorizationType: true,
  authorizationDoc: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.BrandSelect;

const brandSlug = async (name: string): Promise<string> => {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-')
      .slice(0, 60) || 'brand';
  let slug = base;
  for (let i = 2; await prisma.brand.findUnique({ where: { slug }, select: { id: true } }); i += 1) {
    slug = `${base}-${i}`;
  }
  return slug;
};

// @route   GET /api/seller/brands
// @desc    Brands the caller's shop has registered, with their review status
// @access  Seller
router.get('/brands', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    if (!shop) {
      res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
      return;
    }
    const brands = await prisma.brand.findMany({
      where: { ownerVendorId: shop.id },
      orderBy: { createdAt: 'desc' },
      select: BRAND_SELECT,
    });
    res.json({
      success: true,
      data: {
        // The stored file name is an internal detail; the seller only needs to
        // know a document is on file.
        brands: brands.map(({ authorizationDoc, ...brand }) => ({ ...brand, hasDocument: Boolean(authorizationDoc) })),
      },
    });
  } catch (error) {
    console.error('[SELLER] brands list failed:', error);
    res.status(500).json({ success: false, message: 'Could not load your brands' });
  }
});

// @route   POST /api/seller/brands
// @desc    Register a brand (multipart: name, description?, logo?, authorizationType, document)
// @access  Seller
//
// Sending the name of a brand this shop already registered — including one
// added from the listing form, or one that was rejected — resubmits it with
// the new proof rather than refusing it as a duplicate.
router.post(
  '/brands',
  authMiddleware,
  sellerOnly,
  kycUpload.single('document'),
  async (req: AuthRequest, res: Response) => {
    try {
      const shop = await myShop(req.userId!);
      if (!shop) {
        res.status(404).json({ success: false, message: 'You do not have a seller account yet' });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const errors: string[] = [];
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
      if (name.length < 2) errors.push('Enter the brand name (at least 2 characters)');
      const authorizationType = AUTHORIZATION_TYPES.find((t) => t === body.authorizationType);
      if (!authorizationType) {
        errors.push('Say whether you own the trademark or are an authorised reseller');
      }
      const description =
        typeof body.description === 'string' && body.description.trim()
          ? body.description.trim().slice(0, 2000)
          : null;
      const logo = typeof body.logo === 'string' && body.logo.trim() ? body.logo.trim().slice(0, 2000) : null;
      if (!req.file) {
        errors.push(
          authorizationType === 'AUTHORISED_RESELLER'
            ? 'Upload the authorised-reseller letter from the brand owner'
            : 'Upload your trademark registration certificate'
        );
      }
      if (errors.length > 0) {
        res.status(400).json({ success: false, message: errors.join('. ') });
        return;
      }

      const existing = await prisma.brand.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true, ownerVendorId: true, status: true, authorizationDoc: true },
      });
      if (existing && (existing.ownerVendorId !== shop.id || existing.status === 'APPROVED')) {
        res.status(409).json({
          success: false,
          message:
            existing.ownerVendorId === shop.id
              ? 'That brand is already approved for your shop'
              : 'That brand is already registered on Tailorae. Contact us if it is yours.',
        });
        return;
      }

      const document = await storeKycDocument(shop.id, req.file!.buffer);
      const fields = {
        description,
        logo,
        authorizationType: authorizationType!,
        authorizationDoc: document,
        status: 'PENDING' as const,
        isActive: false,
        rejectionReason: null,
      };

      const brand = existing
        ? await prisma.brand.update({ where: { id: existing.id }, data: fields, select: BRAND_SELECT })
        : await prisma.brand.create({
            data: { ...fields, name, slug: await brandSlug(name), ownerVendorId: shop.id },
            select: BRAND_SELECT,
          });

      // A replaced proof is not kept around.
      if (existing?.authorizationDoc && existing.authorizationDoc !== document) {
        await deleteKycDocument(shop.id, existing.authorizationDoc);
      }

      await prisma.auditLog.create({
        data: {
          userId: req.userId ?? null,
          action: existing ? 'RESUBMIT' : 'CREATE',
          resource: 'Brand',
          resourceId: brand.id,
          newValue: { name: brand.name, authorizationType, via: 'seller-brands' },
          ipAddress: req.ip ?? null,
        },
      });

      const { authorizationDoc: _doc, ...view } = brand;
      res.status(existing ? 200 : 201).json({
        success: true,
        message:
          'Brand submitted for review. You can list under it while you wait; it gets a storefront page once approved.',
        data: { brand: { ...view, hasDocument: true } },
      });
    } catch (error) {
      if (isHttpError(error)) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ success: false, message: 'That brand name is already taken' });
        return;
      }
      console.error('[SELLER] brand register failed:', error);
      res.status(500).json({ success: false, message: 'Could not register that brand' });
    }
  }
);

// @route   GET /api/seller/brands/:id/document
// @desc    View the authorization document of one of the caller's brands
// @access  Seller
router.get('/brands/:id/document', authMiddleware, sellerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await myShop(req.userId!);
    const brand = shop
      ? await prisma.brand.findFirst({
          where: { id: req.params.id, ownerVendorId: shop.id },
          select: { authorizationDoc: true },
        })
      : null;
    if (!shop || !brand?.authorizationDoc) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }
    const file = await readKycDocument(shop.id, brand.authorizationDoc);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.bytes);
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[SELLER] brand document failed:', error);
    res.status(500).json({ success: false, message: 'Could not load that document' });
  }
});

export default router;
