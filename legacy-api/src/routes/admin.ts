import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  SellerApplicationStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import {
  ensureDefaultCustomizations,
  guardCustomizable,
  parseCustomizationRows,
  replaceCustomizations,
} from '@/utils/customizations';
import {
  HttpError,
  formatRupees,
  isHttpError,
  isNonEmptyString,
  parseDateInput,
  parsePagination,
  pickProductFields,
  sanitizeUser,
} from '@/utils/helpers';
import { notifyRestocked, sendOrderStatusUpdate } from '@/services/notifications';
import { revalidateCatalog } from '@/utils/revalidate';
import {
  KNOWN_COLUMNS,
  parseCatalogCsv,
  slugify as slugifyName,
  toCsv,
  type ParsedProduct,
} from '@/utils/catalog-csv';
import {
  applyOrderStatus,
  cancelOrder,
  checkAdminTransition,
  completeReturn,
} from '@/utils/order-status';
import { heldWhere, holdReason, payableWhere } from '@/utils/settlement';
import {
  balance as ledgerBalance,
  balances as ledgerBalances,
  lockVendorLedger,
  markCreditedSettled,
  postAdjustment,
  postPayout,
  statement as ledgerStatement,
  statementCsv,
  syncSales,
} from '@/utils/ledger';
import { describeDuplicate, pickCompanyFields, uniqueProductSlug, uniqueShopSlug } from '@/utils/vendor';
import { getSettings, setSetting } from '@/utils/settings';
import { decryptField, last4 } from '@/utils/field-crypto';
import { readKycDocument } from '@/utils/private-files';
import { recomputeProductRating } from '@/utils/ratings';
import {
  isLiveCheckError,
  missingForLive,
  pickVariantListingFields,
  prepareListingWrite,
  templateInfo,
  type ListingSnapshot,
} from '@/utils/product-spec';
import { CATEGORY_SELECT, buildCategoryTree, flattenTree, wouldCreateCycle } from '@/utils/category-tree';
import { categoryColumns, cleanOptions, invalidateCategoryFields } from '@/utils/category-fields';

const router = Router();

// authMiddleware must run before adminOnly so req.user is populated;
// applying both router-wide guards every admin route.
router.use(authMiddleware, adminOnly);

/** Whitelist + validate coupon fields from a request body. */
const pickCouponFields = (
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  if (body.code !== undefined) {
    if (!isNonEmptyString(body.code)) errors.push('code must be a non-empty string');
    else data.code = body.code.trim().toUpperCase();
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      errors.push('description must be a string');
    } else {
      data.description = body.description;
    }
  }
  if (body.discountType !== undefined) {
    if (body.discountType !== 'PERCENTAGE' && body.discountType !== 'FIXED_AMOUNT') {
      errors.push('discountType must be PERCENTAGE or FIXED_AMOUNT');
    } else {
      data.discountType = body.discountType;
    }
  }
  for (const field of ['discountValue', 'minOrderAmount', 'maxDiscount'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null && field === 'maxDiscount') {
      data[field] = null;
      continue;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) errors.push(`${field} must be a non-negative number`);
    else data[field] = num;
  }
  for (const field of ['usageLimit', 'perUserLimit'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null && field === 'usageLimit') {
      data[field] = null;
      continue;
    }
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) errors.push(`${field} must be a non-negative integer`);
    else data[field] = num;
  }
  for (const field of ['startDate', 'endDate'] as const) {
    if (body[field] === undefined) continue;
    const date = parseDateInput(body[field]);
    if (date === null || date === undefined) errors.push(`${field} must be a valid date`);
    else data[field] = date;
  }
  for (const field of ['isActive', 'requireB2B'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') errors.push(`${field} must be a boolean`);
    else data[field] = value;
  }
  for (const field of ['applicableCategories', 'applicableProducts'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      errors.push(`${field} must be an array of strings`);
    } else {
      data[field] = value;
    }
  }

  return { data, errors };
};

/** Whitelist + validate banner fields from a request body. */
const pickBannerFields = (
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const field of ['title', 'image', 'position', 'type'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (!isNonEmptyString(value)) errors.push(`${field} must be a non-empty string`);
    else data[field] = value.trim();
  }
  for (const field of ['subtitle', 'imageAlt', 'link'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string') errors.push(`${field} must be a string`);
    else data[field] = value;
  }
  if (body.displayOrder !== undefined) {
    const num = Number(body.displayOrder);
    if (!Number.isInteger(num)) errors.push('displayOrder must be an integer');
    else data.displayOrder = num;
  }
  for (const field of ['startDate', 'endDate'] as const) {
    if (body[field] === undefined) continue;
    if (body[field] === null) {
      data[field] = null;
      continue;
    }
    const date = parseDateInput(body[field]);
    if (date === null || date === undefined) errors.push(`${field} must be a valid date`);
    else data[field] = date;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') errors.push('isActive must be a boolean');
    else data.isActive = body.isActive;
  }

  return { data, errors };
};

/**
 * @route GET /admin/dashboard
 * @description Get admin dashboard with analytics
 * @access Admin only
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const [totalUsers, totalProducts, totalOrders, paidRevenue, codPending, pendingOrders, recentOrders] =
      await Promise.all([
        prisma.user.count(),
        prisma.product.count(),
        prisma.order.count(),
        prisma.order.aggregate({ _sum: { total: true }, where: { paymentStatus: 'PAID' } }),
        prisma.order.aggregate({
          _sum: { total: true },
          where: { paymentStatus: 'PENDING', paymentMethod: 'COD' },
        }),
        prisma.order.count({ where: { status: 'PENDING' } }),
        prisma.order.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        }),
      ]);

    /**
     * The panels the dashboard actually draws. Split from the counts above so
     * the six KPI tiles still render if one of these heavier reads is slow.
     *
     * `revenueByDay` is computed in JS from one window of orders rather than as
     * a grouped SQL query: Prisma's groupBy cannot bucket a timestamp to a day,
     * and a week of orders is a small set to read.
     */
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);

    const [customers, missingImages, weekOrders, lowStock, soldByProduct] = await Promise.all([
      prisma.user.count({ where: { role: { in: ['RETAIL_CUSTOMER', 'B2B_BUYER'] } } }),
      // A product with no photograph cannot be sold; this is a to-do list.
      prisma.product.count({
        where: { status: 'ACTIVE', thumbnail: null, images: { isEmpty: true } },
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: weekStart }, paymentStatus: 'PAID' },
        select: { total: true, createdAt: true },
      }),
      prisma.product.findMany({
        where: { status: 'ACTIVE', quantity: { lt: 10 } },
        select: { id: true, name: true, quantity: true },
        orderBy: { quantity: 'asc' },
        take: 6,
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            status: { in: ['CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'DELIVERED'] },
          },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    // One bucket per day for the last seven, including the days with no sales —
    // a sparkline that silently skips empty days misreports the shape.
    const revenueByDay = Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + offset);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const revenue = weekOrders
        .filter((order) => order.createdAt >= day && order.createdAt < next)
        .reduce((sum, order) => sum + order.total, 0);
      return { date: day.toISOString().slice(0, 10), revenue };
    });

    const topProductRows = soldByProduct.length
      ? await prisma.product.findMany({
          where: { id: { in: soldByProduct.map((row) => row.productId) } },
          select: { id: true, name: true, price: true, category: { select: { name: true } } },
        })
      : [];

    const topProducts = soldByProduct
      .map((row) => {
        const product = topProductRows.find((candidate) => candidate.id === row.productId);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          price: product.price,
          category: product.category?.name ?? '—',
          unitsSold: row._sum.quantity ?? 0,
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      message: 'Dashboard fetched',
      data: {
        stats: {
          totalUsers,
          totalCustomers: customers,
          totalProducts,
          totalOrders,
          totalRevenue: paidRevenue._sum.total ?? 0,
          codPendingRevenue: codPending._sum.total ?? 0,
          pendingOrders,
          missingImages,
        },
        revenueByDay,
        lowStock,
        topProducts,
        recentOrders,
      },
    });
  } catch (error) {
    console.error('[ADMIN] dashboard failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard' });
  }
});

/**
 * @route GET /admin/users
 * @description Get all users with filtering and pagination
 * @access Admin only
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { search, role, status } = req.query;
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 20, 100);

    const where: Prisma.UserWhereInput = {};
    if (typeof search === 'string' && search.trim().length > 0) {
      where.OR = [
        { email: { contains: search.trim(), mode: 'insensitive' } },
        { firstName: { contains: search.trim(), mode: 'insensitive' } },
        { lastName: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    if (typeof role === 'string' && role.length > 0) {
      if (!(Object.values(UserRole) as string[]).includes(role)) {
        res.status(400).json({ success: false, message: 'Invalid role filter' });
        return;
      }
      where.role = role as UserRole;
    }
    // Filtering has to reach the database. The console holds one page at a
    // time, so narrowing in the browser would only ever narrow that page and
    // quietly hide every match sitting on the next one.
    if (typeof status === 'string' && status.length > 0) {
      if (!(Object.values(UserStatus) as string[]).includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status filter' });
        return;
      }
      where.status = status as UserStatus;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      message: 'Users fetched',
      data: {
        users: users.map(sanitizeUser),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('[ADMIN] users list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

/**
 * @route GET /admin/users/:id
 * @description Get user details
 * @access Admin only
 */
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { b2bProfile: true, vendorProfile: true },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({
      success: true,
      message: 'User fetched',
      data: { user: sanitizeUser(user) },
    });
  } catch (error) {
    console.error('[ADMIN] user get failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

/**
 * @route PUT /admin/users/:id
 * @description Update user role or status (whitelist only)
 * @access Admin only
 */
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { role, status } = req.body ?? {};
    const data: Prisma.UserUpdateInput = {};

    if (role !== undefined) {
      if (typeof role !== 'string' || !(Object.values(UserRole) as string[]).includes(role)) {
        res.status(400).json({
          success: false,
          message: `role must be one of: ${Object.values(UserRole).join(', ')}`,
        });
        return;
      }
      data.role = role as UserRole;
    }
    if (status !== undefined) {
      if (typeof status !== 'string' || !(Object.values(UserStatus) as string[]).includes(status)) {
        res.status(400).json({
          success: false,
          message: `status must be one of: ${Object.values(UserStatus).join(', ')}`,
        });
        return;
      }
      data.status = status as UserStatus;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'Provide role and/or status to update' });
      return;
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data });

    res.json({
      success: true,
      message: 'User updated',
      data: { user: sanitizeUser(user) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    console.error('[ADMIN] user update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

/**
 * @route DELETE /admin/users/:id
 * @description Deactivate user (soft delete: status INACTIVE)
 * @access Admin only
 */
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'INACTIVE' },
    });

    res.json({
      success: true,
      message: 'User deactivated',
      data: { user: sanitizeUser(user) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    console.error('[ADMIN] user delete failed:', error);
    res.status(500).json({ success: false, message: 'Failed to deactivate user' });
  }
});

/**
 * Stock bands shared by the list filter, the row chip and the health chart, so
 * the three can never disagree about what "low" means.
 *
 * A product with sizes is judged by its sizes: sold out when every size is,
 * low when any size is running down. A product without sizes uses its own
 * quantity.
 */
const LOW_STOCK_LIMIT = 10;

const STOCK_WHERE: Record<string, Prisma.ProductWhereInput> = {
  out: {
    OR: [
      { variants: { none: {} }, quantity: { lte: 0 } },
      { variants: { some: {}, every: { quantity: { lte: 0 } } } },
    ],
  },
  low: {
    OR: [
      { variants: { none: {} }, quantity: { gt: 0, lte: LOW_STOCK_LIMIT } },
      { variants: { some: { quantity: { gt: 0, lte: LOW_STOCK_LIMIT } } } },
    ],
  },
  healthy: {
    OR: [
      { variants: { none: {} }, quantity: { gt: LOW_STOCK_LIMIT } },
      { variants: { some: {}, every: { quantity: { gt: LOW_STOCK_LIMIT } } } },
    ],
  },
};

type StockBand = 'healthy' | 'low' | 'out';

function stockBand(quantity: number, variants: Array<{ quantity: number }>): StockBand {
  if (variants.length === 0) {
    if (quantity <= 0) return 'out';
    return quantity <= LOW_STOCK_LIMIT ? 'low' : 'healthy';
  }
  if (variants.every((v) => v.quantity <= 0)) return 'out';
  return variants.some((v) => v.quantity > 0 && v.quantity <= LOW_STOCK_LIMIT) ? 'low' : 'healthy';
}

const PRODUCT_SORTS: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name: { name: 'asc' },
  'price-asc': { price: 'asc' },
  'price-desc': { price: 'desc' },
  'stock-asc': { quantity: 'asc' },
  updated: { updatedAt: 'desc' },
};

/** Build the list filter from the query string. Unknown values are ignored. */
function productListWhere(query: Record<string, unknown>): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  const text = (key: string) =>
    typeof query[key] === 'string' && (query[key] as string).trim() ? (query[key] as string).trim() : null;

  const search = text('search');
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
      ],
    });
  }

  const status = text('status');
  if (status && (Object.values(ProductStatus) as string[]).includes(status)) {
    and.push({ status: status as ProductStatus });
  }

  const categoryId = text('categoryId');
  if (categoryId) and.push({ categoryId });

  const stock = text('stock');
  if (stock && STOCK_WHERE[stock]) and.push(STOCK_WHERE[stock]);

  const moderation = text('moderation');
  if (moderation === 'PENDING' || moderation === 'APPROVED' || moderation === 'REJECTED') {
    and.push({ moderationStatus: moderation });
  }

  const vendor = text('vendorId');
  if (vendor === 'house') and.push({ vendorId: null });
  else if (vendor) and.push({ vendorId: vendor });

  const featured = text('featured');
  if (featured === 'true') and.push({ isFeatured: true });

  const images = text('images');
  if (images === 'missing') and.push({ thumbnail: null, images: { isEmpty: true } });

  return and.length ? { AND: and } : {};
}

/**
 * @route GET /admin/products
 * @description The catalogue, any status, with filters, sort and paging
 * @access Admin only
 *
 * Query: search, status, categoryId, stock (healthy|low|out), moderation,
 * vendorId (or "house"), featured, images=missing, sort, page, limit.
 */
