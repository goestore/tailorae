import type { Coupon, Prisma, PrismaClient } from '@prisma/client';
import { round2 } from '@/utils/helpers';

/**
 * The one place that decides whether a coupon applies and what it is worth.
 *
 * Order placement (`POST /api/orders`) and the cart's "apply code" preview
 * (`POST /api/coupons/apply`) both call this. They used to be separate
 * arithmetic, which is how a cart can quote a discount the order then refuses —
 * the shopper sees the total change at the last step and reads it as a bug.
 */
export interface CouponResult {
  ok: boolean;
  /** HTTP status to answer with when `ok` is false. */
  status: number;
  error?: string;
  /** Rupee value of the discount, already clamped to the subtotal. */
  discount: number;
}

const fail = (status: number, error: string): CouponResult => ({
  ok: false,
  status,
  error,
  discount: 0,
});

export function resolveCoupon(
  coupon: Coupon | null,
  subtotal: number,
  now: Date = new Date()
): CouponResult {
  if (!coupon || !coupon.isActive) return fail(400, 'Invalid or expired coupon code');
  if (coupon.startDate > now) return fail(400, 'This coupon is not active yet');
  if (coupon.endDate < now) return fail(400, 'This coupon has expired');
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return fail(400, 'This coupon has reached its usage limit');
  }
  if (subtotal < coupon.minOrderAmount) {
    return fail(400, `Coupon requires a minimum order amount of ${coupon.minOrderAmount}`);
  }

  let discount: number;
  if (coupon.discountType === 'PERCENTAGE') {
    discount = (subtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.discountValue;
  }

  // A fixed-amount code worth more than the cart must not make the total
  // negative, and a 100% code must not go past free.
  return { ok: true, status: 200, discount: round2(Math.min(discount, subtotal)) };
}

/**
 * Look a coupon up by the code a shopper typed.
 *
 * Codes are stored exactly as the admin entered them and the unique index is
 * case-sensitive, so an exact hit always wins; the case-insensitive pass is a
 * fallback so someone typing `save10` into the cart is not told their valid
 * code is invalid.
 */
export async function findCouponByCode(
  client: PrismaClient | Prisma.TransactionClient,
  code: string
): Promise<Coupon | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const exact = await client.coupon.findUnique({ where: { code: trimmed } });
  if (exact) return exact;
  return client.coupon.findFirst({
    where: { code: { equals: trimmed, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  });
}
