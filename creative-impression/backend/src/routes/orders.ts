import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import {
  HttpError,
  isHttpError,
  isNonEmptyString,
  parseAddressInput,
  randomSuffix,
  round2,
} from '@/utils/helpers';

const router = Router();

const orderInclude = {
  items: {
    include: {
      product: { select: { id: true, name: true, slug: true, thumbnail: true } },
    },
  },
  shippingAddress: true,
  billingAddress: true,
  timeline: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

// Free shipping threshold and flat rate (INR).
const FREE_SHIPPING_THRESHOLD = 999;
const FLAT_SHIPPING_COST = 49;

// @route   GET /api/orders
// @desc    Get user orders
// @access  Private
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true, thumbnail: true } },
          },
        },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    res.json({
      success: true,
      message: 'Orders fetched',
      data: { orders },
    });
  } catch (error) {
    console.error('[ORDERS] list failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Get order details
// @access  Private
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: orderInclude,
    });

    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (order.userId !== req.userId && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'You do not have access to this order' });
      return;
    }

    res.json({
      success: true,
      message: 'Order fetched',
      data: { order },
    });
  } catch (error) {
    console.error('[ORDERS] get failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
    });
  }
});

// @route   POST /api/orders
// @desc    Create new order (checkout) — COD only for now
// @access  Private
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { shippingAddress, billingAddress, paymentMethod, couponCode, notes } = req.body ?? {};
    const userId = req.userId!;

    // Validate addresses
    const shippingParsed = parseAddressInput(shippingAddress, 'shippingAddress');
    if (!shippingParsed.address) {
      res.status(400).json({ success: false, message: shippingParsed.errors.join('. ') });
      return;
    }
    let billingParsed: typeof shippingParsed | null = null;
    if (billingAddress !== undefined && billingAddress !== null) {
      billingParsed = parseAddressInput(billingAddress, 'billingAddress');
      if (!billingParsed.address) {
        res.status(400).json({ success: false, message: billingParsed.errors.join('. ') });
        return;
      }
    }

    // Only COD is supported until a payment gateway is configured.
    if (paymentMethod !== 'COD') {
      res.status(400).json({ success: false, message: 'Only COD is available right now' });
      return;
    }
    if (couponCode !== undefined && !isNonEmptyString(couponCode)) {
      res.status(400).json({ success: false, message: 'couponCode must be a non-empty string' });
      return;
    }
    if (notes !== undefined && typeof notes !== 'string') {
      res.status(400).json({ success: false, message: 'notes must be a string' });
      return;
    }

    const orderId = await prisma.$transaction(async (tx) => {
      // 1. Load cart
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: { items: { include: { product: true, variant: true } } },
      });
      if (!cart || cart.items.length === 0) {
        throw new HttpError(400, 'Your cart is empty');
      }

      // 2. Re-check stock per item
      for (const item of cart.items) {
        const availableStock = item.variant ? item.variant.quantity : item.product.quantity;
        if (item.quantity > availableStock) {
          throw new HttpError(409, `Insufficient stock for ${item.product.name}`);
        }
      }

      // 3. Create address rows
      const shipping = await tx.address.create({
        data: { userId, ...shippingParsed.address! },
      });
      const billing = billingParsed?.address
        ? await tx.address.create({ data: { userId, ...billingParsed.address } })
        : shipping; // billing defaults to shipping

      // 4. Compute totals from cart snapshot prices
      const subtotal = round2(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));

      // 5. Validate coupon
      let discount = 0;
      let appliedCouponCode: string | null = null;
      if (isNonEmptyString(couponCode)) {
        const coupon = await tx.coupon.findUnique({ where: { code: couponCode.trim() } });
        const now = new Date();
        if (
          !coupon ||
          !coupon.isActive ||
          coupon.startDate > now ||
          coupon.endDate < now ||
          (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
        ) {
          throw new HttpError(400, 'Invalid or expired coupon code');
        }
        if (subtotal < coupon.minOrderAmount) {
          throw new HttpError(400, `Coupon requires a minimum order amount of ${coupon.minOrderAmount}`);
        }

        if (coupon.discountType === 'PERCENTAGE') {
          discount = (subtotal * coupon.discountValue) / 100;
          if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
        } else {
          discount = coupon.discountValue;
        }
        discount = round2(Math.min(discount, subtotal));
        appliedCouponCode = coupon.code;

        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usageCount: { increment: 1 } },
        });
      }

      const shippingCost = subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_COST;
      const tax = 0; // TODO: GST calculation
      const total = round2(subtotal - discount + shippingCost + tax);

      const orderNumber = `CI-${Date.now()}-${randomSuffix(4)}`;

      // 6. Create order + items (copy snapshot data from cart)
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: 'COD',
          shippingAddressId: shipping.id,
          billingAddressId: billing.id,
          subtotal,
          discount,
          discountCode: appliedCouponCode,
          tax,
          shippingCost,
          total,
          gstNumber: shippingParsed.address!.gstNumber,
          notes: isNonEmptyString(notes) ? notes.trim() : null,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              price: item.price,
              customization:
                item.customization === null
                  ? undefined
                  : (item.customization as Prisma.InputJsonValue),
              mockupImage: item.mockupImage,
              sku: item.variant?.sku ?? item.product.sku,
            })),
          },
        },
      });

      // 7. Decrement stock and record inventory movements
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
      }
      await tx.inventoryTracking.createMany({
        data: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          type: 'stock_out',
          reference: orderNumber,
        })),
      });

      // 8. Timeline + clear cart
      await tx.orderTimeline.create({
        data: { orderId: order.id, status: 'PENDING', message: 'Order placed', createdBy: userId },
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order.id;
    });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: { order },
    });
  } catch (error) {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    console.error('[ORDERS] create failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
    });
  }
});