router.get('/products', async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit, skip } = parsePagination(query, 20, 100);
    const where = productListWhere(query);
    const sort = typeof query.sort === 'string' && PRODUCT_SORTS[query.sort] ? query.sort : 'newest';

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [PRODUCT_SORTS[sort], { id: 'asc' }],
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true } },
          vendor: { select: { id: true, shopName: true, isVerified: true } },
          variants: {
            orderBy: [{ color: 'asc' }, { size: 'asc' }],
            select: { id: true, name: true, sku: true, size: true, color: true, quantity: true, price: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const products = rows.map((product) => {
      const totalStock = product.variants.length
        ? product.variants.reduce((sum, v) => sum + v.quantity, 0)
        : product.quantity;
      return { ...product, totalStock, stockBand: stockBand(product.quantity, product.variants) };
    });

    res.json({
      success: true,
      message: 'Products fetched',
      data: {
        products,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('[ADMIN] products list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

/**
 * @route GET /admin/products/summary
 * @description Catalogue health: counts by status, stock band and category
 * @access Admin only
 *
 * Feeds the figures and the stock-health chart above the product table. Read
 * from the whole catalogue, not the current page, so the chart does not change
 * shape as the admin pages through results.
 */
router.get('/products/summary', async (_req: Request, res: Response) => {
  try {
    const [rows, byStatus, pendingReview, featured, missingImages] = await Promise.all([
      prisma.product.findMany({
        where: { status: { not: 'DISCONTINUED' } },
        select: {
          quantity: true,
          category: { select: { id: true, name: true } },
          variants: { select: { quantity: true } },
        },
      }),
      prisma.product.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.product.count({ where: { moderationStatus: 'PENDING' } }),
      prisma.product.count({ where: { isFeatured: true } }),
      prisma.product.count({
        where: { status: 'ACTIVE', thumbnail: null, images: { isEmpty: true } },
      }),
    ]);

    const stock = { healthy: 0, low: 0, out: 0 };
    const categories = new Map<string, { categoryId: string; category: string; healthy: number; low: number; out: number; units: number }>();
    for (const row of rows) {
      const band = stockBand(row.quantity, row.variants);
      stock[band] += 1;
      const key = row.category?.id ?? 'none';
      const entry = categories.get(key) ?? {
        categoryId: key,
        category: row.category?.name ?? 'Uncategorised',
        healthy: 0,
        low: 0,
        out: 0,
        units: 0,
      };
      entry[band] += 1;
      entry.units += row.variants.length ? row.variants.reduce((s, v) => s + v.quantity, 0) : row.quantity;
      categories.set(key, entry);
    }

    const statuses = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));

    res.json({
      success: true,
      data: {
        total: byStatus.reduce((sum, s) => sum + s._count._all, 0),
        statuses,
        stock,
        lowStockLimit: LOW_STOCK_LIMIT,
        pendingReview,
        featured,
        missingImages,
        categories: [...categories.values()].sort((a, b) => b.low + b.out - (a.low + a.out)),
      },
    });
  } catch (error) {
    console.error('[ADMIN] products summary failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load catalogue summary' });
  }
});

/**
 * @route POST /admin/products/bulk
 * @description Apply one action to many products
 * @access Admin only
 *
 * Body: { ids: string[], action: activate | deactivate | discontinue |
 * feature | unfeature | approve }. Capped at 200 ids per call. Each call is
 * written to the audit log with the ids it touched.
 */
const BULK_ACTIONS: Record<string, Prisma.ProductUpdateManyMutationInput> = {
  activate: { status: 'ACTIVE' },
  deactivate: { status: 'INACTIVE' },
  discontinue: { status: 'DISCONTINUED' },
  feature: { isFeatured: true },
  unfeature: { isFeatured: false },
  approve: { moderationStatus: 'APPROVED', moderationNote: null },
};

router.post('/products/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { ids, action } = (req.body ?? {}) as { ids?: unknown; action?: unknown };
    if (typeof action !== 'string' || !BULK_ACTIONS[action]) {
      res.status(400).json({
        success: false,
        message: `action must be one of: ${Object.keys(BULK_ACTIONS).join(', ')}`,
      });
      return;
    }
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
      res.status(400).json({ success: false, message: 'ids must be a non-empty array of product ids' });
      return;
    }
    if (ids.length > 200) {
      res.status(400).json({ success: false, message: 'At most 200 products per bulk action' });
      return;
    }

    const data: Prisma.ProductUpdateManyMutationInput = { ...BULK_ACTIONS[action] };
    if (action === 'approve') data.moderatedAt = new Date();

    // Putting products live goes through the same checklist as one at a time:
    // complete listings go live, incomplete ones are named and left as they are.
    let targetIds = ids as string[];
    const skipped: Array<{ id: string; name: string; missing: number }> = [];
    if (action === 'activate') {
      const rows = await prisma.product.findMany({ where: { id: { in: targetIds } }, include: { variants: true } });
      targetIds = [];
      for (const row of rows) {
        const missing = missingForLive(row as unknown as ListingSnapshot, await categoryColumns(row.categoryId));
        if (missing.length) skipped.push({ id: row.id, name: row.name, missing: missing.length });
        else targetIds.push(row.id);
      }
    }

    const result = await prisma.product.updateMany({ where: { id: { in: targetIds } }, data });

    await prisma.auditLog.create({
      data: {
        userId: req.userId ?? null,
        action: `BULK_${action.toUpperCase()}`,
        resource: 'Product',
        newValue: { ids: ids as string[], count: result.count },
        ipAddress: req.ip ?? null,
      },
    });

    void revalidateCatalog('products');

    res.json({
      success: true,
      message:
        `${result.count} product${result.count === 1 ? '' : 's'} updated` +
        (skipped.length
          ? `. ${skipped.length} not put live because required listing fields are missing: ${skipped
              .slice(0, 5)
              .map((p) => p.name)
              .join(', ')}${skipped.length > 5 ? '…' : ''}`
          : ''),
      data: { count: result.count, skipped },
    });
  } catch (error) {
    console.error('[ADMIN] bulk product action failed:', error);
    res.status(500).json({ success: false, message: 'Could not apply that bulk action' });
  }
});

/**
 * @route POST /admin/products/:id/variants/stock
 * @description Set every size of a product to the same stock level
 * @access Admin only
 */
router.post('/products/:id/variants/stock', async (req: Request, res: Response) => {
  try {
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) {
      res.status(400).json({ success: false, message: 'quantity must be a whole number from 0 to 100000' });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, variants: { select: { id: true, quantity: true } } },
    });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    if (product.variants.length === 0) {
      await prisma.product.update({ where: { id: product.id }, data: { quantity } });
    } else {
      await prisma.productVariant.updateMany({ where: { productId: product.id }, data: { quantity } });
      await prisma.product.update({
        where: { id: product.id },
        data: { quantity: quantity * product.variants.length },
      });
    }

    // Anyone waiting on a sold-out size hears about it.
    if (quantity > 0) {
      for (const variant of product.variants.filter((v) => v.quantity <= 0)) {
        void notifyRestocked(product.id, variant.id);
      }
    }

    res.json({ success: true, message: 'Stock updated', data: { quantity } });
  } catch (error) {
    console.error('[ADMIN] set-all stock failed:', error);
    res.status(500).json({ success: false, message: 'Could not update stock' });
  }
});

/**
 * Which shop a product belongs to, when an admin says so.
 *
 * Deliberately not part of `pickProductFields`: that picker is shared with the
 * seller-facing product routes, and a `vendorId` accepted from the body there
 * would let one shop file a listing under another's name. Only this file, which
 * is admin-only, reads it.
 *
 * An empty string is "house stock" — the platform's own listing, owing no
 * commission — and is distinct from the field being absent, which leaves
 * ownership alone.
 */
const resolveVendorId = async (body: Record<string, unknown>): Promise<string | null | undefined> => {
  if (body.vendorId === undefined) return undefined;
  if (body.vendorId === null || body.vendorId === '') return null;
  if (typeof body.vendorId !== 'string') throw new HttpError(400, 'vendorId must be a string');

  const shop = await prisma.vendorProfile.findUnique({
    where: { id: body.vendorId },
    select: { id: true },
  });
  if (!shop) throw new HttpError(400, 'vendorId does not match an existing seller');
  return shop.id;
};

/**
 * @route POST /admin/products
 * @description Create new product
 * @access Admin only
 */
router.post('/products', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickProductFields((req.body ?? {}) as Record<string, unknown>);

    for (const field of ['name', 'slug', 'sku', 'categoryId'] as const) {
      if (!isNonEmptyString(data[field])) errors.push(`${field} is required`);
    }
    if (typeof data.price !== 'number') errors.push('price is required and must be a number');

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const category = await prisma.category.findUnique({ where: { id: data.categoryId as string } });
    if (!category) {
      res.status(400).json({ success: false, message: 'categoryId does not match an existing category' });
      return;
    }

    const vendorId = await resolveVendorId((req.body ?? {}) as Record<string, unknown>);
    if (vendorId !== undefined) data.vendorId = vendorId;

    // Same rule as the seller route: a slug clash gets a suffix, not a refusal.
    data.slug = await uniqueProductSlug(data.slug as string);

    const listingErrors = prepareListingWrite(data, null, await categoryColumns(data.categoryId));
    if (listingErrors.length > 0) {
      res.status(400).json({ success: false, message: listingErrors.join('. ') });
      return;
    }
    await guardCustomizable(data);

    const product = await prisma.product.create({
      data: data as unknown as Prisma.ProductUncheckedCreateInput,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    await ensureDefaultCustomizations(product.id);

    res.status(201).json({
      success: true,
      message: 'Product created',
      data: { product },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const dup = await describeDuplicate(error.meta?.target, req.body?.sku, { userId: req.userId, role: req.user?.role });
      res.status(409).json({ success: false, ...dup });
      return;
    }
    if (isLiveCheckError(error)) {
      res.status(409).json({ success: false, message: error.message, missing: error.missing });
      return;
    }
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ADMIN] product create failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

/**
 * @route PUT /admin/products/:id
 * @description Update product
 * @access Admin only
 */
router.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickProductFields((req.body ?? {}) as Record<string, unknown>);

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    // Resolved before the emptiness check below: `vendorId` is not part of the
    // shared picker, so moving a listing between shops and nothing else would
    // otherwise be rejected as an empty update.
    const vendorId = await resolveVendorId((req.body ?? {}) as Record<string, unknown>);
    if (vendorId !== undefined) data.vendorId = vendorId;

    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    if (isNonEmptyString(data.categoryId)) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category) {
        res.status(400).json({ success: false, message: 'categoryId does not match an existing category' });
        return;
      }
    }

    // The stored product, for the listing checks and to recognise a restock:
    // only a genuine zero-to-positive crossing counts, so re-saving a product
    // already in stock does not re-alert a list that was told last week.
    const stored = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true },
    });
    if (!stored) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    const previous = data.quantity === undefined ? null : { quantity: stored.quantity };

    const listingErrors = prepareListingWrite(
      data,
      stored as unknown as Record<string, unknown>,
      await categoryColumns(data.categoryId ?? stored?.categoryId)
    );
    if (listingErrors.length > 0) {
      res.status(400).json({ success: false, message: listingErrors.join('. ') });
      return;
    }
    await guardCustomizable(data, stored);

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: data as unknown as Prisma.ProductUncheckedUpdateInput,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    await ensureDefaultCustomizations(product.id);

    if (previous && previous.quantity <= 0 && product.quantity > 0) {
      void notifyRestocked(product.id);
    }

    res.json({
      success: true,
      message: 'Product updated',
      data: { product },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ success: false, message: 'Product not found' });
        return;
      }
      if (error.code === 'P2002') {
        const dup = await describeDuplicate(error.meta?.target, req.body?.sku, { userId: req.userId, role: req.user?.role });
        res.status(409).json({ success: false, ...dup });
        return;
      }
    }
    if (isLiveCheckError(error)) {
      res.status(409).json({ success: false, message: error.message, missing: error.missing });
      return;
    }
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ADMIN] product update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

/**
 * @route PUT /admin/products/:id/customizations
 * @description Replace a product's customisation options
 * @access Admin only
 *
 * Replace rather than patch. These are an ordered list a shopper reads top to
 * bottom, and reordering or removing one through individual row endpoints takes
 * several round trips that can half-fail. The form sends the list it wants.
 *
 * The flag and the options are two halves of one feature: `isCustomizable`
 * without options renders an empty section on the product page, so saving
 * options turns the flag on and clearing them turns it off.
 */
router.put('/products/:id/customizations', async (req: Request, res: Response) => {
  try {
    const { data, errors } = parseCustomizationRows(req.body?.customizations);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const customizations = await replaceCustomizations(req.params.id, data);
    void revalidateCatalog('products');

    res.json({ success: true, message: 'Customisation options saved', data: { customizations } });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ADMIN] customizations save failed:', error);
    res.status(500).json({ success: false, message: 'Could not save those options' });
  }
});

/**
 * @route PUT /admin/products/:id/bulk-pricing
 * @description Replace a product's bulk pricing tiers
 * @access Admin only
 *
 * Tiers are validated as a set, not row by row: overlapping quantity bands are
 * the failure mode that matters, and no single row can be checked for it. The
 * per-unit price is derived from the discount rather than typed twice, so the
 * two can never disagree on the product page.
 */
