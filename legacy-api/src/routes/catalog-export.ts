import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, adminOnly } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { findArticleType } from '@/utils/product-spec';
import { buildMyntraWorkbook, type ExportProduct } from '@/utils/myntra-export';

/**
 * Exporting listings as Myntra SKU templates.
 *
 * Mounted at /api/admin/products/export ahead of the general admin router, so
 * `/myntra` is never read as a product id.
 */

const router = Router();
router.use(authMiddleware, adminOnly);

/** Where relative /uploads paths are served from, for Myntra to fetch images. */
function assetBase(req: Request): string {
  const configured = process.env.PUBLIC_API_URL || process.env.BACKEND_URL || process.env.API_URL;
  if (configured) return configured.replace(/\/api\/?$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** The shared filter: selected ids and/or one seller ("house" = the store's own). */
function scopeWhere(query: Request['query']): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (typeof query.ids === 'string' && query.ids.trim()) {
    const ids = query.ids.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 2000);
    where.id = { in: ids };
  }
  const vendorId = typeof query.vendorId === 'string' ? query.vendorId.trim() : '';
  if (vendorId === 'house') where.vendorId = null;
  else if (vendorId) where.vendorId = vendorId;
  return where;
}

/**
 * @route GET /api/admin/products/export/myntra/counts?ids=&vendorId=
 * @description How many listings of each article type the export would include
 * @access Admin only
 */
router.get('/myntra/counts', async (req: Request, res: Response) => {
  try {
    const groups = await prisma.product.groupBy({
      by: ['articleType'],
      where: { ...scopeWhere(req.query), articleType: { not: null } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const group of groups) {
      if (group.articleType) counts[group.articleType] = group._count._all;
    }
    res.json({ success: true, data: { counts } });
  } catch (error) {
    console.error('[EXPORT] counts failed:', error);
    res.status(500).json({ success: false, message: 'Could not count listings' });
  }
});

/**
 * @route GET /api/admin/products/export/myntra?articleType=&ids=&vendorId=
 * @description One template workbook of every matching product, one row per size
 * @access Admin only
 */
router.get('/myntra', async (req: Request, res: Response) => {
  try {
    const spec = findArticleType(typeof req.query.articleType === 'string' ? req.query.articleType : '');
    if (!spec) {
      res.status(400).json({ success: false, message: 'Choose an article type to export' });
      return;
    }

    const where: Prisma.ProductWhereInput = { ...scopeWhere(req.query), articleType: spec.articleType };

    const products = await prisma.product.findMany({
      where,
      include: {
        brand: { select: { name: true } },
        variants: { orderBy: [{ createdAt: 'asc' }, { sku: 'asc' }] },
      },
      orderBy: [{ sku: 'asc' }],
      take: 5000,
    });

    if (products.length === 0) {
      res.status(404).json({ success: false, message: `No ${spec.articleType} listings match` });
      return;
    }

    // Myntra has one article number, one brand colour and one set of photos
    // per colour. A listing holding several colours would go out with every
    // colour under the first one's article number and colour, so it is left
    // out and named instead. ("Add another colour" lists each colour on its
    // own, linked by a colour group.)
    const colourCount = (p: (typeof products)[number]) =>
      new Set(p.variants.map((v) => (v.color ?? '').trim().toLowerCase()).filter(Boolean)).size;
    const mixed = products.filter((p) => colourCount(p) > 1);
    const exportable = products.filter((p) => colourCount(p) <= 1);
    if (exportable.length === 0) {
      res.status(409).json({
        success: false,
        message: `Nothing to export: ${mixed.map((p) => p.sku).join(', ')} hold${mixed.length === 1 ? 's' : ''} several colours in one listing. Myntra needs one listing per colour — use “Add another colour”.`,
      });
      return;
    }

    const { workbook, rows } = await buildMyntraWorkbook(
      spec,
      exportable as unknown as ExportProduct[],
      assetBase(req)
    );

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="myntra-${spec.slug}-${date}.xlsx"`);
    res.setHeader('X-Export-Rows', String(rows));
    res.setHeader('X-Export-Skipped', mixed.map((p) => p.sku).join(',').slice(0, 2000));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Rows, X-Export-Skipped');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[EXPORT] myntra export failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Could not build the Myntra sheet' });
    } else {
      res.end();
    }
  }
});

export default router;
