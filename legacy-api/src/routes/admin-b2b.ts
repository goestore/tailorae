import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { parseDateInput, parsePagination, round2 } from '@/utils/helpers';
import { expireStaleQuotes, withProducts } from '@/routes/b2b';

/*
 * Admin side of wholesale: answer quote requests, verify business profiles,
 * move bulk orders along. Mounted at /api/admin/b2b.
 *
 * Verifying a profile is what grants the B2B_BUYER role (wholesale tier
 * pricing on bulk orders, trade-only coupons) — and only to a
 * RETAIL_CUSTOMER; admins and vendors keep their role. Unverifying takes
 * B2B_BUYER back. authMiddleware reads the role from the database on every
 * request, so either change is in force on the buyer's next request without
 * a new token.
 */

const router = Router();
router.use(authMiddleware, adminOnly);

const RFQ_STATUSES = ['PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
const BULK_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
const DEFAULT_QUOTE_DAYS = 14;

const PROFILE_SUMMARY = {
  id: true,
  companyName: true,
  businessType: true,
  gstNumber: true,
  panNumber: true,
  isVerified: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true } },
} satisfies Prisma.B2BProfileSelect;

const audit = (
  req: AuthRequest,
  action: string,
  resource: string,
  resourceId: string,
  oldValue: Prisma.InputJsonValue,
  newValue: Prisma.InputJsonValue
) =>
  prisma.auditLog.create({
    data: {
      userId: req.userId ?? null,
      action,
      resource,
      resourceId,
      oldValue,
      newValue,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
    },
  });

/** Count of rows per status, every known status present. */
const countsBy = <S extends string>(
  statuses: readonly S[],
  groups: Array<{ status: string; _count: { _all: number } }>
): Record<S, number> => {
  const counts = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<S, number>;
  for (const g of groups) if ((statuses as readonly string[]).includes(g.status)) counts[g.status as S] = g._count._all;
  return counts;
};