router.put('/products/:id/bulk-pricing', async (req: Request, res: Response) => {
  try {
    const rows: Record<string, unknown>[] | null = Array.isArray(req.body?.tiers)
      ? req.body.tiers
      : null;
    if (!rows) {
      res.status(400).json({ success: false, message: 'tiers must be an array' });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, price: true },
    });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const errors: string[] = [];
    const tiers = rows.map((raw: Record<string, unknown>, index: number) => {
      const label = `Tier ${index + 1}`;
      const minQty = Number(raw?.minQty);
      const maxQty =
        raw?.maxQty === undefined || raw.maxQty === null || raw.maxQty === ''
          ? null
          : Number(raw.maxQty);
      const discount = Number(raw?.discount);

      if (!Number.isInteger(minQty) || minQty < 2) {
        errors.push(`${label}: the minimum quantity must be a whole number of 2 or more`);
      }
      if (maxQty !== null && (!Number.isInteger(maxQty) || maxQty < minQty)) {
        errors.push(`${label}: the maximum must be a whole number no lower than the minimum`);
      }
      if (!Number.isFinite(discount) || discount <= 0 || discount >= 100) {
        errors.push(`${label}: the discount must be between 0 and 100`);
      }

      return {
        minQty,
        maxQty,
        discount,
        // Derived, never sent: one source of truth for what a tier costs.
        price: Math.round(product.price * (1 - discount / 100) * 100) / 100,
      };
    });

    // Overlap check, on the sorted set — two tiers that both claim quantity 50
    // make the price at 50 a matter of row order.
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      if (previous.maxQty === null || sorted[i].minQty <= previous.maxQty) {
        errors.push(
          `Tiers overlap: the band starting at ${sorted[i].minQty} is already covered by the one starting at ${previous.minQty}`
        );
        break;
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const bulkPricings = await prisma.$transaction(async (tx) => {
      await tx.bulkPricing.deleteMany({ where: { productId: product.id } });
      if (sorted.length > 0) {
        await tx.bulkPricing.createMany({
          data: sorted.map((tier) => ({ ...tier, productId: product.id })),
        });
      }
      await tx.product.update({
        where: { id: product.id },
        data: { allowBulkOrders: sorted.length > 0 },
      });
      return tx.bulkPricing.findMany({ where: { productId: product.id }, orderBy: { minQty: 'asc' } });
    });

    void revalidateCatalog('products');

    res.json({ success: true, message: 'Bulk pricing saved', data: { bulkPricings } });
  } catch (error) {
    console.error('[ADMIN] bulk pricing save failed:', error);
    res.status(500).json({ success: false, message: 'Could not save those tiers' });
  }
});

/**
 * @route POST /admin/products/import
 * @description Create or update products, and their variants, from a CSV
 * @access Admin only
 *
 * Two phases on purpose. Without `commit` this reports exactly what it would
 * do — how many products are new, how many change, which rows are wrong — and
 * writes nothing. A seller's whole catalogue arriving in one request is the
 * worst possible time to find out a column was misread.
 *
 * Matching is by SKU, which is the one identifier a seller's own system
 * already has. Anything not named in the file is left alone: a sheet with only
 * `sku` and `quantity` is a stock update, not a request to blank every
 * description.
 */
router.post('/products/import', async (req: AuthRequest, res: Response) => {
  try {
    const csv = typeof req.body?.csv === 'string' ? req.body.csv : null;
    if (!csv || csv.trim() === '') {
      res.status(400).json({ success: false, message: 'Paste or upload a CSV first' });
      return;
    }
    const commit = req.body?.commit === true;
    const createCategories = req.body?.createCategories === true;
    // Admins may file an import on a seller's behalf; the shop is named once
    // for the whole file rather than per row, which is how the work arrives.
    const vendorId = await resolveVendorId((req.body ?? {}) as Record<string, unknown>);

    const { products, errors, ignoredColumns } = parseCatalogCsv(csv);
    if (products.length === 0) {
      res.status(400).json({
        success: false,
        message: errors[0]?.message ?? 'Nothing in that file could be read as a product',
        data: { errors, ignoredColumns },
      });
      return;
    }

    // ── Resolve the names in the file against what exists ────────────────
    const [categories, brands, existing] = await Promise.all([
      prisma.category.findMany({ select: { id: true, name: true, slug: true } }),
      prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
      prisma.product.findMany({
        where: { sku: { in: products.map((product) => product.sku) } },
        select: { id: true, sku: true, name: true, vendorId: true },
      }),
    ]);

    const key = (value: string) => value.trim().toLowerCase();
    const categoryByName = new Map(categories.flatMap((c) => [[key(c.name), c], [key(c.slug), c]]));
    const brandByName = new Map(brands.flatMap((b) => [[key(b.name), b], [key(b.slug), b]]));
    const existingBySku = new Map(existing.map((product) => [key(product.sku), product]));

    const missingCategories = new Set<string>();
    const plan: Array<{ product: ParsedProduct; action: 'create' | 'update'; categoryId?: string }> = [];

    for (const product of products) {
      const current = existingBySku.get(key(product.sku));
      let categoryId = product.category
        ? categoryByName.get(key(product.category))?.id
        : undefined;

      if (product.category && !categoryId && !createCategories) {
        missingCategories.add(product.category);
      }
      if (!current && !product.category && !categoryId) {
        errors.push({
          row: product.rows[0],
          message: `${product.sku}: a new product needs a category`,
        });
        continue;
      }
      if (!current && product.category && !categoryId && !createCategories) {
        // Reported through missingCategories rather than as a row error, so the
        // operator gets one clear list instead of the same name repeated.
        continue;
      }

      plan.push({ product, action: current ? 'update' : 'create', categoryId });
    }

    const summary = {
      creating: plan.filter((entry) => entry.action === 'create').length,
      updating: plan.filter((entry) => entry.action === 'update').length,
      variants: plan.reduce((sum, entry) => sum + entry.product.variants.length, 0),
      rows: products.reduce((sum, product) => sum + product.rows.length, 0),
      errors: errors.length,
      missingCategories: [...missingCategories],
      ignoredColumns,
      knownColumns: KNOWN_COLUMNS,
    };

    if (!commit) {
      res.json({
        success: true,
        message: `${summary.creating} to create, ${summary.updating} to update, ${summary.variants} variant(s)`,
        data: {
          dryRun: true,
          summary,
          errors,
          // Enough to recognise the file, not the whole thing echoed back.
          preview: plan.slice(0, 25).map((entry) => ({
            sku: entry.product.sku,
            name: entry.product.name,
            action: entry.action,
            variants: entry.product.variants.length,
          })),
        },
      });
      return;
    }

    if (missingCategories.size > 0) {
      res.status(400).json({
        success: false,
        message: `Unknown categor${missingCategories.size === 1 ? 'y' : 'ies'}: ${[...missingCategories].join(', ')}`,
        data: { summary, errors },
      });
      return;
    }

    // ── Apply ────────────────────────────────────────────────────────────
    let created = 0;
    let updated = 0;
    let variantsWritten = 0;
    const failures: Array<{ sku: string; message: string }> = [];

    for (const entry of plan) {
      const { product } = entry;
      try {
        await prisma.$transaction(async (tx) => {
          let categoryId = entry.categoryId;
          if (!categoryId && product.category) {
            const name = product.category;
            const made = await tx.category.upsert({
              where: { slug: slugifyName(name) },
              update: {},
              create: { name, slug: slugifyName(name) },
              select: { id: true },
            });
            categoryId = made.id;
            categoryByName.set(key(name), { id: made.id, name, slug: slugifyName(name) });
          }

          const brandId = product.brand ? brandByName.get(key(product.brand))?.id : undefined;

          // Only what the sheet actually carried. An absent column must not
          // overwrite a value someone set in the admin.
          const fields: Record<string, unknown> = {};
          const set = (column: string, value: unknown) => {
            if (value !== undefined && value !== null) fields[column] = value;
          };
          set('name', product.name);
          set('description', product.description);
          set('shortDescription', product.shortDescription);
          set('material', product.material);
          set('status', product.status);
          set('price', product.price);
          set('originalPrice', product.originalPrice);
          set('costPrice', product.costPrice);
          set('quantity', product.quantity);
          set('weight', product.weight);
          set('sizeGuide', product.sizeGuide);
          set('metaTitle', product.metaTitle);
          set('metaDescription', product.metaDescription);
          if (categoryId) set('categoryId', categoryId);
          if (brandId) set('brandId', brandId);
          if (vendorId !== undefined) set('vendorId', vendorId);

          const current = existingBySku.get(key(product.sku));
          let productId: string;

          if (current) {
            await tx.product.update({ where: { id: current.id }, data: fields });
            productId = current.id;
            updated += 1;
          } else {
            const made = await tx.product.create({
              data: {
                ...fields,
                sku: product.sku,
                slug: product.slug ?? slugifyName(product.name),
                categoryId: categoryId!,
                status: product.status ?? 'DRAFT',
              } as never,
              select: { id: true },
            });
            productId = made.id;
            created += 1;
          }

          // Variants are upserted by their own SKU: re-importing a corrected
          // sheet adjusts stock rather than duplicating the size run.
          for (const variant of product.variants) {
            await tx.productVariant.upsert({
              where: { sku: variant.sku },
              update: {
                productId,
                name: [variant.color, variant.size].filter(Boolean).join(' - ') || product.name,
                color: variant.color,
                size: variant.size,
                quantity: variant.quantity,
                price: variant.price,
              },
              create: {
                productId,
                sku: variant.sku,
                name: [variant.color, variant.size].filter(Boolean).join(' - ') || product.name,
                color: variant.color,
                size: variant.size,
                quantity: variant.quantity,
                price: variant.price,
              },
            });
            variantsWritten += 1;
          }
        });
      } catch (error) {
        // One bad product does not abandon the other 299; the file is reported
        // on as a whole at the end.
        failures.push({
          sku: product.sku,
          message: error instanceof Error ? error.message : 'Could not be saved',
        });
      }
    }

    void revalidateCatalog('products');

    res.json({
      success: true,
      message: `Imported ${created} new and ${updated} updated product(s), ${variantsWritten} variant(s)`,
      data: { created, updated, variants: variantsWritten, failures, errors, summary },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ADMIN] import failed:', error);
    res.status(500).json({ success: false, message: 'Could not import that file' });
  }
});

/**
 * @route GET /admin/products/export
 * @description The catalogue as a CSV, in the shape the importer reads back
 * @access Admin only
 *
 * The same columns in the same order, so the round trip works: export, edit the
 * stock column in a spreadsheet, import. That is how bulk edits actually get
 * made, and it means the import format never has to be written out by hand.
 */
router.get('/products/export', async (req: Request, res: Response) => {
  try {
    const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined;

    const products = await prisma.product.findMany({
      where: vendorId ? { vendorId } : {},
      orderBy: { name: 'asc' },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        variants: { orderBy: [{ color: 'asc' }, { size: 'asc' }] },
      },
    });

    const header = [
      'sku', 'name', 'slug', 'category', 'brand', 'price', 'originalPrice', 'costPrice',
      'quantity', 'status', 'material', 'weight', 'shortDescription', 'description',
      'color', 'size', 'variantSku', 'variantQuantity', 'variantPrice',
    ];

    const rows: unknown[][] = [];
    for (const product of products) {
      const base = [
        product.sku, product.name, product.slug, product.category?.name ?? '',
        product.brand?.name ?? '', product.price, product.originalPrice ?? '',
        product.costPrice ?? '', product.quantity, product.status, product.material ?? '',
        product.weight ?? '', product.shortDescription ?? '', product.description ?? '',
      ];
      if (product.variants.length === 0) {
        rows.push([...base, '', '', '', '', '']);
        continue;
      }
      // One row per variant, product columns repeated — the shape the importer
      // reads and the shape every other store exports.
      for (const variant of product.variants) {
        rows.push([
          ...base,
          variant.color ?? '', variant.size ?? '', variant.sku,
          variant.quantity, variant.price ?? '',
        ]);
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="catalogue.csv"');
    // A BOM so Excel opens rupee symbols and accented names as UTF-8 rather
    // than as the local codepage.
    res.send('\ufeff' + toCsv(header, rows));
  } catch (error) {
    console.error('[ADMIN] export failed:', error);
    res.status(500).json({ success: false, message: 'Could not export the catalogue' });
  }
});

/**
 * @route DELETE /admin/products/:id
 * @description Delete product (soft delete: status DISCONTINUED)
 * @access Admin only
 */
router.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { status: 'DISCONTINUED' },
    });

    res.json({
      success: true,
      message: 'Product discontinued',
      data: { product },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    console.error('[ADMIN] product delete failed:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

/**
 * @route PATCH /admin/products/:id/featured
 * @description Toggle product featured status for storefront
 * @access Admin only
 */
router.patch('/products/:id/featured', async (req: Request, res: Response) => {
  try {
    const { isFeatured } = req.body ?? {};
    if (typeof isFeatured !== 'boolean') {
      res.status(400).json({ success: false, message: 'isFeatured must be a boolean' });
      return;
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isFeatured },
    });

    res.json({
      success: true,
      message: 'Product featured status updated',
      data: { product },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    console.error('[ADMIN] product featured failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update product featured status' });
  }
});

/**
 * Whitelist + validate category fields.
 *
 * `partial` is an update: only what was sent is checked. A template must be a
 * key the catalogue knows (it is what sellers in this category list with), and
 * a commission rate is a percentage. Empty strings clear the optional fields.
 */
const pickCategoryFields = (
  body: Record<string, unknown>,
  partial: boolean
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  const sent = (key: string) => body[key] !== undefined;

  if (!partial || sent('name')) {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 80) errors.push('name is required (at most 80 characters)');
    else data.name = name;
  }
  if (!partial || sent('slug')) {
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    // The slug reaches the storefront as a URL segment.
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) errors.push('slug must be lowercase letters, digits and hyphens');
    else data.slug = slug;
  }
  for (const field of ['description', 'image'] as const) {
    if (!sent(field)) continue;
    const value = body[field];
    if (value === null || value === '') data[field] = null;
    else if (typeof value !== 'string') errors.push(`${field} must be text`);
    else data[field] = value.trim().slice(0, field === 'image' ? 500 : 2000);
  }
  if (sent('parentId')) {
    const value = body.parentId;
    if (value === null || value === '') data.parentId = null;
    else if (typeof value !== 'string') errors.push('parentId must be a category id');
    else data.parentId = value;
  }
  if (sent('displayOrder')) {
    const n = Number(body.displayOrder);
    if (!Number.isInteger(n) || n < -10000 || n > 10000) errors.push('displayOrder must be a whole number');
    else data.displayOrder = n;
  }
  if (sent('isActive')) {
    if (typeof body.isActive !== 'boolean') errors.push('isActive must be true or false');
    else data.isActive = body.isActive;
  }
  // Homepage "Explore all categories" tile (uses `image`).
  if (sent('showOnHome')) {
    if (typeof body.showOnHome !== 'boolean') errors.push('showOnHome must be true or false');
    else data.showOnHome = body.showOnHome;
  }
  if (sent('homeOrder')) {
    const n = Number(body.homeOrder);
    if (!Number.isInteger(n) || n < -10000 || n > 10000) errors.push('homeOrder must be a whole number');
    else data.homeOrder = n;
  }
  if (sent('listingTemplate')) {
    const value = body.listingTemplate;
    if (value === null || value === '') data.listingTemplate = null;
    else {
      const info = typeof value === 'string' ? templateInfo(value) : null;
      if (!info) errors.push('listingTemplate must be one of the catalogue article types');
      else data.listingTemplate = info.slug;
    }
  }
  if (sent('commissionRate')) {
    const value = body.commissionRate;
    if (value === null || value === '') data.commissionRate = null;
    else {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) errors.push('commissionRate must be a percentage from 0 to 100');
      else data.commissionRate = Math.round(n * 100) / 100;
    }
  }
  // The variant option name ("Model", "Screen size") and its suggested values;
  // unset inherits from the parent (utils/category-fields.ts).
  if (sent('optionLabel')) {
    const value = body.optionLabel;
    if (value === null || value === '') data.optionLabel = null;
    else if (typeof value !== 'string' || value.trim().length > 40) errors.push('optionLabel must be text of at most 40 characters');
    else data.optionLabel = value.trim().replace(/\s+/g, ' ') || null;
  }
  if (sent('optionValues')) {
    const values = body.optionValues === null ? [] : cleanOptions(body.optionValues);
    if (!values || values.length > 60) errors.push('optionValues must be a list of at most 60 values');
    else data.optionValues = values;
  }
  return { data, errors };
};

