import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, optionalAuth, roleMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { isNonEmptyString, parsePagination, pickProductFields, round2 } from '@/utils/helpers';

const router = Router();

const canManageProducts = roleMiddleware(['ADMIN', 'VENDOR']);

/** Resolve a product by id or slug. */
const findProductByIdOrSlug = (idOrSlug: string) =>
  prisma.product.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });

/** Recompute a product's aggregate rating fields from its published reviews. */
const recomputeProductRating = async (productId: string): Promise<void> => {
  const aggregate = await prisma.review.aggregate({
    where: { productId, isPublished: true },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      rating: round2(aggregate._avg.rating ?? 0),
      ratingCount: aggregate._count._all,
      reviewCount: aggregate._count._all,
    },
  });
};

// @route   GET /api/products
// @desc    Get all products with filters
// @access  Public
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { search, category, minPrice, maxPrice, featured, sortBy } = req.query;
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 12, 50);

    // 1. Build query based on filters
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };

    if (typeof search === 'string' && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    if (typeof category === 'string' && category.trim().length > 0) {
      where.category = {
        is: { OR: [{ slug: category.trim() }, { id: category.trim() }] },
      };
    }

    const priceFilter: Prisma.FloatFilter<'Product'> = {};
    const min = Number(minPrice);
    const max = Number(maxPrice);
    if (minPrice !== undefined && Number.isFinite(min)) priceFilter.gte = min;
    if (maxPrice !== undefined && Number.isFinite(max)) priceFilter.lte = max;
    if (priceFilter.gte !== undefined || priceFilter.lte !== undefined) {
      where.price = priceFilter;
    }

    if (featured === 'true') {
      where.isFeatured = true;
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    switch (sortBy) {
      case 'price_asc':
        orderBy = { price: 'asc' };
        break;
      case 'price_desc':
        orderBy = { price: 'desc' };
        break;
      case 'rating':
        orderBy = { rating: 'desc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    // 2. Paginate results
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // 3. Return products with metadata
    res.json({
      success: true,
      message: 'Products fetched',
      data: {
        products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('[PRODUCTS] list failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
    });
  }
});

// @route   GET /api/products/:idOrSlug
// @desc    Get single product by ID or slug
// @access  Public
router.get('/:idOrSlug', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { idOrSlug } = req.params;

    const product = await prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: true,
        customizations: true,
        bulkPricings: true,
      },
    });

    // Non-admins can only see ACTIVE products.
    if (!product || (product.status !== 'ACTIVE' && req.user?.role !== 'ADMIN')) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Product fetched',
      data: { product },
    });
  } catch (error) {
    console.error('[PRODUCTS] get failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
    });
  }
});

// @route   POST /api/products
// @desc    Create new product (Admin/Vendor)
// @access  Private
router.post('/', authMiddleware, canManageProducts, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { data, errors } = pickProductFields(body);

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
    console.error('[PRODUCTS] create failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product (Admin/Vendor)
// @access  Private
router.put('/:id', authMiddleware, canManageProducts, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { data, errors } = pickProductFields(body);

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
    console.error('[PRODUCTS] update failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
    });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product (Admin/Vendor) — soft delete to preserve order history
// @access  Private
router.delete('/:id', authMiddleware, canManageProducts, async (req: Request, res: Response) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { status: 'DISCONTINUED' },
    });

    res.json({
      success: true,
      message: 'Product discontinued',
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    console.error('[PRODUCTS] delete failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
    });
  }
});

// @route   GET /api/products/:id/reviews
// @desc    Get product reviews
// @access  Public
router.get('/:id/reviews', async (req: Request, res: Response) => {
  try {
    const product = await findProductByIdOrSlug(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const reviews = await prisma.review.findMany({
      where: { productId: product.id, isPublished: true },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    res.json({
      success: true,
      message: 'Reviews fetched',
      data: { reviews },
    });
  } catch (error) {
    console.error('[PRODUCTS] reviews failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
    });
  }
});

// @route   POST /api/products/:id/reviews
// @desc    Add or update product review (one per user per product)
// @access  Private
router.post('/:id/reviews', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rating, title, comment } = req.body ?? {};

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      res.status(400).json({ success: false, message: 'rating must be an integer between 1 and 5' });
      return;
    }
    if (title !== undefined && typeof title !== 'string') {
      res.status(400).json({ success: false, message: 'title must be a string' });
      return;
    }
    if (comment !== undefined && typeof comment !== 'string') {
      res.status(400).json({ success: false, message: 'comment must be a string' });
      return;
    }

    const product = await findProductByIdOrSlug(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const userId = req.userId!;

    // Verified purchase: the user has a DELIVERED order containing this product.
    const deliveredItem = await prisma.orderItem.findFirst({
      where: {
        productId: product.id,
        order: { userId, status: 'DELIVERED' },
      },
    });

    const review = await prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId } },
      update: {
        rating: numericRating,
        title: title ?? null,
        comment: comment ?? null,
        isVerified: Boolean(deliveredItem),
      },
      create: {
        productId: product.id,
        userId,
        rating: numericRating,
        title: title ?? null,
        comment: comment ?? null,
        isVerified: Boolean(deliveredItem),
      },
    });

    await recomputeProductRating(product.id);

    res.status(201).json({
      success: true,
      message: 'Review saved',
      data: { review },
    });
  } catch (error) {
    console.error('[PRODUCTS] add review failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add review',
    });
  }
});

export default router;