// @route   GET /api/admin/b2b/rfqs?status=PENDING&page=1&limit=50
router.get('/rfqs', async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    if (status && !(RFQ_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ success: false, message: `status must be one of ${RFQ_STATUSES.join(', ')}` });
      return;
    }
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 50, 100);

    await expireStaleQuotes();
    const where: Prisma.RFQWhereInput = status ? { status } : {};
    const [rows, total, groups] = await Promise.all([
      prisma.rFQ.findMany({
        where,
        // Oldest pending first so the longest wait is answered next; others newest first.
        orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
        skip,
        take: limit,
        include: { b2bProfile: { select: PROFILE_SUMMARY } },
      }),
      prisma.rFQ.count({ where }),
      prisma.rFQ.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    res.json({
      success: true,
      message: 'RFQs fetched',
      data: {
        rfqs: await withProducts(rows),
        counts: countsBy(RFQ_STATUSES, groups),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('[ADMIN B2B] list RFQs failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch RFQs' });
  }
});

// @route   PATCH /api/admin/b2b/rfqs/:id
// @body    { status: 'QUOTED', quotedPrice, expiryDate?, notes? } | { status: 'REJECTED', notes? }
router.patch('/rfqs/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status, quotedPrice, notes, expiryDate } = req.body ?? {};
    if (status !== 'QUOTED' && status !== 'REJECTED') {
      res.status(400).json({ success: false, message: "status must be 'QUOTED' or 'REJECTED'" });
      return;
    }
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      res.status(400).json({ success: false, message: 'notes must be text' });
      return;
    }
    if (typeof notes === 'string' && notes.length > 2000) {
      res.status(400).json({ success: false, message: 'notes must be 2000 characters or fewer' });
      return;
    }

    let price: number | null = null;
    let expiry: Date | null = null;
    if (status === 'QUOTED') {
      const num = Number(quotedPrice);
      if (quotedPrice === undefined || quotedPrice === null || quotedPrice === '' || !Number.isFinite(num) || num <= 0) {
        res.status(400).json({ success: false, message: 'A quote needs a unit price greater than zero' });
        return;
      }
      price = round2(num);
      if (expiryDate !== undefined && expiryDate !== null && expiryDate !== '') {
        const parsed = parseDateInput(expiryDate);
        if (!parsed) {
          res.status(400).json({ success: false, message: 'expiryDate must be a valid date' });
          return;
        }
        if (parsed.getTime() <= Date.now()) {
          res.status(400).json({ success: false, message: 'The quote must expire in the future' });
          return;
        }
        expiry = parsed;
      } else {
        expiry = new Date(Date.now() + DEFAULT_QUOTE_DAYS * 24 * 60 * 60 * 1000);
      }
    } else if (!(typeof notes === 'string' && notes.trim())) {
      res.status(400).json({ success: false, message: 'Add a note telling the buyer why the request was declined' });
      return;
    }

    const rfq = await prisma.rFQ.findUnique({ where: { id: String(req.params.id) } });
    if (!rfq) {
      res.status(404).json({ success: false, message: 'RFQ not found' });
      return;
    }
    // A buyer's answer is final; everything before it can be (re)quoted or declined.
    if (rfq.status === 'ACCEPTED' || rfq.status === 'REJECTED') {
      res.status(409).json({ success: false, message: `This RFQ is already ${rfq.status.toLowerCase()}` });
      return;
    }

    const data: Prisma.RFQUpdateManyMutationInput =
      status === 'QUOTED'
        ? {
            status,
            quotedPrice: price,
            expiryDate: expiry,
            quotedBy: req.userId ?? null,
            quotedDate: new Date(),
            ...(notes !== undefined ? { notes: typeof notes === 'string' ? notes.trim() || null : null } : {}),
          }
        : {
            status,
            quotedBy: req.userId ?? null,
            quotedDate: new Date(),
            notes: (notes as string).trim(),
          };

    // Conditional on the status read above, so a buyer accepting at the same
    // moment is not silently overwritten.
    const changed = await prisma.rFQ.updateMany({ where: { id: rfq.id, status: rfq.status }, data });
    if (changed.count === 0) {
      res.status(409).json({ success: false, message: 'This RFQ changed while you were editing it. Reload and try again.' });
      return;
    }
    const updated = await prisma.rFQ.findUniqueOrThrow({
      where: { id: rfq.id },
      include: { b2bProfile: { select: PROFILE_SUMMARY } },
    });

    await audit(
      req,
      status === 'QUOTED' ? 'RFQ_QUOTE' : 'RFQ_REJECT',
      'RFQ',
      rfq.id,
      { status: rfq.status, quotedPrice: rfq.quotedPrice, expiryDate: rfq.expiryDate?.toISOString() ?? null },
      { status: updated.status, quotedPrice: updated.quotedPrice, expiryDate: updated.expiryDate?.toISOString() ?? null, notes: updated.notes }
    );

    const [withProduct] = await withProducts([updated]);
    res.json({
      success: true,
      message: status === 'QUOTED' ? `Quote sent for ${rfq.rfqNumber}` : `${rfq.rfqNumber} declined`,
      data: { rfq: withProduct },
    });
  } catch (error) {
    console.error('[ADMIN B2B] quote RFQ failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update RFQ' });
  }
});

// @route   GET /api/admin/b2b/profiles?verified=true|false&q=
router.get('/profiles', async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 50, 100);
    const where: Prisma.B2BProfileWhereInput = {};
    if (req.query.verified === 'true') where.isVerified = true;
    else if (req.query.verified === 'false') where.isVerified = false;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      where.OR = [
        { companyName: { contains: q, mode: 'insensitive' } },
        { gstNumber: { contains: q.toUpperCase() } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [profiles, total, verified, unverified] = await Promise.all([
      prisma.b2BProfile.findMany({
        where,
        orderBy: [{ isVerified: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, status: true } },
          _count: { select: { rfqs: true, bulkOrders: true } },
        },
      }),
      prisma.b2BProfile.count({ where }),
      prisma.b2BProfile.count({ where: { isVerified: true } }),
      prisma.b2BProfile.count({ where: { isVerified: false } }),
    ]);

    res.json({
      success: true,
      message: 'Profiles fetched',
      data: {
        profiles,
        counts: { verified, unverified },
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('[ADMIN B2B] list profiles failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profiles' });
  }
});

