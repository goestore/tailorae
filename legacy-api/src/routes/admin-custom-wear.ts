import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { parsePagination } from '@/utils/helpers';
import { QUOTE_STATUSES, isQuoteStatus } from '@/utils/custom-wear';

/**
 * Admin — Custom Wear quote requests.
 *
 * The team works each request from NEW through CONTACTED and QUOTED to WON or
 * LOST, recording the price they quoted and private notes. Every change writes
 * an audit row.
 */

const router = Router();
router.use(authMiddleware, adminOnly);

// @route   GET /api/admin/custom-wear/quotes?status=&search=&page=&limit=
router.get('/quotes', async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 25, 100);
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';

    const searchWhere: Prisma.CustomWearQuoteWhereInput = search
      ? {
          OR: [
            { reference: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { company: { contains: search, mode: 'insensitive' } },
            { customerName: { contains: search, mode: 'insensitive' } },
            { productName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const where: Prisma.CustomWearQuoteWhereInput = {
      ...searchWhere,
      ...(isQuoteStatus(status) ? { status } : {}),
    };

    const [quotes, total, grouped] = await Promise.all([
      prisma.customWearQuote.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.customWearQuote.count({ where }),
      // Counts follow the search but not the status tab, so every tab shows
      // how many it would hold.
      prisma.customWearQuote.groupBy({ by: ['status'], where: searchWhere, _count: { _all: true } }),
    ]);

    const counts: Record<string, number> = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, 0]));
    let all = 0;
    for (const row of grouped) {
      counts[row.status] = row._count._all;
      all += row._count._all;
    }

    res.json({
      success: true,
      data: {
        quotes,
        counts: { ...counts, ALL: all },
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      },
    });
  } catch (error) {
    console.error('[admin/custom-wear] list failed:', error);
    res.status(500).json({ success: false, message: 'Could not load quote requests.' });
  }
});

// @route   GET /api/admin/custom-wear/quotes/:id   (id or reference)
router.get('/quotes/:id', async (req: AuthRequest, res: Response) => {
  try {
    const key = String(req.params.id);
    const quote = await prisma.customWearQuote.findFirst({
      where: { OR: [{ id: key }, { reference: key.toUpperCase() }] },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    if (!quote) {
      res.status(404).json({ success: false, message: 'Quote not found' });
      return;
    }
    res.json({ success: true, data: { quote } });
  } catch (error) {
    console.error('[admin/custom-wear] get failed:', error);
    res.status(500).json({ success: false, message: 'Could not load that quote.' });
  }
});

// @route   PATCH /api/admin/custom-wear/quotes/:id
// @body    { status?, quotedPrice?: number|null, adminNotes?: string|null }
router.patch('/quotes/:id', async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.CustomWearQuoteUpdateInput = {};

    if (body.status !== undefined) {
      if (!isQuoteStatus(body.status)) {
        res.status(400).json({ success: false, message: `Status must be one of ${QUOTE_STATUSES.join(', ')}` });
        return;
      }
      data.status = body.status;
    }
    if (body.quotedPrice !== undefined) {
      if (body.quotedPrice === null || body.quotedPrice === '') {
        data.quotedPrice = null;
      } else {
        const price = Number(body.quotedPrice);
        if (!Number.isFinite(price) || price < 0 || price > 100_000_000) {
          res.status(400).json({ success: false, message: 'Quoted price must be a positive amount.' });
          return;
        }
        data.quotedPrice = Math.round(price * 100) / 100;
      }
    }
    if (body.adminNotes !== undefined) {
      if (body.adminNotes !== null && typeof body.adminNotes !== 'string') {
        res.status(400).json({ success: false, message: 'Notes must be text.' });
        return;
      }
      const notes = typeof body.adminNotes === 'string' ? body.adminNotes.trim().slice(0, 5000) : '';
      data.adminNotes = notes || null;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'Nothing to update.' });
      return;
    }

    const existing = await prisma.customWearQuote.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Quote not found' });
      return;
    }

    const quote = await prisma.$transaction(async (tx) => {
      const updated = await tx.customWearQuote.update({ where: { id: existing.id }, data });
      await tx.auditLog.create({
        data: {
          userId: req.userId ?? null,
          action: 'UPDATE',
          resource: 'CustomWearQuote',
          resourceId: existing.id,
          oldValue: {
            status: existing.status,
            quotedPrice: existing.quotedPrice,
            adminNotes: existing.adminNotes,
          },
          newValue: {
            status: updated.status,
            quotedPrice: updated.quotedPrice,
            adminNotes: updated.adminNotes,
          },
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
        },
      });
      return updated;
    });

    res.json({ success: true, message: 'Quote updated', data: { quote } });
  } catch (error) {
    console.error('[admin/custom-wear] update failed:', error);
    res.status(500).json({ success: false, message: 'Could not update that quote.' });
  }
});

export default router;