// @route   PATCH /api/orders/:id/cancel
// @desc    Cancel order (only PENDING/CONFIRMED)
// @access  Private
router.patch('/:id/cancel', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (existing.userId !== req.userId) {
      res.status(403).json({ success: false, message: 'You do not have access to this order' });
      return;
    }
    if (existing.status !== 'PENDING' && existing.status !== 'CONFIRMED') {
      res.status(409).json({
        success: false,
        message: `Order can no longer be cancelled (status: ${existing.status})`,
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED', paymentStatus: 'CANCELLED' },
      });

      // Restock products
      for (const item of existing.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }
      await tx.inventoryTracking.createMany({
        data: existing.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          type: 'return',
          reference: existing.orderNumber,
        })),
      });

      await tx.orderTimeline.create({
        data: {
          orderId: existing.id,
          status: 'CANCELLED',
          message: 'Order cancelled by customer',
          createdBy: req.userId!,
        },
      });
    });

    const order = await prisma.order.findUnique({
      where: { id: existing.id },
      include: orderInclude,
    });

    res.json({
      success: true,
      message: 'Order cancelled',
      data: { order },
    });
  } catch (error) {
    console.error('[ORDERS] cancel failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
    });
  }
});

// @route   PATCH /api/orders/:id/return
// @desc    Request return for order (only DELIVERED)
// @access  Private
router.patch('/:id/return', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { reason, description } = req.body ?? {};

    if (!isNonEmptyString(reason)) {
      res.status(400).json({ success: false, message: 'reason is required' });
      return;
    }
    if (description !== undefined && typeof description !== 'string') {
      res.status(400).json({ success: false, message: 'description must be a string' });
      return;
    }

    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { returnRequest: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (existing.userId !== req.userId) {
      res.status(403).json({ success: false, message: 'You do not have access to this order' });
      return;
    }
    if (existing.status !== 'DELIVERED') {
      res.status(409).json({ success: false, message: 'Only delivered orders can be returned' });
      return;
    }
    if (existing.returnRequest) {
      res.status(409).json({ success: false, message: 'A return has already been requested for this order' });
      return;
    }

    const returnRequest = await prisma.returnRequest.create({
      data: {
        orderId: existing.id,
        reason: reason.trim(),
        description: isNonEmptyString(description) ? description.trim() : null,
      },
    });

    await prisma.orderTimeline.create({
      data: {
        orderId: existing.id,
        status: 'RETURN_REQUESTED',
        message: 'Return requested by customer',
        createdBy: req.userId!,
      },
    });

    res.json({
      success: true,
      message: 'Return requested',
      data: { returnRequest },
    });
  } catch (error) {
    console.error('[ORDERS] return failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request return',
    });
  }
});

export default router;
