import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateCart, getShapedCart } from '@/utils/cart';
import { isNonEmptyString, round2 } from '@/utils/helpers';

const router = Router();

// @route   GET /api/cart
// @desc    Get cart
// @access  Private
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const cart = await getShapedCart(req.userId!);

    res.json({
      success: true,
      message: 'Cart fetched',
      data: { cart },
    });
  } catch (error) {
    console.error('[CART] get failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart',
    });
  }
});

// @route   POST /api/cart/items
// @desc    Add item to cart
// @access  Private
router.post('/items', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity, variantId, customization } = req.body ?? {};

    if (!isNonEmptyString(productId)) {
      res.status(400).json({ success: false, message: 'productId is required' });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      res.status(400).json({ success: false, message: 'quantity must be an integer of at least 1' });
      return;
    }
    if (variantId !== undefined && !isNonEmptyString(variantId)) {
      res.status(400).json({ success: false, message: 'variantId must be a non-empty string' });
      return;
    }
    if (customization !== undefined && (typeof customization !== 'object' || customization === null)) {
      res.status(400).json({ success: false, message: 'customization must be an object' });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { customizations: true },
    });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    if (product.status !== 'ACTIVE' || product.moderationStatus !== 'APPROVED') {
      res.status(400).json({ success: false, message: 'Product is not available' });
      return;
    }

    const variant = variantId
      ? await prisma.productVariant.findFirst({ where: { id: variantId, productId } })
      : null;
    if (variantId && !variant) {
      res.status(400).json({ success: false, message: 'Variant not found for this product' });
      return;
    }

    const availableStock = variant ? variant.quantity : product.quantity;

    // Price snapshot: variant price (if any) else product price,
    // plus additionalCost of any chosen customizations (matched by id or name).
    let unitPrice = variant?.price ?? product.price;
    if (customization) {
      const chosenKeys = Object.keys(customization as Record<string, unknown>);
      for (const option of product.customizations) {
        if (chosenKeys.includes(option.id) || chosenKeys.includes(option.name)) {
          unitPrice += option.additionalCost;
        }
      }
    }
    unitPrice = round2(unitPrice);

    const cart = await getOrCreateCart(req.userId!);

    // Same product + variant already in cart without customization → increment.
    const existingItem = !customization
      ? cart.items.find(
          (item) =>
            item.productId === productId &&
            item.variantId === (variantId ?? null) &&
            item.customization === null
        )
      : undefined;

    const totalRequested = qty + (existingItem?.quantity ?? 0);
    if (totalRequested > availableStock) {
      res.status(400).json({ success: false, message: 'Insufficient stock for the requested quantity' });
      return;
    }

    if (existingItem) {
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: { increment: qty } },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          variantId: variantId ?? null,
          quantity: qty,
          price: unitPrice,
          customization:
            customization === undefined ? undefined : (customization as Prisma.InputJsonValue),
        },
      });
    }

    const freshCart = await getShapedCart(req.userId!);

    res.status(201).json({
      success: true,
      message: 'Item added to cart',
      data: { cart: freshCart },
    });
  } catch (error) {
    console.error('[CART] add item failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add to cart',
    });
  }
});

// @route   PATCH /api/cart/items/:id
// @desc    Update cart item quantity (0 removes the item)
// @access  Private
router.patch('/items/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const qty = Number((req.body ?? {}).quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      res.status(400).json({ success: false, message: 'quantity must be an integer of 0 or more' });
      return;
    }

    // Verify the item belongs to this user's cart.
    const item = await prisma.cartItem.findFirst({
      where: { id: req.params.id, cart: { userId: req.userId! } },
      include: { product: true, variant: true },
    });
    if (!item) {
      res.status(404).json({ success: false, message: 'Cart item not found' });
      return;
    }

    if (qty === 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      const availableStock = item.variant ? item.variant.quantity : item.product.quantity;
      if (qty > availableStock) {
        res.status(400).json({ success: false, message: 'Insufficient stock for the requested quantity' });
        return;
      }
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: qty } });
    }

    const cart = await getShapedCart(req.userId!);

    res.json({
      success: true,
      message: qty === 0 ? 'Item removed from cart' : 'Cart item updated',
      data: { cart },
    });
  } catch (error) {
    console.error('[CART] update item failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item',
    });
  }
});

// @route   DELETE /api/cart/items/:id
// @desc    Remove item from cart
// @access  Private
router.delete('/items/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await prisma.cartItem.deleteMany({
      where: { id: req.params.id, cart: { userId: req.userId! } },
    });
    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: 'Cart item not found' });
      return;
    }

    const cart = await getShapedCart(req.userId!);

    res.json({
      success: true,
      message: 'Item removed from cart',
      data: { cart },
    });
  } catch (error) {
    console.error('[CART] remove item failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove from cart',
    });
  }
});

// @route   DELETE /api/cart
// @desc    Clear cart
// @access  Private
router.delete('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.cartItem.deleteMany({
      where: { cart: { userId: req.userId! } },
    });

    const cart = await getShapedCart(req.userId!);

    res.json({
      success: true,
      message: 'Cart cleared',
      data: { cart },
    });
  } catch (error) {
    console.error('[CART] clear failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
    });
  }
});

export default router;