/** The parent must exist and must not be the category itself or below it. */
async function checkCategoryParent(id: string | null, parentId: unknown): Promise<string | null> {
  if (typeof parentId !== 'string') return null;
  const rows = await prisma.category.findMany({ select: CATEGORY_SELECT });
  if (!rows.some((r) => r.id === parentId)) return 'parentId does not match an existing category';
  if (id && wouldCreateCycle(rows, id, parentId)) {
    return 'A category cannot sit inside itself or one of its own subcategories';
  }
  return null;
}

const CATEGORY_CONFLICT = 'That slug is taken, or the parent already has a category with this name';
const isCategoryConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * @route GET /admin/categories
 * @description Every category, parents before their children (depth-first, in
 *              display order), with the template each one resolves to — for
 *              the categories editor and the product form's category picker
 * @access Admin only
 */
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const [rows, counts] = await Promise.all([
      prisma.category.findMany({ select: CATEGORY_SELECT }),
      prisma.category.findMany({
        select: { id: true, _count: { select: { products: true, children: true } } },
      }),
    ]);
    const countOf = new Map(counts.map((c) => [c.id, c._count]));
    const categories = flattenTree(buildCategoryTree(rows)).map(({ children: _children, ...node }) => {
      const template = templateInfo(node.resolvedTemplate);
      return {
        ...node,
        resolvedTemplate: template?.slug ?? null,
        family: template?.family ?? null,
        _count: countOf.get(node.id) ?? { products: 0, children: 0 },
      };
    });

    res.json({ success: true, message: 'Categories fetched', data: { categories } });
  } catch (error) {
    console.error('[ADMIN] categories list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

/**
 * @route POST /admin/categories
 * @description Create a category, optionally nested under a parent
 * @access Admin only
 */
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickCategoryFields((req.body ?? {}) as Record<string, unknown>, false);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    const parentError = await checkCategoryParent(null, data.parentId);
    if (parentError) {
      res.status(400).json({ success: false, message: parentError });
      return;
    }

    const category = await prisma.category.create({
      data: data as Prisma.CategoryUncheckedCreateInput,
    });
    invalidateCategoryFields();
    void revalidateCatalog('products');

    res.status(201).json({ success: true, message: 'Category created', data: { category } });
  } catch (error) {
    if (isCategoryConflict(error)) {
      res.status(409).json({ success: false, message: CATEGORY_CONFLICT });
      return;
    }
    console.error('[ADMIN] category create failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

/**
 * @route PUT /admin/categories/:id
 * @description Rename, move, reorder, hide or re-template a category
 * @access Admin only
 */
router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickCategoryFields((req.body ?? {}) as Record<string, unknown>, true);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }
    const parentError = await checkCategoryParent(req.params.id, data.parentId);
    if (parentError) {
      res.status(400).json({ success: false, message: parentError });
      return;
    }

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: data as Prisma.CategoryUncheckedUpdateInput,
    });
    invalidateCategoryFields();
    void revalidateCatalog('products');

    res.json({ success: true, message: 'Category saved', data: { category } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    if (isCategoryConflict(error)) {
      res.status(409).json({ success: false, message: CATEGORY_CONFLICT });
      return;
    }
    console.error('[ADMIN] category update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to save category' });
  }
});

/**
 * @route DELETE /admin/categories/:id
 * @description Delete an empty category. One that still holds products or
 *              subcategories is refused — hide it, or move them first; deleting
 *              would leave every product filed under it without a category.
 * @access Admin only
 */
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, _count: { select: { products: true, children: true } } },
    });
    if (!category) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    const { products, children } = category._count;
    if (products > 0 || children > 0) {
      res.status(409).json({
        success: false,
        message: `${category.name} still has ${products} product(s) and ${children} subcategor${children === 1 ? 'y' : 'ies'}. Move them or hide the category instead.`,
      });
      return;
    }
    await prisma.category.delete({ where: { id: category.id } });
    invalidateCategoryFields();
    void revalidateCatalog('products');
    res.json({ success: true, message: `${category.name} deleted` });
  } catch (error) {
    console.error('[ADMIN] category delete failed:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
});

/**
 * @route GET /admin/orders
 * @description Get all orders with filtering
 * @access Admin only
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 20, 100);

    const where: Prisma.OrderWhereInput = {};
    if (typeof status === 'string' && status.length > 0) {
      if (!(Object.values(OrderStatus) as string[]).includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status filter' });
        return;
      }
      where.status = status as OrderStatus;
    }
    // Searching has to reach the database for the same reason: an admin
    // looking up one order number is looking through every order, not through
    // the twenty most recent ones the table happens to be holding.
    if (typeof search === 'string' && search.trim().length > 0) {
      const needle = search.trim();
      where.OR = [
        { orderNumber: { contains: needle, mode: 'insensitive' } },
        { trackingNumber: { contains: needle, mode: 'insensitive' } },
        { user: { email: { contains: needle, mode: 'insensitive' } } },
        { user: { firstName: { contains: needle, mode: 'insensitive' } } },
        { user: { lastName: { contains: needle, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, slug: true, thumbnail: true } },
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      message: 'Orders fetched',
      data: {
        orders,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('[ADMIN] orders list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

/**
 * @route GET /admin/orders/:id
 * @description One order in full: lines, addresses, sub-orders and timeline
 * @access Admin only
 *
 * `GET /orders/:id` already lets an admin through, but it is the customer's
 * own view and deliberately omits the account behind the order. An admin
 * looking at a disputed delivery needs the buyer, so this is a separate read
 * rather than a widening of the customer endpoint.
 */
router.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true, thumbnail: true } },
            variant: { select: { id: true, name: true, size: true, color: true, sku: true } },
          },
        },
        shippingAddress: true,
        billingAddress: true,
        // A two-seller order ships in two parcels and is paid out twice, so the
        // shape of the split is part of reading the order, not a payouts-only
        // concern.
        sellerOrders: {
          orderBy: { orderNumber: 'asc' },
          include: {
            vendor: { select: { id: true, shopName: true, shopSlug: true } },
            items: { select: { id: true } },
          },
        },
        timeline: { orderBy: { createdAt: 'asc' } },
        returnRequest: true,
      },
    });

    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }

    res.json({ success: true, message: 'Order fetched', data: { order } });
  } catch (error) {
    console.error('[ADMIN] order detail failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

/**
 * @route PATCH /admin/orders/:id/status
 * @description Update order status
 * @access Admin only
 *
 * The change cascades to every shop's sub-order — see utils/order-status. It
 * used to write the parent row alone, which is how an order could be marked
 * DELIVERED while every `SellerOrder.deliveredAt` stayed null: settlement keys
 * the return window off that timestamp, so the shops that fulfilled the order
 * were never paid and nothing said why.
 *
 * Cancelling from here runs the same path as a customer cancelling their own
 * order, restock and coupon release included, rather than leaving stock written
 * off and a limited-use code burnt. Marking a delivered order RETURNED runs the
 * return completion, so the two ways an admin can reach that outcome — this and
 * the returns queue — do exactly the same thing.
 */
router.patch('/orders/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body ?? {};

    if (typeof status !== 'string' || !(Object.values(OrderStatus) as string[]).includes(status)) {
      res.status(400).json({
        success: false,
        message: `status must be one of: ${Object.values(OrderStatus).join(', ')}`,
      });
      return;
    }
    const nextStatus = status as OrderStatus;

    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }

    const allowed = checkAdminTransition(existing.status, nextStatus);
    if (!allowed.ok) {
      res.status(409).json({ success: false, message: allowed.message });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      if (nextStatus === 'CANCELLED') {
        return cancelOrder(tx, {
          orderId: existing.id,
          actorId: req.userId!,
          message: 'Order cancelled by an administrator',
        });
      }
      if (nextStatus === 'RETURNED') {
        // Marking a delivered order returned from here is the same operation as
        // completing a return request — refund, restock, both sides RETURNED —
        // because a customer who sent goods back without filing a request has
        // still sent them back. Any request already open is closed with it so
        // the queue does not keep showing work that is done.
        const completion = await completeReturn(tx, {
          orderId: existing.id,
          actorId: req.userId!,
        });
        await tx.returnRequest.updateMany({
          where: { orderId: existing.id, status: { not: 'COMPLETED' } },
          data: {
            status: 'COMPLETED',
            refundAmount: completion.refundAmount,
            refundDate: new Date(),
          },
        });
        return completion;
      }
      return applyOrderStatus(tx, { orderId: existing.id, next: nextStatus, actorId: req.userId! });
    });

    const order = await prisma.order.findUnique({ where: { id: existing.id } });

    // Not awaited: the status change is already committed, and the admin should
    // not wait on a mail server to see the table update.
    void sendOrderStatusUpdate(existing.id, nextStatus);

    res.json({
      success: true,
      message: `Order status updated${
        result.sellerOrdersChanged > 0
          ? `, along with ${result.sellerOrdersChanged} seller order(s)`
          : ''
      }`,
      data: { order, sellerOrdersChanged: result.sellerOrdersChanged },
    });
  } catch (error) {
    console.error('[ADMIN] order status failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

/**
 * @route PATCH /admin/orders/:id/payment
 * @description Record that an order was paid, refunded or failed
 * @access Admin only
 *
 * Nothing in the codebase ever set `paymentStatus` to anything but PENDING, so
 * every order looked unpaid forever and the dashboard's revenue — which sums
 * PAID orders — was permanently zero. Cash on delivery now settles itself when
 * the order is marked delivered; this endpoint is for everything that does not
 * fit that: a bank transfer that has landed, a card payment reconciled by hand,
 * a refund made outside the return flow, a COD parcel refused at the door.
 *
 * It records a fact, it does not move money. There is no gateway wired up, so
 * an admin makes the transfer and this keeps the ledger honest.
 */
router.patch('/orders/:id/payment', async (req: AuthRequest, res: Response) => {
  try {
    const { paymentStatus, paymentId, notes } = (req.body ?? {}) as Record<string, unknown>;

    if (
      typeof paymentStatus !== 'string' ||
      !(Object.values(PaymentStatus) as string[]).includes(paymentStatus)
    ) {
      res.status(400).json({
        success: false,
        message: `paymentStatus must be one of: ${Object.values(PaymentStatus).join(', ')}`,
      });
      return;
    }
    if (paymentId !== undefined && paymentId !== null && typeof paymentId !== 'string') {
      res.status(400).json({ success: false, message: 'paymentId must be a string' });
      return;
    }
    if (notes !== undefined && typeof notes !== 'string') {
      res.status(400).json({ success: false, message: 'notes must be a string' });
      return;
    }

    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, paymentStatus: true, total: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (existing.paymentStatus === paymentStatus) {
      res.status(409).json({
        success: false,
        message: `This order is already marked ${paymentStatus}`,
      });
      return;
    }

    const next = paymentStatus as PaymentStatus;
    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          paymentStatus: next,
          ...(typeof paymentId === 'string' && paymentId.trim()
            ? { paymentId: paymentId.trim().slice(0, 120) }
            : {}),
        },
      });
      // The timeline is the audit trail for money as much as for fulfilment,
      // so a payment being recorded belongs on it beside the status changes.
      await tx.orderTimeline.create({
        data: {
          orderId: existing.id,
          status: `PAYMENT_${next}`,
          message:
            typeof notes === 'string' && notes.trim()
              ? notes.trim().slice(0, 500)
              : `Payment marked ${next}`,
          createdBy: req.userId!,
        },
      });
      return updated;
    });

    res.json({ success: true, message: `Payment marked ${next}`, data: { order } });
  } catch (error) {
    console.error('[ADMIN] order payment failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment status' });
  }
});

/**
 * @route GET /admin/coupons
 * @description Get all coupons
 * @access Admin only
 */
router.get('/coupons', async (req: Request, res: Response) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });

    res.json({
      success: true,
      message: 'Coupons fetched',
      data: { coupons },
    });
  } catch (error) {
    console.error('[ADMIN] coupons list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch coupons' });
  }
});

/**
 * @route POST /admin/coupons
 * @description Create new coupon
 * @access Admin only
 */
router.post('/coupons', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickCouponFields((req.body ?? {}) as Record<string, unknown>);

    if (!isNonEmptyString(data.code)) errors.push('code is required');
    if (data.discountType === undefined) errors.push('discountType is required');
    if (typeof data.discountValue !== 'number') errors.push('discountValue is required');
    if (!(data.startDate instanceof Date)) errors.push('startDate is required');
    if (!(data.endDate instanceof Date)) errors.push('endDate is required');

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const coupon = await prisma.coupon.create({
      data: data as unknown as Prisma.CouponUncheckedCreateInput,
    });

    res.status(201).json({
      success: true,
      message: 'Coupon created',
      data: { coupon },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'A coupon with this code already exists' });
      return;
    }
    console.error('[ADMIN] coupon create failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create coupon' });
  }
});

/**
 * @route PUT /admin/coupons/:id
 * @description Update coupon
 * @access Admin only
 */
router.put('/coupons/:id', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickCouponFields((req.body ?? {}) as Record<string, unknown>);

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: data as unknown as Prisma.CouponUncheckedUpdateInput,
    });

    res.json({
      success: true,
      message: 'Coupon updated',
      data: { coupon },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ success: false, message: 'Coupon not found' });
        return;
      }
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, message: 'A coupon with this code already exists' });
        return;
      }
    }
    console.error('[ADMIN] coupon update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update coupon' });
  }
});

