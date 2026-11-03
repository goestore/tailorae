import { Router, Request, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { findCouponByCode, resolveCoupon } from '@/utils/coupons';
import { isNonEmptyString } from '@/utils/helpers';

const router = Router();

// @route   POST /api/coupons/apply
// @desc    Preview the discount a code is worth for a given subtotal
// @access  Public
//
// Deliberately does NOT increment usageCount — that happens when the order is
// placed, so an abandoned cart cannot burn a limited-use code. The arithmetic
// is shared with order placement (utils/coupons) so the quoted discount and the
// charged discount cannot drift.
router.post('/apply', async (req: Request, res: Response) => {
  try {
    const { code, subtotal } = (req.body ?? {}) as Record<string, unknown>;

    if (!isNonEmptyString(code)) {
      res.status(400).json({ success: false, message: 'Enter a coupon code.' });
      return;
    }
    const amount = Number(subtotal);
    if (!Number.isFinite(amount) || amount < 0) {
      res.status(400).json({ success: false, message: 'subtotal must be a positive number' });
      return;
    }

    const coupon = await findCouponByCode(prisma, code);
    const result = resolveCoupon(coupon, amount);
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.error });
      return;
    }

    res.json({
      success: true,
      message: 'Coupon applied',
      data: {
        coupon: {
          code: coupon!.code,
          description: coupon!.description,
          discountType: coupon!.discountType,
          discountValue: coupon!.discountValue,
          discount: result.discount,
        },
      },
    });
  } catch (error) {
    console.error('[COUPONS] apply failed:', error);
    res.status(500).json({ success: false, message: 'Could not check that coupon. Please try again.' });
  }
});

export default router;
