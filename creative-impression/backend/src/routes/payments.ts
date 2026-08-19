import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';

const router = Router();

// @route   POST /api/payments/razorpay/create-order
// @desc    Create Razorpay order
// @access  Private
router.post('/razorpay/create-order', authMiddleware, async (req: AuthRequest, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Razorpay integration not configured yet',
  });
});

// @route   POST /api/payments/razorpay/verify
// @desc    Verify Razorpay payment
// @access  Private
router.post('/razorpay/verify', authMiddleware, async (req: AuthRequest, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Razorpay integration not configured yet',
  });
});

// @route   POST /api/payments/stripe/create-payment-intent
// @desc    Create Stripe payment intent
// @access  Private
router.post('/stripe/create-payment-intent', authMiddleware, async (req: AuthRequest, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Stripe integration not configured yet',
  });
});

// @route   POST /api/payments/paypal/create-order
// @desc    Create PayPal order
// @access  Private
router.post('/paypal/create-order', authMiddleware, async (req: AuthRequest, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'PayPal integration not configured yet',
  });
});

// @route   GET /api/payments/:id
// @desc    Get payment details (looks up own order by payment ID or order ID)
// @access  Private
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id }, { paymentId: id }],
        ...(req.user?.role === 'ADMIN' ? {} : { userId: req.userId! }),
      },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        paymentMethod: true,
        paymentId: true,
        receiptUrl: true,
        invoiceUrl: true,
        subtotal: true,
        discount: true,
        tax: true,
        shippingCost: true,
        total: true,
        createdAt: true,
      },
    });

    if (!order) {
      res.status(404).json({ success: false, message: 'Payment not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Payment details fetched',
      data: { payment: order },
    });
  } catch (error) {
    console.error('[PAYMENTS] get failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
    });
  }
});

export default router;