/**
 * @route DELETE /admin/coupons/:id
 * @description Delete coupon
 * @access Admin only
 */
router.delete('/coupons/:id', async (req: Request, res: Response) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });

    res.json({
      success: true,
      message: 'Coupon deleted',
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Coupon not found' });
      return;
    }
    console.error('[ADMIN] coupon delete failed:', error);
    res.status(500).json({ success: false, message: 'Failed to delete coupon' });
  }
});

/**
 * @route GET /admin/vendors
 * @description Get all vendors/sellers
 * @access Admin only
 */
router.get('/vendors', async (req: Request, res: Response) => {
  try {
    // ?applicationStatus=APPLIED,UNDER_REVIEW narrows to the review queue.
    const statuses = String(req.query.applicationStatus ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is SellerApplicationStatus =>
        (Object.values(SellerApplicationStatus) as string[]).includes(s)
      );
    const vendors = await prisma.vendorProfile.findMany({
      where: statuses.length > 0 ? { applicationStatus: { in: statuses } } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
        // What a shop actually amounts to, so approving one is not a decision
        // taken from a name alone.
        _count: { select: { products: true, sellerOrders: true } },
        // The brands it asked to sell under, so company, brand and identity
        // are reviewed on one screen.
        brands: {
          select: { id: true, name: true, status: true, authorizationType: true, authorizationDoc: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    res.json({
      success: true,
      message: 'Vendors fetched',
      // The account number is masked here. An admin who needs it to make a
      // transfer asks for it explicitly, and that request is audited.
      data: {
        vendors: vendors.map(({ bankAccountNumber, ...vendor }) => ({
          ...vendor,
          bankAccountLast4: last4(bankAccountNumber),
          hasBankDetails: Boolean(bankAccountNumber),
        })),
      },
    });
  } catch (error) {
    console.error('[ADMIN] vendors list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors' });
  }
});

/**
 * @route POST /admin/vendors
 * @description Onboard a seller — create their shop, and their login if needed
 * @access Admin only
 *
 * Two paths in one, keyed on whether the email already has an account:
 *
 *   • Existing account  → a shop is attached to it and the role is promoted.
 *   • New email         → an account is created with a generated password,
 *                         returned once so the admin can pass it on.
 *
 * The password is generated rather than chosen by the admin: a password typed
 * into an admin form tends to be reused across every seller onboarded that day.
 *
 * A shop created here starts verified — an admin creating it deliberately *is*
 * the approval — unless they say otherwise.
 */
router.post('/vendors', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = isNonEmptyString(body.email) ? body.email.trim().toLowerCase() : null;
    const shopName = isNonEmptyString(body.shopName) ? body.shopName.trim().slice(0, 80) : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ success: false, message: 'A valid email is required' });
      return;
    }
    if (!shopName) {
      res.status(400).json({ success: false, message: 'A shop name is required' });
      return;
    }
    // The business behind the shop. Optional here — the owner may onboard a
    // shop before the paperwork arrives — but validated when given.
    const company = pickCompanyFields(body, { required: false });
    if (company.errors.length > 0) {
      res.status(400).json({ success: false, message: company.errors.join('. ') });
      return;
    }

    // Empty or null means no override: the shop pays its categories' rates
    // (utils/commission). Only a number given on purpose pins a custom rate.
    const commissionRate =
      body.commissionRate === undefined || body.commissionRate === null || body.commissionRate === ''
        ? null
        : Number(body.commissionRate);
    if (
      commissionRate !== null &&
      (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100)
    ) {
      res.status(400).json({ success: false, message: 'Commission must be between 0 and 100' });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, vendorProfile: { select: { id: true } } },
    });
    if (existingUser?.vendorProfile) {
      res.status(409).json({ success: false, message: 'That account already has a shop' });
      return;
    }

    // Readable, not clever: this gets copied into an email by hand, so no
    // characters that are ambiguous when read aloud or retyped.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const temporaryPassword = existingUser
      ? null
      : Array.from(crypto.randomBytes(14))
          .map((byte) => alphabet[byte % alphabet.length])
          .join('');

    const shopSlug = await uniqueShopSlug(shopName);

    const result = await prisma.$transaction(async (tx) => {
      let userId = existingUser?.id;

      if (!userId) {
        const created = await tx.user.create({
          data: {
            email,
            password: await bcrypt.hash(temporaryPassword!, 10),
            firstName: isNonEmptyString(body.firstName) ? body.firstName.trim() : shopName,
            lastName: isNonEmptyString(body.lastName) ? body.lastName.trim() : '',
            role: 'VENDOR',
            status: 'ACTIVE',
            emailVerified: false,
            cart: { create: {} },
          },
          select: { id: true },
        });
        userId = created.id;
      } else if (existingUser?.role !== 'ADMIN') {
        // An admin who also sells stays an admin; anyone else is promoted.
        await tx.user.update({ where: { id: userId }, data: { role: 'VENDOR' } });
      }

      return tx.vendorProfile.create({
        data: {
          ...(company.data as Prisma.VendorProfileUncheckedCreateInput),
          // The owner creating the shop is the approval.
          applicationStatus: 'APPROVED',
          applicationReviewedAt: new Date(),
          userId,
          shopName,
          shopSlug,
          shopDescription: isNonEmptyString(body.shopDescription)
            ? body.shopDescription.trim().slice(0, 2000)
            : null,
          commissionRate,
          isVerified: body.isVerified === false ? false : true,
          isActive: true,
        },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });
    });

    void revalidateCatalog('sellers');

    res.status(201).json({
      success: true,
      message: existingUser
        ? // Worth saying plainly: the role lives in their JWT, so a seller who
          // is signed in right now keeps their old permissions until they
          // sign in again.
          'Shop created on the existing account. They must sign out and back in before the seller area opens up.'
        : 'Seller account created. Give them the password below — it is shown only once.',
      data: { vendor: result, temporaryPassword },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'That email or shop name is already taken' });
      return;
    }
    console.error('[ADMIN] vendor create failed:', error);
    res.status(500).json({ success: false, message: 'Could not create that seller' });
  }
});

/**
 * @route PUT /admin/vendors/:id
 * @description Change a shop's terms or standing
 * @access Admin only
 *
 * Commission is not applied retroactively: `SellerOrder` snapshots the rate at
 * order time, so changing it here only affects orders placed afterwards, and
 * money already owed cannot move under a seller's feet.
 */
router.put('/vendors/:id', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.VendorProfileUpdateInput = {};

    if (body.commissionRate !== undefined) {
      // null or '' clears the override, handing the shop back to category rates.
      if (body.commissionRate === null || body.commissionRate === '') {
        data.commissionRate = null;
      } else {
        const rate = Number(body.commissionRate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          res.status(400).json({ success: false, message: 'Commission must be between 0 and 100' });
          return;
        }
        data.commissionRate = rate;
      }
    }
    for (const flag of ['isVerified', 'isActive'] as const) {
      if (body[flag] === undefined) continue;
      if (typeof body[flag] !== 'boolean') {
        res.status(400).json({ success: false, message: `${flag} must be a boolean` });
        return;
      }
      data[flag] = body[flag] as boolean;
    }
    if (isNonEmptyString(body.shopName)) data.shopName = body.shopName.trim().slice(0, 80);
    if (body.shopDescription !== undefined) {
      data.shopDescription = isNonEmptyString(body.shopDescription)
        ? body.shopDescription.trim().slice(0, 2000)
        : null;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'Nothing to update' });
      return;
    }

    if (data.isVerified === true && body.overrideKyc !== true) {
      const current = await prisma.vendorProfile.findUnique({
        where: { id: req.params.id },
        select: { kycStatus: true },
      });
      if (current && current.kycStatus !== 'APPROVED') {
        res.status(409).json({
          success: false,
          message: 'Approve this seller\'s identity check before verifying the shop',
        });
        return;
      }
    }

    const vendor = await prisma.vendorProfile.update({
      where: { id: req.params.id },
      data,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    // Suspending or approving a shop changes what the storefront should show
    // of it, and both the directory and its listings are cached.
    void revalidateCatalog('sellers');
    void revalidateCatalog('products');

    res.json({ success: true, message: 'Seller updated', data: { vendor } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Seller not found' });
      return;
    }
    console.error('[ADMIN] vendor update failed:', error);
    res.status(500).json({ success: false, message: 'Could not update that seller' });
  }
});

/**
 * @route PATCH /admin/vendors/:id/verify
 * @description Verify/approve vendor
 * @access Admin only
 */
router.patch('/vendors/:id/verify', async (req: Request, res: Response) => {
  try {
    const { isVerified } = req.body ?? {};
    if (isVerified !== undefined && typeof isVerified !== 'boolean') {
      res.status(400).json({ success: false, message: 'isVerified must be a boolean' });
      return;
    }

    const nextVerified = isVerified === undefined ? true : isVerified;
    if (nextVerified && req.body?.overrideKyc !== true) {
      const current = await prisma.vendorProfile.findUnique({
        where: { id: req.params.id },
        select: { kycStatus: true },
      });
      if (current && current.kycStatus !== 'APPROVED') {
        res.status(409).json({
          success: false,
          message: 'Approve this seller\'s identity check before verifying the shop',
        });
        return;
      }
    }

    const vendor = await prisma.vendorProfile.update({
      where: { id: req.params.id },
      data: { isVerified: nextVerified },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    // The seller directory is cached; without this a shop stays listed as
    // verified — or unlisted — for minutes after the decision was made.
    void revalidateCatalog('sellers');

    res.json({
      success: true,
      message: 'Vendor verification updated',
      data: { vendor },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Vendor not found' });
      return;
    }
    console.error('[ADMIN] vendor verify failed:', error);
    res.status(500).json({ success: false, message: 'Failed to verify vendor' });
  }
});

/**
 * @route PATCH /admin/vendors/:id/application
 * @description Decide a seller application: approve, reject, suspend, or mark under review
 * @access Admin only
 *
 * Body: { status, note?, overrideKyc? }. The note is shown to the seller, so
 * rejecting or suspending requires one. Approving opens the catalogue to the
 * shop (see utils/vendor.ts sellingBlockedReason) and verifies it, which needs
 * an approved identity check unless the admin overrides it — the same rule as
 * /verify. Suspending un-verifies the shop, which takes its listings off the
 * storefront.
 */
router.patch('/vendors/:id/application', async (req: AuthRequest, res: Response) => {
  try {
    const status = String(req.body?.status ?? '').toUpperCase();
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
    const allowed: SellerApplicationStatus[] = ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'];
    if (!allowed.includes(status as SellerApplicationStatus)) {
      res.status(400).json({ success: false, message: `status must be one of ${allowed.join(', ')}` });
      return;
    }
    const next = status as SellerApplicationStatus;
    if ((next === 'REJECTED' || next === 'SUSPENDED') && !note) {
      res.status(400).json({ success: false, message: 'Add a note telling the seller why' });
      return;
    }

    const current = await prisma.vendorProfile.findUnique({
      where: { id: req.params.id },
      select: { id: true, applicationStatus: true, kycStatus: true, isVerified: true },
    });
    if (!current) {
      res.status(404).json({ success: false, message: 'Seller not found' });
      return;
    }
    if (next === 'APPROVED' && current.kycStatus !== 'APPROVED' && req.body?.overrideKyc !== true) {
      res.status(409).json({
        success: false,
        message: 'Approve this seller\'s identity check first, or approve anyway with the KYC override',
      });
      return;
    }

    const data: Prisma.VendorProfileUpdateInput = {
      applicationStatus: next,
      applicationNote: note || null,
      applicationReviewedAt: new Date(),
    };
    if (next === 'APPROVED') data.isVerified = true;
    if (next === 'SUSPENDED' || next === 'REJECTED') data.isVerified = false;

    const vendor = await prisma.vendorProfile.update({
      where: { id: current.id },
      data,
      select: {
        id: true,
        shopName: true,
        applicationStatus: true,
        applicationNote: true,
        applicationReviewedAt: true,
        isVerified: true,
        kycStatus: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId ?? null,
        action: `APPLICATION_${next}`,
        resource: 'VendorProfile',
        resourceId: vendor.id,
        oldValue: { applicationStatus: current.applicationStatus, isVerified: current.isVerified },
        newValue: {
          applicationStatus: vendor.applicationStatus,
          note: note || null,
          overrideKyc: next === 'APPROVED' && current.kycStatus !== 'APPROVED',
        },
        ipAddress: req.ip ?? null,
      },
    });

    void revalidateCatalog('sellers');
    void revalidateCatalog('products');

    const messages: Record<SellerApplicationStatus, string> = {
      APPLIED: 'Application reopened',
      UNDER_REVIEW: 'Marked as under review',
      APPROVED: 'Seller approved — they can list products now',
      REJECTED: 'Application rejected',
      SUSPENDED: 'Shop suspended and its listings hidden',
    };
    res.json({ success: true, message: messages[next], data: { vendor } });
  } catch (error) {
    console.error('[ADMIN] application decision failed:', error);
    res.status(500).json({ success: false, message: 'Could not record that decision' });
  }
});

/**
 * @route GET /admin/vendors/:id/bank
 * @description The full bank account, for making a payout by hand
 * @access Admin only
 *
 * The one place an account number leaves the database in full. Every call is
 * written to the audit log with who asked and from where, so a leak can be
 * traced to a person rather than to "someone with admin".
 */
router.get('/vendors/:id/bank', async (req: AuthRequest, res: Response) => {
  try {
    const shop = await prisma.vendorProfile.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        shopName: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankIFSC: true,
        bankName: true,
      },
    });
    if (!shop) {
      res.status(404).json({ success: false, message: 'Seller not found' });
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId: req.userId ?? null,
        action: 'REVEAL',
        resource: 'VendorBankAccount',
        resourceId: shop.id,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
      },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        bank: {
          shopName: shop.shopName,
          accountName: shop.bankAccountName,
          accountNumber: decryptField(shop.bankAccountNumber),
          ifsc: shop.bankIFSC,
          bankName: shop.bankName,
        },
      },
    });
  } catch (error) {
    console.error('[ADMIN] bank reveal failed:', error);
    res.status(500).json({ success: false, message: 'Could not load bank details' });
  }
});