// @route   PATCH /api/admin/b2b/profiles/:id   { isVerified: boolean }
router.patch('/profiles/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { isVerified } = req.body ?? {};
    if (typeof isVerified !== 'boolean') {
      res.status(400).json({ success: false, message: 'isVerified must be true or false' });
      return;
    }

    const profile = await prisma.b2BProfile.findUnique({
      where: { id: String(req.params.id) },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!profile) {
      res.status(404).json({ success: false, message: 'Profile not found' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.b2BProfile.update({ where: { id: profile.id }, data: { isVerified } });
      // Role follows verification, but only ever between these two roles.
      await tx.user.updateMany({
        where: isVerified
          ? { id: profile.userId, role: 'RETAIL_CUSTOMER' }
          : { id: profile.userId, role: 'B2B_BUYER' },
        data: { role: isVerified ? 'B2B_BUYER' : 'RETAIL_CUSTOMER' },
      });
      return tx.b2BProfile.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, status: true } },
          _count: { select: { rfqs: true, bulkOrders: true } },
        },
      });
    });

    await audit(
      req,
      isVerified ? 'B2B_VERIFY' : 'B2B_UNVERIFY',
      'B2BProfile',
      profile.id,
      { isVerified: profile.isVerified, role: profile.user.role },
      { isVerified: updated.isVerified, role: updated.user.role }
    );

    res.json({
      success: true,
      message: isVerified
        ? `${updated.companyName} verified${updated.user.role === 'B2B_BUYER' ? ' — wholesale pricing unlocked' : ''}`
        : `${updated.companyName} marked unverified`,
      data: { profile: updated },
    });
  } catch (error) {
    console.error('[ADMIN B2B] verify profile failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// @route   GET /api/admin/b2b/bulk-orders?status=
router.get('/bulk-orders', async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    if (status && !(BULK_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ success: false, message: `status must be one of ${BULK_STATUSES.join(', ')}` });
      return;
    }
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 50, 100);
    const where: Prisma.BulkOrderWhereInput = status ? { status } : {};
    const [rows, total, groups] = await Promise.all([
      prisma.bulkOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { b2bProfile: { select: PROFILE_SUMMARY } },
      }),
      prisma.bulkOrder.count({ where }),
      prisma.bulkOrder.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    res.json({
      success: true,
      message: 'Bulk orders fetched',
      data: {
        bulkOrders: await withProducts(rows),
        counts: countsBy(BULK_STATUSES, groups),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('[ADMIN B2B] list bulk orders failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bulk orders' });
  }
});

// @route   PATCH /api/admin/b2b/bulk-orders/:id   { status }
router.patch('/bulk-orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status.toUpperCase() : '';
    if (!(BULK_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ success: false, message: `status must be one of ${BULK_STATUSES.join(', ')}` });
      return;
    }
    const order = await prisma.bulkOrder.findUnique({ where: { id: String(req.params.id) } });
    if (!order) {
      res.status(404).json({ success: false, message: 'Bulk order not found' });
      return;
    }
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
      res.status(409).json({ success: false, message: `This order is already ${order.status.toLowerCase()}` });
      return;
    }
    if (order.status === status) {
      res.status(400).json({ success: false, message: `Order is already ${status.toLowerCase()}` });
      return;
    }

    const updated = await prisma.bulkOrder.update({ where: { id: order.id }, data: { status } });
    await audit(req, 'BULK_ORDER_STATUS', 'BulkOrder', order.id, { status: order.status }, { status });

    res.json({ success: true, message: `${order.orderNumber} is now ${status.toLowerCase()}`, data: { bulkOrder: updated } });
  } catch (error) {
    console.error('[ADMIN B2B] update bulk order failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update bulk order' });
  }
});

export default router;
