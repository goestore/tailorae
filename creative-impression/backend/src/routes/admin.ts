import { Router, Request, Response } from 'express';
import { OrderStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import {
  isNonEmptyString,
  parseDateInput,
  parsePagination,
  pickProductFields,
  sanitizeUser,
} from '@/utils/helpers';

const router = Router();

// authMiddleware must run before adminOnly so req.user is populated;
// applying both router-wide guards every admin route.
router.use(authMiddleware, adminOnly);

// Order statuses that can no longer be changed.
const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];

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

    res.json({
      success: true,
      message: 'Dashboard fetched',
      data: {
        stats: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalRevenue: paidRevenue._sum.total ?? 0,
          codPendingRevenue: codPending._sum.total ?? 0,
          pendingOrders,
        },
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
    const { search, role } = req.query;
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
 * @route GET /admin/products
 * @description Get all products (any status) with filtering
 * @access Admin only
 */
router.get('/products', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 20, 100);

    const where: Prisma.ProductWhereInput = {};
    if (typeof search === 'string' && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { sku: { contains: search.trim(), mode: 'insensitive' } },
        { slug: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { category: { select: { id: true, name: true, slug: true } } },
      }),
      prisma.product.count({ where }),
    ]);

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

    const product = await prisma.product.create({
      data: data as unknown as Prisma.ProductUncheckedCreateInput,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    res.status(201).json({
      success: true,
      message: 'Product created',
      data: { product },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'A product with this slug or SKU already exists' });
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

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: data as unknown as Prisma.ProductUncheckedUpdateInput,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

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
        res.status(409).json({ success: false, message: 'A product with this slug or SKU already exists' });
        return;
      }
    }
    console.error('[ADMIN] product update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
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
 * @route GET /admin/categories
 * @description Categories, for the product form's category picker
 * @access Admin only
 */
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        _count: { select: { products: true } },
      },
    });

    res.json({ success: true, message: 'Categories fetched', data: { categories } });
  } catch (error) {
    console.error('[ADMIN] categories list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

/**
 * @route POST /admin/categories
 * @description Create a category
 * @access Admin only
 */
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';

    if (!name || !slug) {
      res.status(400).json({ success: false, message: 'name and slug are required' });
      return;
    }
    // The slug reaches the storefront as a URL segment.
    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({
        success: false,
        message: 'slug must be lowercase letters, digits and hyphens',
      });
      return;
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description: typeof body.description === 'string' ? body.description : null,
        image: typeof body.image === 'string' ? body.image : null,
      },
    });

    res.status(201).json({ success: true, message: 'Category created', data: { category } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'A category with this name or slug already exists' });
      return;
    }
    console.error('[ADMIN] category create failed:', error);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

/**
 * @route GET /admin/orders
 * @description Get all orders with filtering
 * @access Admin only
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 20, 100);

    const where: Prisma.OrderWhereInput = {};
    if (typeof status === 'string' && status.length > 0) {
      if (!(Object.values(OrderStatus) as string[]).includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status filter' });
        return;
      }
      where.status = status as OrderStatus;
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
 * @route PATCH /admin/orders/:id/status
 * @description Update order status
 * @access Admin only
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

    const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (TERMINAL_ORDER_STATUSES.includes(existing.status)) {
      res.status(409).json({
        success: false,
        message: `Order status can no longer be changed (status: ${existing.status})`,
      });
      return;
    }

    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        ...(nextStatus === 'DELIVERED' ? { actualDelivery: new Date() } : {}),
      },
    });

    await prisma.orderTimeline.create({
      data: {
        orderId: order.id,
        status: nextStatus,
        message: `Status changed to ${nextStatus}`,
        createdBy: req.userId!,
      },
    });

    res.json({
      success: true,
      message: 'Order status updated',
      data: { order },
    });
  } catch (error) {
    console.error('[ADMIN] order status failed:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
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
    const vendors = await prisma.vendorProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
      },
    });

    res.json({
      success: true,
      message: 'Vendors fetched',
      data: { vendors },
    });
  } catch (error) {
    console.error('[ADMIN] vendors list failed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors' });
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

    const vendor = await prisma.vendorProfile.update({
      where: { id: req.params.id },
      data: { isVerified: isVerified === undefined ? true : isVerified },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

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
router.get('/reports', (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Reports are not implemented yet',
  });
});

export default router;