/**
 * @route PATCH /admin/vendors/:id/kyc
 * @description Approve or reject a seller's identity check
 * @access Admin only
 *
 * Approving also verifies the shop, since that is the reason the check
 * exists. Rejecting needs a reason the seller will read, and un-verifies the
 * shop so its listings leave the storefront.
 */
router.patch('/vendors/:id/kyc', async (req: AuthRequest, res: Response) => {
  try {
    const decision = req.body?.decision;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ success: false, message: 'decision must be "approve" or "reject"' });
      return;
    }
    if (decision === 'reject' && !reason) {
      res.status(400).json({ success: false, message: 'Tell the seller why it was rejected' });
      return;
    }

    const current = await prisma.vendorProfile.findUnique({
      where: { id: req.params.id },
      select: { kycStatus: true, pan: true },
    });
    if (!current) {
      res.status(404).json({ success: false, message: 'Seller not found' });
      return;
    }
    if (decision === 'approve' && !current.pan) {
      res.status(409).json({ success: false, message: 'This seller has not submitted a PAN yet' });
      return;
    }

    const vendor = await prisma.vendorProfile.update({
      where: { id: req.params.id },
      data:
        decision === 'approve'
          ? { kycStatus: 'APPROVED', kycReviewedAt: new Date(), kycRejectionReason: null, isVerified: true }
          : { kycStatus: 'REJECTED', kycReviewedAt: new Date(), kycRejectionReason: reason, isVerified: false },
      select: { id: true, shopName: true, kycStatus: true, isVerified: true, kycRejectionReason: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId ?? null,
        action: decision === 'approve' ? 'KYC_APPROVE' : 'KYC_REJECT',
        resource: 'VendorProfile',
        resourceId: vendor.id,
        oldValue: { kycStatus: current.kycStatus },
        newValue: { kycStatus: vendor.kycStatus, reason: reason || null },
        ipAddress: req.ip ?? null,
      },
    });

    void revalidateCatalog('sellers');
    void revalidateCatalog('products');

    res.json({
      success: true,
      message: decision === 'approve' ? 'Seller approved and verified' : 'Seller asked to resubmit',
      data: { vendor },
    });
  } catch (error) {
    console.error('[ADMIN] kyc decision failed:', error);
    res.status(500).json({ success: false, message: 'Could not record that decision' });
  }
});

/**
 * @route GET /admin/vendors/:id/kyc/documents/:name
 * @description Stream one of a seller's identity documents
 * @access Admin only
 */
router.get('/vendors/:id/kyc/documents/:name', async (req: Request, res: Response) => {
  try {
    const shop = await prisma.vendorProfile.findUnique({
      where: { id: req.params.id },
      select: { id: true, kycDocuments: true },
    });
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
    console.error('[ADMIN] kyc document failed:', error);
    res.status(500).json({ success: false, message: 'Could not load that document' });
  }
});

/**
 * @route GET /admin/moderation/products
 * @description Seller listings waiting for review (or rejected, with ?status=REJECTED)
 * @access Admin only
 */
router.get('/moderation/products', async (req: Request, res: Response) => {
  try {
    const requested = String(req.query.status ?? 'PENDING').toUpperCase();
    const status = requested === 'REJECTED' ? 'REJECTED' : 'PENDING';
    const [products, pending, rejected] = await Promise.all([
      prisma.product.findMany({
        where: { moderationStatus: status },
        // Oldest first: the seller who has waited longest is next.
        orderBy: { updatedAt: 'asc' },
        take: 100,
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          price: true,
          originalPrice: true,
          quantity: true,
          status: true,
          thumbnail: true,
          images: true,
          shortDescription: true,
          description: true,
          moderationStatus: true,
          moderationNote: true,
          updatedAt: true,
          category: { select: { name: true } },
          brand: { select: { id: true, name: true, isActive: true } },
          vendor: { select: { id: true, shopName: true, shopSlug: true, isVerified: true, kycStatus: true } },
        },
      }),
      prisma.product.count({ where: { moderationStatus: 'PENDING' } }),
      prisma.product.count({ where: { moderationStatus: 'REJECTED' } }),
    ]);
    res.json({ success: true, data: { products, counts: { pending, rejected } } });
  } catch (error) {
    console.error('[ADMIN] moderation list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load the review queue' });
  }
});

/**
 * @route PATCH /admin/moderation/products/:id
 * @description Approve or reject a seller listing
 * @access Admin only
 */
router.patch('/moderation/products/:id', async (req: AuthRequest, res: Response) => {
  try {
    const decision = req.body?.decision;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ success: false, message: 'decision must be "approve" or "reject"' });
      return;
    }
    if (decision === 'reject' && !note) {
      res.status(400).json({ success: false, message: 'Tell the seller what to fix' });
      return;
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        moderationStatus: decision === 'approve' ? 'APPROVED' : 'REJECTED',
        moderationNote: decision === 'approve' ? null : note,
        moderatedAt: new Date(),
      },
      select: { id: true, name: true, moderationStatus: true, moderationNote: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId ?? null,
        action: decision === 'approve' ? 'LISTING_APPROVE' : 'LISTING_REJECT',
        resource: 'Product',
        resourceId: product.id,
        newValue: { note: note || null },
        ipAddress: req.ip ?? null,
      },
    });

    void revalidateCatalog('products');

    res.json({
      success: true,
      message: decision === 'approve' ? 'Listing approved' : 'Listing sent back to the seller',
      data: { product },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    console.error('[ADMIN] moderation decision failed:', error);
    res.status(500).json({ success: false, message: 'Could not record that decision' });
  }
});

/**
 * @route GET /admin/banners
 * @description Get all banners
 * @access Admin only
 */
router.get('/banners', async (req: Request, res: Response) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: { displayOrder: 'asc' },
    });

    res.json({
      success: true,
      message: 'Banners fetched',
      data: { banners },
    });
  } catch (error) {
    console.error('[ADMIN] banners list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve banners' });
  }
});

/**
 * @route POST /admin/banners
 * @description Create new banner
 * @access Admin only
 */
router.post('/banners', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickBannerFields((req.body ?? {}) as Record<string, unknown>);

    if (!isNonEmptyString(data.title)) errors.push('title is required');
    if (!isNonEmptyString(data.image)) errors.push('image is required');

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const banner = await prisma.banner.create({
      data: data as unknown as Prisma.BannerCreateInput,
    });

    res.status(201).json({
      success: true,
      message: 'Banner created',
      data: { banner },
    });
  } catch (error) {
    console.error('[ADMIN] banner create failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create banner' });
  }
});

/**
 * @route PUT /admin/banners/:id
 * @description Update banner
 * @access Admin only
 */
router.put('/banners/:id', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickBannerFields((req.body ?? {}) as Record<string, unknown>);

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    const banner = await prisma.banner.update({
      where: { id: req.params.id },
      data: data as unknown as Prisma.BannerUpdateInput,
    });

    res.json({
      success: true,
      message: 'Banner updated',
      data: { banner },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Banner not found' });
      return;
    }
    console.error('[ADMIN] banner update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update banner' });
  }
});

/**
 * @route DELETE /admin/banners/:id
 * @description Delete banner
 * @access Admin only
 */
router.delete('/banners/:id', async (req: Request, res: Response) => {
  try {
    await prisma.banner.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Banner deleted',
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Banner not found' });
      return;
    }
    console.error('[ADMIN] banner delete failed:', error);
    res.status(500).json({ success: false, message: 'Failed to delete banner' });
  }
});

/**
 * @route GET /admin/reports
 * @description Get sales and revenue reports
 * @access Admin only
 */
router.get('/reports', async (_req: Request, res: Response) => {
  try {
    const [orders, products, customers, reviews, productsAwaitingModeration, sellersAwaitingKyc] =
      await Promise.all([
        prisma.order.aggregate({ _sum: { total: true }, _count: { id: true } }),
        prisma.product.count({ where: { status: 'ACTIVE' } }),
        prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
        prisma.review.count({ where: { isPublished: false } }),
        prisma.product.count({ where: { moderationStatus: 'PENDING' } }),
        prisma.vendorProfile.count({ where: { kycStatus: 'PENDING' } }),
      ]);
    res.json({
      success: true,
      data: {
        revenue: orders._sum.total ?? 0,
        orderCount: orders._count.id,
        activeProducts: products,
        customers,
        reviewsAwaitingModeration: reviews,
        productsAwaitingModeration,
        sellersAwaitingKyc,
      },
    });
  } catch (error) {
    console.error('[ADMIN] reports failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load reports' });
  }
});

router.get('/inventory', async (_req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { quantity: 'asc' },
      select: { id: true, name: true, sku: true, quantity: true, status: true, updatedAt: true },
    });
    res.json({ success: true, data: { products } });
  } catch (error) {
    console.error('[ADMIN] inventory failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load inventory' });
  }
});

router.get('/returns', async (req: Request, res: Response) => {
  try {
    const requestType = typeof req.query.type === 'string' ? req.query.type : undefined;
    const requests = await prisma.returnRequest.findMany({
      where: requestType ? { requestType } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { order: { include: { user: { select: { email: true, firstName: true, lastName: true } } } } },
    });
    res.json({ success: true, data: { requests } });
  } catch (error) {
    console.error('[ADMIN] returns failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load return requests' });
  }
});

/**
 * @route PATCH /admin/returns/:id
 * @description Move a return request through its queue, and complete it
 * @access Admin only
 *
 * Completing a return is the part that used to be missing entirely. The row's
 * status string changed and nothing else did: the order stayed DELIVERED, the
 * goods stayed written off, no refund was recorded, and every sub-order stayed
 * DELIVERED with its `deliveredAt` still counting down to payable — so the
 * platform refunded the customer and paid the seller for the same parcel.
 *
 * COMPLETED therefore runs `completeReturn`, which restocks, records the refund
 * against the request, marks the order and its sub-orders RETURNED, and moves
 * the payment to REFUNDED. RETURNED is what `UNPAYABLE_STATUSES` in
 * utils/settlement looks for, so the seller drops out of the payout run.
 */
router.patch('/returns/:id', async (req: AuthRequest, res: Response) => {
  const { status, notes, refundAmount } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof status !== 'string' || !['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Invalid return status' });
    return;
  }
  if (notes !== undefined && typeof notes !== 'string') {
    res.status(400).json({ success: false, message: 'notes must be a string' });
    return;
  }
  try {
    const existing = await prisma.returnRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, orderId: true, status: true, order: { select: { total: true, status: true } } },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Return request not found' });
      return;
    }
    // A completed return has already restocked and refunded. Running it twice
    // would put the stock back a second time and record a second refund — so
    // the order's own status is checked too, because an admin can complete a
    // return from the order screen as well as from this queue.
    if (existing.status === 'COMPLETED' || existing.order.status === 'RETURNED') {
      res.status(409).json({
        success: false,
        message: 'This return has already been completed',
      });
      return;
    }

    let refund: number | undefined;
    if (refundAmount !== undefined && refundAmount !== null) {
      const amount = Number(refundAmount);
      if (!Number.isFinite(amount) || amount < 0 || amount > existing.order.total) {
        res.status(400).json({
          success: false,
          message: `refundAmount must be between 0 and the order total (${existing.order.total})`,
        });
        return;
      }
      refund = amount;
    }

    if (status !== 'COMPLETED') {
      const request = await prisma.returnRequest.update({
        where: { id: existing.id },
        data: { status, ...(typeof notes === 'string' ? { notes } : {}) },
      });
      res.json({ success: true, message: `Return marked ${status}`, data: { request } });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const completion = await completeReturn(tx, {
        orderId: existing.orderId,
        actorId: req.userId!,
        refundAmount: refund,
      });
      const request = await tx.returnRequest.update({
        where: { id: existing.id },
        data: {
          status: 'COMPLETED',
          ...(typeof notes === 'string' ? { notes } : {}),
          refundAmount: completion.refundAmount,
          refundDate: new Date(),
        },
      });
      return { request, completion };
    });

    res.json({
      success: true,
      message:
        result.completion.reversed.length > 0
          ? // Money already credited to the seller is taken back through the
            // ledger: a negative entry the next payout nets off by itself.
            `Return completed. ${result.completion.reversed
              .map((row) => `${row.orderNumber} (${formatRupees(row.amount)})`)
              .join(', ')} reversed in the seller's ledger and will be deducted from their next payout.`
          : 'Return completed, stock restored and refund recorded',
      data: {
        request: result.request,
        refundAmount: result.completion.refundAmount,
        settledBeforeReturn: result.completion.alreadySettled,
        ledgerReversals: result.completion.reversed,
      },
    });
  } catch (error) {
    console.error('[ADMIN] return update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update return request' });
  }
});

router.get('/reviews', async (_req: Request, res: Response) => {
  try {
    const reviews = await prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, firstName: true, lastName: true } }, product: { select: { name: true, slug: true } } },
    });
    res.json({ success: true, data: { reviews } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load reviews' });
  }
});

