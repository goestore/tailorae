import type { Coupon, Prisma, PrismaClient } from '@prisma/client';
import { round2 } from '@/utils/helpers';

/**
 * The one place that decides whether a coupon applies and what it is worth.
 *
 * Order placement (`POST /api/orders`) and the cart's "apply code" preview
 * (`POST /api/coupons/apply`) both call this. They used to be separate
 * arithmetic, which is how a cart can quote a discount the order then refuses —
 * the shopper sees the total change at the last step and reads it as a bug.
 *
 * The admin console has always accepted four further restrictions — a per-buyer
 * limit, a B2B-only flag, and lists of products and categories a code is good
 * for — and nothing ever read them back. A code created as "one per customer,
 * B2B, jackets only" behaved as unlimited, open to everybody, on everything.
 * They are enforced below, with one deliberate asymmetry described in
 * `CouponContext`: the preview cannot see who is asking or what is in the
 * basket, so it answers on what it can check and placement is authoritative.
 */
export interface CouponResult {
  ok: boolean;
  /** HTTP status to answer with when `ok` is false. */
  status: number;
  error?: string;
  /** Rupee value of the discount, already clamped to what it applies to. */
  discount: number;
  /**
   * The part of the basket the code was worth anything against. Equal to the
   * subtotal for an unrestricted code; smaller when the code is limited to
   * particular products or categories.
   */
  eligibleSubtotal?: number;
}

/** One basket line, as the product and category restrictions need to see it. */
export interface CouponCartLine {
  productId: string;
  categoryId: string;
  price: number;
  quantity: number;
}

/**
 * What is known about the request beyond its subtotal.
 *
 * Every field is optional because there are two callers with different
 * knowledge. Checkout knows the buyer and every line of their basket, so every
 * restriction is enforced there. The cart preview is handed nothing but a
 * number, so a check it cannot perform is skipped rather than guessed at — the
 * alternative is refusing a valid code because the endpoint could not see the
 * basket, which is worse than quoting a code that checkout later declines.
 */
export interface CouponContext {
  now?: Date;
  /** The buyer, when known. */
  user?: { role?: string | null; isB2B?: boolean | null } | null;
  /** The basket, when known. */
  items?: readonly CouponCartLine[];
  /** How many times this buyer has already used this code. */
  userUsageCount?: number;
}

const fail = (status: number, error: string): CouponResult => ({
  ok: false,
  status,
  error,
  discount: 0,
});

/** Whether a basket line falls inside a code's product/category restriction. */
const lineIsEligible = (coupon: Coupon, line: CouponCartLine): boolean => {
  const byProduct = coupon.applicableProducts.length > 0 && coupon.applicableProducts.includes(line.productId);
  const byCategory =
    coupon.applicableCategories.length > 0 && coupon.applicableCategories.includes(line.categoryId);
  return byProduct || byCategory;
};

export function resolveCoupon(
  coupon: Coupon | null,
  subtotal: number,
  context: CouponContext = {}
): CouponResult {
  const now = context.now ?? new Date();

  if (!coupon || !coupon.isActive) return fail(400, 'Invalid or expired coupon code');
  if (coupon.startDate > now) return fail(400, 'This coupon is not active yet');
  if (coupon.endDate < now) return fail(400, 'This coupon has expired');
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return fail(400, 'This coupon has reached its usage limit');
  }

  /**
   * The per-buyer limit, which is the restriction most often the point of a
   * code: "one per customer" is meaningless if the same account can spend it
   * every day. A limit of 0 is treated as no limit, matching the column's
   * default of 1 meaning exactly one use.
   */
  if (
    coupon.perUserLimit > 0 &&
    context.userUsageCount !== undefined &&
    context.userUsageCount >= coupon.perUserLimit
  ) {
    return fail(
      400,
      coupon.perUserLimit === 1
        ? 'You have already used this coupon'
        : `You have already used this coupon ${coupon.perUserLimit} times`
    );
  }

  // A trade-only code on a retail account. Checked against the buyer's role
  // rather than the address on the order: a GST number typed into a shipping
  // form is not an approved trade account.
  if (coupon.requireB2B && context.user) {
    const isB2B = context.user.isB2B === true || context.user.role === 'B2B_BUYER';
    if (!isB2B) return fail(403, 'This coupon is only available to business accounts');
  }

  if (subtotal < coupon.minOrderAmount) {
    return fail(400, `Coupon requires a minimum order amount of ${coupon.minOrderAmount}`);
  }

  /**
   * Product and category restrictions narrow what the discount is computed on
   * rather than rejecting the whole basket. A "20% off jackets" code on a
   * basket of a jacket and a mug takes 20% off the jacket — refusing the code
   * outright would be wrong, and discounting the mug would be worse. Only when
   * nothing at all qualifies is the code declined, with a reason the shopper
   * can act on.
   */
  const restricted =
    coupon.applicableProducts.length > 0 || coupon.applicableCategories.length > 0;

  let eligibleSubtotal = subtotal;
  if (restricted && context.items) {
    eligibleSubtotal = round2(
      context.items
        .filter((line) => lineIsEligible(coupon, line))
        .reduce((sum, line) => sum + line.price * line.quantity, 0)
    );
    if (eligibleSubtotal <= 0) {
      return fail(400, 'This coupon does not apply to anything in your basket');
    }
  }

  let discount: number;
  if (coupon.discountType === 'PERCENTAGE') {
    discount = (eligibleSubtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.discountValue;
  }

  // A fixed-amount code worth more than what it applies to must not make the
  // total negative, and a 100% code must not go past free.
  return {
    ok: true,
    status: 200,
    discount: round2(Math.min(discount, eligibleSubtotal)),
    eligibleSubtotal,
  };
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

/**
 * How many times one buyer has already used a code.
 *
 * Read from placed orders rather than a counter, because there is no per-user
 * counter to keep in step — and a cancelled order should hand the use back, so
 * cancellations are excluded here exactly as they release the global count.
 */
export async function countCouponUsesByUser(
  client: PrismaClient | Prisma.TransactionClient,
  code: string,
  userId: string
): Promise<number> {
  return client.order.count({
    where: { userId, discountCode: code, status: { not: 'CANCELLED' } },
  });
}
