import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '@/lib/prisma';

const router = Router();

// An unauthenticated lookup keyed on an order number doubles as an email
// oracle: supplying a guessed address and watching `verified` flip tells a
// caller whether it is the address on that order. The redaction below is the
// real defence; this ceiling stops it being brute-forced at speed.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many tracking lookups. Please try again shortly.' },
});

// @route   GET /api/track-order?orderNumber=&email=
// @desc    Public order lookup — no login required
// @access  Public
//
// The caller proves access by supplying the order number AND the email used at
// checkout. Without a matching email only the status is returned, never the
// items, address or total.
router.get('/', trackLimiter, async (req: Request, res: Response) => {
  try {
    const orderNumber = String(req.query.orderNumber ?? req.query.order_number ?? '').trim();
    const email = String(req.query.email ?? '').trim().toLowerCase();

    if (!orderNumber) {
      res.status(400).json({ success: false, message: 'Enter your order number.' });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        user: { select: { email: true } },
        shippingAddress: { select: { email: true, city: true, state: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true, thumbnail: true } },
          },
        },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found. Check the order number and try again.',
      });
      return;
    }

    // Either address on the order counts: the account email, or the one typed
    // into the shipping form (guests and gifts often differ).
    const candidates = [order.user?.email, order.shippingAddress?.email]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    const verified = Boolean(email) && candidates.includes(email);

    if (!verified) {
      res.json({
        success: true,
        message: 'Order found',
        data: {
          order: {
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            createdAt: order.createdAt,
            verified: false,
          },
        },
      });
      return;
    }

    res.json({
      success: true,
      message: 'Order found',
      data: {
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          createdAt: order.createdAt,
          total: order.total,
          subtotal: order.subtotal,
          discount: order.discount,
          shippingCost: order.shippingCost,
          trackingNumber: order.trackingNumber,
          carrier: order.carrier,
          estimatedDelivery: order.estimatedDelivery,
          actualDelivery: order.actualDelivery,
          destination: order.shippingAddress
            ? [order.shippingAddress.city, order.shippingAddress.state].filter(Boolean).join(', ')
            : null,
          items: order.items.map((item) => ({
            id: item.id,
            name: item.product?.name ?? 'Item',
            slug: item.product?.slug ?? null,
            thumbnail: item.product?.thumbnail ?? null,
            quantity: item.quantity,
            price: item.price,
            sku: item.sku,
          })),
          timeline: order.timeline.map((entry) => ({
            status: entry.status,
            message: entry.message,
            createdAt: entry.createdAt,
          })),
          verified: true,
        },
      },
    });
  } catch (error) {
    console.error('[TRACK-ORDER] lookup failed:', error);
    res.status(500).json({ success: false, message: 'Could not look up that order. Please try again.' });
  }
});

export default router;