router.patch('/reviews/:id', async (req: Request, res: Response) => {
  if (typeof req.body?.isPublished !== 'boolean') {
    res.status(400).json({ success: false, message: 'isPublished must be a boolean' });
    return;
  }
  try {
    const review = await prisma.review.update({ where: { id: req.params.id }, data: { isPublished: req.body.isPublished } });
    // Hiding a review has to move the product's and the shop's stars too.
    await recomputeProductRating(review.productId);
    res.json({ success: true, data: { review } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update review' });
  }
});

router.get('/cod-insights', async (_req: Request, res: Response) => {
  try {
    const [pending, delivered, cancelled] = await Promise.all([
      prisma.order.aggregate({ where: { paymentMethod: 'COD', paymentStatus: 'PENDING' }, _count: { id: true }, _sum: { total: true } }),
      prisma.order.count({ where: { paymentMethod: 'COD', status: 'DELIVERED' } }),
      prisma.order.count({ where: { paymentMethod: 'COD', status: 'CANCELLED' } }),
    ]);
    res.json({ success: true, data: { pendingOrders: pending._count.id, pendingValue: pending._sum.total ?? 0, delivered, cancelled } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load COD insights' });
  }
});

router.get('/contact-requests', async (_req: Request, res: Response) => {
  try {
    const requests = await prisma.contactRequest.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: { requests } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load contact requests' });
  }
});

router.patch('/contact-requests/:id', async (req: Request, res: Response) => {
  const { status, notes } = req.body ?? {};
  if (typeof status !== 'string' || !['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Invalid contact request status' });
    return;
  }
  try {
    const request = await prisma.contactRequest.update({ where: { id: req.params.id }, data: { status, ...(typeof notes === 'string' ? { notes } : {}) } });
    res.json({ success: true, data: { request } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update contact request' });
  }
});

/** Whitelist + validate brand fields. */
const pickBrandFields = (
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name)) errors.push('name must be a non-empty string');
    else data.name = body.name.trim().slice(0, 80);
  }
  if (body.slug !== undefined) {
    if (!isNonEmptyString(body.slug)) errors.push('slug must be a non-empty string');
    else data.slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 80);
  }
  for (const field of ['description', 'logo', 'banner', 'metaTitle', 'metaDescription'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || value === '') data[field] = null;
    else if (typeof value !== 'string') errors.push(`${field} must be a string`);
    else data[field] = value.trim();
  }
  for (const field of ['isActive', 'isFeatured'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') errors.push(`${field} must be a boolean`);
    else data[field] = value;
  }
  if (body.displayOrder !== undefined) {
    const num = Number(body.displayOrder);
    if (!Number.isInteger(num)) errors.push('displayOrder must be an integer');
    else data.displayOrder = num;
  }

  return { data, errors };
};

/**
 * @route GET /admin/brands
 * @description Every brand, with how many live products carry it
 * @access Admin only
 */
router.get('/brands', async (_req: Request, res: Response) => {
  try {
    const brands = await prisma.brand.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: true } },
        // Who asked for it, for the approval queue.
        ownerVendor: { select: { id: true, shopName: true, applicationStatus: true } },
      },
    });
    res.json({ success: true, data: { brands } });
  } catch (error) {
    console.error('[ADMIN] brands list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load brands' });
  }
});

/**
 * @route POST /admin/brands
 * @description Create a brand
 * @access Admin only
 */
router.post('/brands', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickBrandFields((req.body ?? {}) as Record<string, unknown>);
    if (!isNonEmptyString(data.name)) errors.push('name is required');
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    // The slug is plumbing, not a decision: derived from the name unless the
    // admin typed one, so adding a brand is just typing its name.
    if (!isNonEmptyString(data.slug)) {
      data.slug = (data.name as string)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 80);
    }

    const brand = await prisma.brand.create({
      data: data as unknown as Prisma.BrandUncheckedCreateInput,
    });
    void revalidateCatalog('brands');
    res.status(201).json({ success: true, message: 'Brand created', data: { brand } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'A brand with this name or slug already exists' });
      return;
    }
    console.error('[ADMIN] brand create failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create brand' });
  }
});

/**
 * @route PUT /admin/brands/:id
 * @description Update a brand
 * @access Admin only
 */
router.put('/brands/:id', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickBrandFields((req.body ?? {}) as Record<string, unknown>);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    // A seller-registered brand goes live only through the review endpoint,
    // which checks its proof of ownership. The general editor cannot skip that.
    if (data.isActive === true) {
      const current = await prisma.brand.findUnique({ where: { id: req.params.id }, select: { status: true } });
      if (current && current.status !== 'APPROVED') {
        res.status(409).json({ success: false, message: 'Approve this brand in its review panel before activating it' });
        return;
      }
    }

    const brand = await prisma.brand.update({
      where: { id: req.params.id },
      data: data as unknown as Prisma.BrandUncheckedUpdateInput,
    });
    void revalidateCatalog('brands');
    res.json({ success: true, message: 'Brand updated', data: { brand } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ success: false, message: 'Brand not found' });
        return;
      }
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, message: 'A brand with this name or slug already exists' });
        return;
      }
    }
    console.error('[ADMIN] brand update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update brand' });
  }
});

/**
 * @route DELETE /admin/brands/:id
 * @description Remove a brand
 * @access Admin only
 *
 * Deactivates rather than deletes when products still carry it: the relation
 * nulls on delete, so removing a brand would silently strip it from every
 * product that had one.
 */
router.delete('/brands/:id', async (req: Request, res: Response) => {
  try {
    const brand = await prisma.brand.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) {
      res.status(404).json({ success: false, message: 'Brand not found' });
      return;
    }

    if (brand._count.products > 0) {
      const deactivated = await prisma.brand.update({
        where: { id: brand.id },
        data: { isActive: false },
      });
      void revalidateCatalog('brands');
      res.json({
        success: true,
        message: `Deactivated — ${brand._count.products} product(s) still carry this brand`,
        data: { brand: deactivated },
      });
      return;
    }

    await prisma.brand.delete({ where: { id: brand.id } });
    void revalidateCatalog('brands');
    res.json({ success: true, message: 'Brand removed' });
  } catch (error) {
    console.error('[ADMIN] brand delete failed:', error);
    res.status(500).json({ success: false, message: 'Failed to remove brand' });
  }
});

/**
 * @route PATCH /admin/brands/:id/review
 * @description Approve or reject a brand a seller registered
 * @access Admin only
 *
 * Body: { decision: 'approve' | 'reject', reason? }. Approving gives the brand
 * a storefront page and opens it to every shop (isActive); rejecting needs a
 * reason the seller will read, and takes it off their listing form.
 */
router.patch('/brands/:id/review', async (req: AuthRequest, res: Response) => {
  try {
    const decision = req.body?.decision;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ success: false, message: 'decision must be "approve" or "reject"' });
      return;
    }
    if (decision === 'reject' && !reason) {
      res.status(400).json({ success: false, message: 'Tell the seller why the brand was rejected' });
      return;
    }

    const current = await prisma.brand.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, isActive: true },
    });
    if (!current) {
      res.status(404).json({ success: false, message: 'Brand not found' });
      return;
    }

    const brand = await prisma.brand.update({
      where: { id: current.id },
      data:
        decision === 'approve'
          ? { status: 'APPROVED', isActive: true, rejectionReason: null }
          : { status: 'REJECTED', isActive: false, rejectionReason: reason },
      include: {
        _count: { select: { products: true } },
        ownerVendor: { select: { id: true, shopName: true, applicationStatus: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.userId ?? null,
        action: decision === 'approve' ? 'BRAND_APPROVE' : 'BRAND_REJECT',
        resource: 'Brand',
        resourceId: brand.id,
        oldValue: { status: current.status, isActive: current.isActive },
        newValue: { status: brand.status, reason: reason || null },
        ipAddress: req.ip ?? null,
      },
    });

    void revalidateCatalog('brands');
    res.json({
      success: true,
      message: decision === 'approve' ? 'Brand approved' : 'Brand rejected',
      data: { brand },
    });
  } catch (error) {
    console.error('[ADMIN] brand review failed:', error);
    res.status(500).json({ success: false, message: 'Could not record that decision' });
  }
});

/**
 * @route GET /admin/brands/:id/authorization-doc
 * @description Stream the trademark certificate or reseller letter behind a brand
 * @access Admin only
 *
 * Stored with the owning shop's KYC documents, in private storage.
 */
router.get('/brands/:id/authorization-doc', async (req: Request, res: Response) => {
  try {
    const brand = await prisma.brand.findUnique({
      where: { id: req.params.id },
      select: { ownerVendorId: true, authorizationDoc: true },
    });
    if (!brand?.ownerVendorId || !brand.authorizationDoc) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }
    const file = await readKycDocument(brand.ownerVendorId, brand.authorizationDoc);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.bytes);
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ADMIN] brand document failed:', error);
    res.status(500).json({ success: false, message: 'Could not load that document' });
  }
});

/**
 * @route GET /admin/settings
 * @description Platform switches the owner controls (see utils/settings.ts)
 * @access Admin only
 */
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: { settings: await getSettings() } });
  } catch (error) {
    console.error('[ADMIN] settings read failed:', error);
    res.status(500).json({ success: false, message: 'Could not load settings' });
  }
});

/**
 * @route PATCH /admin/settings
 * @description Change one or more platform switches
 * @access Admin only
 *
 * Body: { 'seller.applicationsOpen'?: boolean, 'commission.defaultRate'?: number }.
 * A new default commission applies to orders placed afterwards; orders already
 * placed keep the rate they were charged.
 */
router.patch('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const open = body['seller.applicationsOpen'];
    const rate = body['commission.defaultRate'];

    if (open !== undefined && typeof open !== 'boolean') {
      errors.push('seller.applicationsOpen must be true or false');
    }
    const rateNum = rate === undefined ? undefined : Number(rate);
    if (rateNum !== undefined && (rate === '' || rate === null || !Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100)) {
      errors.push('commission.defaultRate must be a number from 0 to 100');
    }
    if (open === undefined && rateNum === undefined) errors.push('Nothing to update');
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const before = await getSettings();
    if (typeof open === 'boolean') await setSetting('seller.applicationsOpen', open);
    if (rateNum !== undefined) await setSetting('commission.defaultRate', Math.round(rateNum * 100) / 100);
    const settings = await getSettings();

    await prisma.auditLog.create({
      data: {
        userId: req.userId ?? null,
        action: 'UPDATE',
        resource: 'SystemSetting',
        oldValue: before,
        newValue: settings,
        ipAddress: req.ip ?? null,
      },
    });

    res.json({ success: true, message: 'Settings saved', data: { settings } });
  } catch (error) {
    console.error('[ADMIN] settings update failed:', error);
    res.status(500).json({ success: false, message: 'Could not save settings' });
  }
});

/**
 * Whitelist + validate variant fields.
 *
 * A variant is one size of one colour. The shop grid renders a card per
 * distinct `color`, and the product page groups sizes under it, so `color` is
 * the field that decides how the catalogue looks — not a free-text note.
 */
const pickVariantFields = (
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
  if (body.isDefault !== undefined) {
    if (typeof body.isDefault !== 'boolean') errors.push('isDefault must be a boolean');
    else data.isDefault = body.isDefault;
  }

  // Per-size listing values: standard size, label flag, GTIN, measurements.
  const listing = pickVariantListingFields(body);
  Object.assign(data, listing.data);
  errors.push(...listing.errors);

  return { data, errors };
};

/**
 * @route GET /admin/products/:id/variants
 * @description Every size of every colour, oldest first
 * @access Admin only
 */
router.get('/products/:id/variants', async (req: Request, res: Response) => {
  try {
    const variants = await prisma.productVariant.findMany({
      where: { productId: req.params.id },
      orderBy: [{ color: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, data: { variants } });
  } catch (error) {
    console.error('[ADMIN] variants list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load variants' });
  }
});

/**
 * @route POST /admin/products/:id/variants
 * @description Add one size of one colour
 * @access Admin only
 */
router.post('/products/:id/variants', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickVariantFields((req.body ?? {}) as Record<string, unknown>);

    if (!isNonEmptyString(data.sku)) errors.push('sku is required');
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true },
    });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    // A readable default so the picker on the product page has something to
    // show when the admin did not type a name.
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
        isDefault: (data.isDefault as boolean | undefined) ?? false,
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

    res.status(201).json({ success: true, message: 'Variant added', data: { variant } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'A variant with this SKU already exists' });
      return;
    }
    console.error('[ADMIN] variant create failed:', error);
    res.status(500).json({ success: false, message: 'Failed to add variant' });
  }
});

/**
 * @route PUT /admin/products/:id/variants/:variantId
 * @description Update one variant
 * @access Admin only
 */
router.put('/products/:id/variants/:variantId', async (req: Request, res: Response) => {
  try {
    const { data, errors } = pickVariantFields((req.body ?? {}) as Record<string, unknown>);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    // Scoped to the product in the path so an id from another product cannot
    // be edited through this route.
    const existing = await prisma.productVariant.findFirst({
      where: { id: req.params.variantId, productId: req.params.id },
      select: { id: true, quantity: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Variant not found' });
      return;
    }

    const variant = await prisma.productVariant.update({
      where: { id: existing.id },
      data: data as unknown as Prisma.ProductVariantUncheckedUpdateInput,
    });

    // Restocking a size is what the back-in-stock list is waiting for.
    if (existing.quantity <= 0 && variant.quantity > 0) {
      void notifyRestocked(req.params.id, variant.id);
    }

    res.json({ success: true, message: 'Variant updated', data: { variant } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'A variant with this SKU already exists' });
      return;
    }
    console.error('[ADMIN] variant update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update variant' });
  }
});

/**
 * @route DELETE /admin/products/:id/variants/:variantId
 * @description Remove one size
 * @access Admin only
 */
router.delete('/products/:id/variants/:variantId', async (req: Request, res: Response) => {
  try {
    const deleted = await prisma.productVariant.deleteMany({
      where: { id: req.params.variantId, productId: req.params.id },
    });
    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: 'Variant not found' });
      return;
    }
    res.json({ success: true, message: 'Variant removed' });
  } catch (error) {
    // A variant referenced by an order line cannot be deleted without losing
    // what that order actually contained.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(409).json({
        success: false,
        message: 'This size appears on an existing order. Set its stock to 0 instead of deleting it.',
      });
      return;
    }
    console.error('[ADMIN] variant delete failed:', error);
    res.status(500).json({ success: false, message: 'Failed to remove variant' });
  }
});

/**
 * @route GET /admin/payouts
 * @description What each shop is owed, and what is still being held
 * @access Admin only
 *
 * Two figures per shop on purpose. "Due" is the shop's ledger balance — every
 * sale that has cleared the return window, less what has been paid and any
 * reversals or adjustments — and is what a settle pays. "Held" is money that
 * exists but is still in fulfilment, or inside the customer's right to send it
 * back. Collapsing them into one number is how a marketplace ends up paying
 * for a parcel that then comes back.
 *
 * Loading this page is also when newly eligible sub-orders are credited to the
 * ledger (utils/ledger `syncSales`), so the balance is current when read.
 */
