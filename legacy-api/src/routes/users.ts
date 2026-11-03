import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { isNonEmptyString, parseAddressInput, sanitizeUser } from '@/utils/helpers';

const router = Router();

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: { b2bProfile: true },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Profile fetched',
      data: { user: sanitizeUser(user) },
    });
  } catch (error) {
    console.error('[USERS] get profile failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile (whitelisted fields only)
// @access  Private
router.put('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.UserUpdateInput = {};
    const errors: string[] = [];

    // Whitelist — role/status/email/password can never be mass-assigned here.
    for (const field of ['firstName', 'lastName', 'phone', 'profileImage'] as const) {
      const value = body[field];
      if (value === undefined) continue;
      if (value !== null && typeof value !== 'string') {
        errors.push(`${field} must be a string`);
      } else {
        data[field] = value;
      }
    }
    if (body.subscribeToNewsletter !== undefined) {
      if (typeof body.subscribeToNewsletter !== 'boolean') {
        errors.push('subscribeToNewsletter must be a boolean');
      } else {
        data.subscribeToNewsletter = body.subscribeToNewsletter;
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update' });
      return;
    }

    const user = await prisma.user.update({ where: { id: req.userId! }, data });

    res.json({
      success: true,
      message: 'Profile updated',
      data: { user: sanitizeUser(user) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'This phone number is already in use' });
      return;
    }
    console.error('[USERS] update profile failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
});

// @route   GET /api/users/addresses
// @desc    Get user addresses
// @access  Private
router.get('/addresses', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.userId! },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({
      success: true,
      message: 'Addresses fetched',
      data: { addresses },
    });
  } catch (error) {
    console.error('[USERS] get addresses failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses',
    });
  }
});

// @route   POST /api/users/addresses
// @desc    Add new address
// @access  Private
router.post('/addresses', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = parseAddressInput(req.body, 'address');
    if (!parsed.address) {
      res.status(400).json({ success: false, message: parsed.errors.join('. ') });
      return;
    }

    const isDefault = (req.body ?? {}).isDefault === true;
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.userId! },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: { userId: req.userId!, ...parsed.address, isDefault },
    });

    res.status(201).json({
      success: true,
      message: 'Address added',
      data: { address },
    });
  } catch (error) {
    console.error('[USERS] add address failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add address',
    });
  }
});

// @route   PUT /api/users/addresses/:id
// @desc    Update address (own only)
// @access  Private
router.put('/addresses/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.address.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Address not found' });
      return;
    }

    const parsed = parseAddressInput(req.body, 'address');
    if (!parsed.address) {
      res.status(400).json({ success: false, message: parsed.errors.join('. ') });
      return;
    }

    const isDefault = (req.body ?? {}).isDefault === true;
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.userId!, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.update({
      where: { id: existing.id },
      data: { ...parsed.address, isDefault },
    });

    res.json({
      success: true,
      message: 'Address updated',
      data: { address },
    });
  } catch (error) {
    console.error('[USERS] update address failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address',
    });
  }
});

// @route   DELETE /api/users/addresses/:id
// @desc    Delete address (own only)
// @access  Private
router.delete('/addresses/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await prisma.address.deleteMany({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: 'Address not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Address deleted',
    });
  } catch (error) {
    console.error('[USERS] delete address failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address',
    });
  }
});

// @route   GET /api/users/wishlist
// @desc    Get wishlist
// @access  Private
router.get('/wishlist', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const wishlist = await prisma.wishlist.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    res.json({
      success: true,
      message: 'Wishlist fetched',
      data: { wishlist },
    });
  } catch (error) {
    console.error('[USERS] get wishlist failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlist',
    });
  }
});

// @route   POST /api/users/wishlist
// @desc    Add product to wishlist (idempotent)
// @access  Private
router.post('/wishlist', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.body ?? {};
    if (!isNonEmptyString(productId)) {
      res.status(400).json({ success: false, message: 'productId is required' });
      return;
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const item = await prisma.wishlist.upsert({
      where: { userId_productId: { userId: req.userId!, productId } },
      update: {},
      create: { userId: req.userId!, productId },
      include: { product: true },
    });

    res.status(201).json({
      success: true,
      message: 'Product added to wishlist',
      data: { item },
    });
  } catch (error) {
    console.error('[USERS] add wishlist failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add to wishlist',
    });
  }
});

// @route   DELETE /api/users/wishlist/:productId
// @desc    Remove product from wishlist
// @access  Private
router.delete('/wishlist/:productId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await prisma.wishlist.deleteMany({
      where: { userId: req.userId!, productId: req.params.productId },
    });
    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: 'Wishlist item not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Product removed from wishlist',
    });
  } catch (error) {
    console.error('[USERS] remove wishlist failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove from wishlist',
    });
  }
});

export default router;