router.get('/payouts', async (_req: Request, res: Response) => {
  try {
    await prisma.$transaction((tx) => syncSales(tx), { timeout: 30_000 });

    const [due, held, paidOut, shops, balanceByShop] = await Promise.all([
      prisma.sellerOrder.groupBy({
        by: ['vendorId'],
        where: payableWhere(),
        _sum: { payoutAmount: true, commissionAmount: true },
        _count: { _all: true },
      }),
      prisma.sellerOrder.groupBy({
        by: ['vendorId'],
        where: heldWhere(),
        _sum: { payoutAmount: true },
        _count: { _all: true },
      }),
      // What actually left the bank, including transfers made before the
      // ledger existed — every settle has always written a completed request.
      prisma.withdrawalRequest.groupBy({
        by: ['vendorId'],
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.vendorProfile.findMany({
        select: {
          id: true,
          shopName: true,
          shopSlug: true,
          isVerified: true,
          isActive: true,
          commissionRate: true,
          kycStatus: true,
          bankAccountName: true,
          bankAccountNumber: true,
          bankIFSC: true,
          bankName: true,
        },
      }),
      ledgerBalances(prisma),
    ]);

    const rows = shops
      .map((shop) => {
        const owed = due.find((row) => row.vendorId === shop.id);
        const pending = held.find((row) => row.vendorId === shop.id);
        const paid = paidOut.find((row) => row.vendorId === shop.id);
        const ledger = balanceByShop.get(shop.id) ?? 0;
        const { bankAccountNumber, ...rest } = shop;
        return {
          ...rest,
          // Enough to confirm the destination without printing the account.
          bankAccountLast4: last4(bankAccountNumber),
          canBePaid: Boolean(bankAccountNumber && shop.bankIFSC),
          /** Signed: negative means the shop owes the platform (a reversal). */
          ledgerBalance: ledger,
          /** What a settle would pay now — never negative. */
          payoutDue: Math.max(0, ledger),
          ordersDue: owed?._count._all ?? 0,
          commissionEarned: owed?._sum.commissionAmount ?? 0,
          payoutHeld: pending?._sum.payoutAmount ?? 0,
          ordersHeld: pending?._count._all ?? 0,
          payoutSettled: paid?._sum.amount ?? 0,
        };
      })
      .sort((a, b) => b.payoutDue - a.payoutDue);

    res.json({ success: true, data: { payouts: rows } });
  } catch (error) {
    console.error('[ADMIN] payouts failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load payouts' });
  }
});

/**
 * @route GET /admin/payouts/:vendorId
 * @description The unsettled sub-orders behind one shop's figures
 * @access Admin only
 */
router.get('/payouts/:vendorId', async (req: Request, res: Response) => {
  try {
    const orders = await prisma.sellerOrder.findMany({
      where: { vendorId: req.params.vendorId, settledAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
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
        // An open return withholds the payout, so the reason has to be able to
        // say so rather than leaving an admin to wonder where the money went.
        order: { select: { returnRequest: { select: { status: true } } } },
      },
    });
    const balance = await ledgerBalance(prisma, req.params.vendorId);

    // The same rule the query applies, stated per row, so an admin can see why
    // something is missing from the payable total instead of guessing.
    res.json({
      success: true,
      data: {
        balance,
        orders: orders.map(({ order: parent, ...row }) => ({
          ...row,
          hold: holdReason({ ...row, returnStatus: parent?.returnRequest?.status ?? null }),
        })),
      },
    });
  } catch (error) {
    console.error('[ADMIN] payout detail failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load that payout' });
  }
});

/**
 * @route POST /admin/payouts/:vendorId/settle
 * @description Pay a shop its ledger balance
 * @access Admin only
 *
 * This records that money left; it does not move it. There is no payout rail
 * wired up yet, so an admin makes the transfer and this keeps the ledger.
 *
 * The amount is the ledger balance, not a sum of sub-orders: a return reversed
 * since the last payout has already reduced it, which is how a clawback comes
 * off the next transfer without anyone having to remember it. A balance at or
 * below zero pays nothing.
 *
 * Written so it cannot pay twice: the shop's ledger is locked for the
 * transaction, so a second settle waits and then reads a balance of zero.
 */
router.post('/payouts/:vendorId/settle', async (req: AuthRequest, res: Response) => {
  try {
    const { vendorId } = req.params;
    const reference =
      typeof req.body?.transactionId === 'string'
        ? req.body.transactionId.trim().slice(0, 120) || null
        : null;

    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.vendorProfile.findUnique({
        where: { id: vendorId },
        select: { id: true, shopName: true },
      });
      if (!shop) return { ok: false as const, error: 'Seller not found', status: 404 };

      await lockVendorLedger(tx, vendorId);
      // Credit anything that cleared the window since the page was loaded, so
      // the figure paid is the figure that is true now.
      await syncSales(tx, vendorId);

      const amount = await ledgerBalance(tx, vendorId);
      if (amount <= 0) {
        return {
          ok: false as const,
          error:
            amount < 0
              ? `${shop.shopName} owes ${formatRupees(-amount)} from returns — it comes off their next sales`
              : 'Nothing is due to this seller right now',
          status: 409,
        };
      }

      const settledAt = new Date();
      const orders = await markCreditedSettled(tx, vendorId, settledAt);
      await postPayout(tx, { vendorId, amount, reference, createdBy: req.userId ?? null });

      // If the seller asked to be paid, this settles that request rather than
      // creating a second row beside it — otherwise their pending request would
      // sit there forever next to money that has already gone out.
      const requested = await tx.withdrawalRequest.findFirst({
        where: { vendorId, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const payment = {
        amount,
        status: 'COMPLETED',
        transactionId: reference,
        approvedBy: req.userId,
        approvedAt: settledAt,
        completedAt: settledAt,
      };
      const record = requested
        ? await tx.withdrawalRequest.update({ where: { id: requested.id }, data: payment })
        : await tx.withdrawalRequest.create({ data: { vendorId, ...payment } });
      await tx.vendorProfile.update({
        where: { id: vendorId },
        data: { totalEarnings: { increment: amount } },
      });

      return { ok: true as const, record, amount, orders, shopName: shop.shopName };
    });

    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.error });
      return;
    }

    res.json({
      success: true,
      message: `Settled ${formatRupees(result.amount)} across ${result.orders} order(s) for ${result.shopName}`,
      data: { withdrawal: result.record },
    });
  } catch (error) {
    console.error('[ADMIN] settle failed:', error);
    res.status(500).json({ success: false, message: 'Could not settle that payout' });
  }
});

/**
 * @route POST /admin/payouts/:vendorId/adjustments
 * @description A manual correction to a shop's ledger, either way
 * @access Admin only
 *
 * Positive means the platform owes the shop more (a goodwill credit, a missed
 * sale); negative means less (a courier claim, a penalty). A note is required:
 * an unexplained line on a seller's statement is a support ticket.
 */
router.post('/payouts/:vendorId/adjustments', async (req: AuthRequest, res: Response) => {
  try {
    const { vendorId } = req.params;
    const amount = Math.round(Number(req.body?.amount) * 100) / 100;
    const note = isNonEmptyString(req.body?.note) ? req.body.note.trim().slice(0, 500) : null;
    const reference = isNonEmptyString(req.body?.reference)
      ? req.body.reference.trim().slice(0, 120)
      : null;

    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10_000_000) {
      res.status(400).json({ success: false, message: 'Enter a non-zero amount in rupees' });
      return;
    }
    if (!note) {
      res.status(400).json({ success: false, message: 'A note explaining the adjustment is required' });
      return;
    }

    const shop = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      select: { id: true, shopName: true },
    });
    if (!shop) {
      res.status(404).json({ success: false, message: 'Seller not found' });
      return;
    }

    const { entry, newBalance } = await prisma.$transaction(async (tx) => {
      const created = await postAdjustment(tx, {
        vendorId,
        amount,
        note,
        reference,
        createdBy: req.userId ?? null,
      });
      return { entry: created, newBalance: await ledgerBalance(tx, vendorId) };
    });

    res.status(201).json({
      success: true,
      message: `Adjusted ${shop.shopName} by ${amount < 0 ? '−' : '+'}${formatRupees(Math.abs(amount))}. Balance now ${formatRupees(newBalance)}`,
      data: { entry, balance: newBalance },
    });
  } catch (error) {
    console.error('[ADMIN] ledger adjustment failed:', error);
    res.status(500).json({ success: false, message: 'Could not record that adjustment' });
  }
});

/**
 * @route GET /admin/payouts/:vendorId/statement
 * @description A shop's ledger, oldest first, with a running balance
 * @access Admin only
 *
 * `from` / `to` are ISO dates (inclusive); `format=csv` downloads it.
 */
router.get('/payouts/:vendorId/statement', async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    const parseDate = (value: unknown, endOfDay = false): Date | null => {
      if (typeof value !== 'string' || !value) return null;
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
      const date = new Date(dateOnly && endOfDay ? `${value}T23:59:59.999Z` : value);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);

    const shop = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      select: { id: true, shopName: true, shopSlug: true },
    });
    if (!shop) {
      res.status(404).json({ success: false, message: 'Seller not found' });
      return;
    }

    const stmt = await ledgerStatement(prisma, vendorId, { from, to });
    const subIds = [
      ...new Set(
        stmt.entries.map((entry) => entry.sellerOrderId).filter((id): id is string => Boolean(id))
      ),
    ];
    const subs = subIds.length
      ? await prisma.sellerOrder.findMany({
          where: { id: { in: subIds } },
          select: { id: true, orderNumber: true },
        })
      : [];
    const orderNumbers = new Map(subs.map((sub) => [sub.id, sub.orderNumber]));

    if (req.query.format === 'csv') {
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="statement-${shop.shopSlug}-${stamp}.csv"`);
      res.send(statementCsv(stmt, orderNumbers));
      return;
    }

    res.json({
      success: true,
      data: {
        shop,
        openingBalance: stmt.openingBalance,
        closingBalance: stmt.closingBalance,
        entries: stmt.entries.map((entry) => ({
          ...entry,
          orderNumber: entry.sellerOrderId ? orderNumbers.get(entry.sellerOrderId) ?? null : null,
        })),
      },
    });
  } catch (error) {
    console.error('[ADMIN] statement failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load that statement' });
  }
});

/**
 * @route GET /admin/withdrawals
 * @description Payout history, newest first
 * @access Admin only
 */
router.get('/withdrawals', async (_req: Request, res: Response) => {
  try {
    const withdrawals = await prisma.withdrawalRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { vendor: { select: { id: true, shopName: true, shopSlug: true } } },
    });
    res.json({ success: true, data: { withdrawals } });
  } catch (error) {
    console.error('[ADMIN] withdrawals failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load withdrawals' });
  }
});

/**
 * @route PATCH /admin/withdrawals/:id
 * @description Decline a payout request
 * @access Admin only
 *
 * A seller may only have one request open at a time, so without this a request
 * an admin does not intend to pay would block them from ever asking again. No
 * sub-order is touched — the money stays payable and can be settled later.
 */
router.patch('/withdrawals/:id', async (req: AuthRequest, res: Response) => {
  try {
    const reason = isNonEmptyString(req.body?.rejectionReason)
      ? req.body.rejectionReason.trim().slice(0, 500)
      : null;
    if (!reason) {
      res.status(400).json({ success: false, message: 'Give the seller a reason' });
      return;
    }

    const existing = await prisma.withdrawalRequest.findUnique({
      where: { id: req.params.id },
      select: { status: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Request not found' });
      return;
    }
    if (existing.status !== 'PENDING') {
      // Declining a payment already made would tell the seller they were not
      // paid when they were.
      res.status(409).json({
        success: false,
        message: `That request is already ${existing.status.toLowerCase()}`,
      });
      return;
    }

    const withdrawal = await prisma.withdrawalRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        approvedBy: req.userId,
        approvedAt: new Date(),
      },
    });

    res.json({ success: true, message: 'Request declined', data: { withdrawal } });
  } catch (error) {
    console.error('[ADMIN] withdrawal decline failed:', error);
    res.status(500).json({ success: false, message: 'Could not decline that request' });
  }
});

/**
 * @route GET /admin/newsletter-subscribers
 * @description Everyone who has signed up through the footer or homepage form
 * @access Admin only
 */
router.get('/newsletter-subscribers', async (_req: Request, res: Response) => {
  try {
    const subscribers = await prisma.newsletterSubscriber.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { subscribers } });
  } catch (error) {
    console.error('[ADMIN] newsletter subscribers failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load newsletter subscribers' });
  }
});

/**
 * @route PATCH /admin/newsletter-subscribers/:id
 * @description Unsubscribe or re-subscribe an address on the shopper's behalf
 * @access Admin only
 */
router.patch('/newsletter-subscribers/:id', async (req: Request, res: Response) => {
  const { isSubscribed } = req.body ?? {};
  if (typeof isSubscribed !== 'boolean') {
    res.status(400).json({ success: false, message: 'isSubscribed must be a boolean' });
    return;
  }
  try {
    const subscriber = await prisma.newsletterSubscriber.update({
      where: { id: req.params.id },
      data: { isSubscribed, unsubscribedAt: isSubscribed ? null : new Date() },
    });
    res.json({ success: true, data: { subscriber } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Subscriber not found' });
      return;
    }
    console.error('[ADMIN] newsletter update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update subscriber' });
  }
});

/**
 * @route GET /admin/stock-notifications
 * @description Back-in-stock requests — the demand signal for what to restock
 * @access Admin only
 *
 * Outstanding requests first, because that is the working list. Product and
 * variant are joined in so the row names the size that was actually wanted
 * rather than only the design.
 */
router.get('/stock-notifications', async (_req: Request, res: Response) => {
  try {
    const notifications = await prisma.stockNotification.findMany({
      orderBy: [{ notifiedAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        product: { select: { id: true, name: true, sku: true, quantity: true } },
        variant: { select: { id: true, name: true, sku: true, quantity: true } },
      },
    });
    res.json({ success: true, data: { notifications } });
  } catch (error) {
    console.error('[ADMIN] stock notifications failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load stock notifications' });
  }
});

/**
 * @route PATCH /admin/stock-notifications/:id
 * @description Mark a request as dealt with once the shopper has been told
 * @access Admin only
 *
 * Stamping `notifiedAt` is what takes the row off the outstanding list; it is
 * set by hand today because nothing sends the mail automatically yet.
 */
router.patch('/stock-notifications/:id', async (req: Request, res: Response) => {
  const { notified } = req.body ?? {};
  if (typeof notified !== 'boolean') {
    res.status(400).json({ success: false, message: 'notified must be a boolean' });
    return;
  }
  try {
    const notification = await prisma.stockNotification.update({
      where: { id: req.params.id },
      data: { notifiedAt: notified ? new Date() : null },
    });
    res.json({ success: true, data: { notification } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Request not found' });
      return;
    }
    console.error('[ADMIN] stock notification update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update request' });
  }
});

export default router;
