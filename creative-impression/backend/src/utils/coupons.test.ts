import type { Coupon } from '@prisma/client';
import { resolveCoupon, type CouponCartLine } from '@/utils/coupons';

/**
 * The restrictions an admin can set on a coupon were accepted by the console
 * and read by nothing, so "one per customer, B2B, jackets only" behaved as
 * unlimited, open to everybody, on everything. Each one is pinned here, along
 * with the deliberate gap: the cart preview knows only a subtotal, and a check
 * it cannot make is skipped rather than guessed at.
 */

const NOW = new Date('2026-09-20T12:00:00.000Z');

const coupon = (overrides: Partial<Coupon> = {}): Coupon => ({
  id: 'coupon-1',
  code: 'SAVE10',
  description: null,
  discountType: 'PERCENTAGE',
  discountValue: 10,
  minOrderAmount: 0,
  maxDiscount: null,
  usageLimit: null,
  usageCount: 0,
  perUserLimit: 1,
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  endDate: new Date('2026-10-01T00:00:00.000Z'),
  isActive: true,
  applicableCategories: [],
  applicableProducts: [],
  requireB2B: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const line = (overrides: Partial<CouponCartLine> = {}): CouponCartLine => ({
  productId: 'p1',
  categoryId: 'c1',
  price: 500,
  quantity: 1,
  ...overrides,
});

describe('resolveCoupon — the checks that always worked', () => {
  it('takes a percentage off', () => {
    expect(resolveCoupon(coupon(), 1000, { now: NOW }).discount).toBe(100);
  });

  it('caps a percentage at maxDiscount', () => {
    expect(resolveCoupon(coupon({ maxDiscount: 50 }), 1000, { now: NOW }).discount).toBe(50);
  });

  it('never discounts past free', () => {
    const result = resolveCoupon(
      coupon({ discountType: 'FIXED_AMOUNT', discountValue: 5000 }),
      1000,
      { now: NOW }
    );
    expect(result.discount).toBe(1000);
  });

  it('refuses a code outside its dates or over its limit', () => {
    expect(resolveCoupon(coupon({ isActive: false }), 1000, { now: NOW }).ok).toBe(false);
    expect(resolveCoupon(coupon({ endDate: new Date('2026-09-01') }), 1000, { now: NOW }).ok).toBe(false);
    expect(
      resolveCoupon(coupon({ usageLimit: 5, usageCount: 5 }), 1000, { now: NOW }).ok
    ).toBe(false);
    expect(resolveCoupon(coupon({ minOrderAmount: 2000 }), 1000, { now: NOW }).ok).toBe(false);
  });
});

describe('perUserLimit', () => {
  it('refuses a second use of a one-per-customer code', () => {
    const result = resolveCoupon(coupon(), 1000, { now: NOW, userUsageCount: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('You have already used this coupon');
  });

  it('allows a use still inside the limit', () => {
    expect(resolveCoupon(coupon({ perUserLimit: 3 }), 1000, { now: NOW, userUsageCount: 2 }).ok).toBe(
      true
    );
  });

  it('names the limit when it is more than one', () => {
    const result = resolveCoupon(coupon({ perUserLimit: 3 }), 1000, { now: NOW, userUsageCount: 3 });
    expect(result.error).toBe('You have already used this coupon 3 times');
  });

  it('treats a limit of zero as no limit', () => {
    expect(
      resolveCoupon(coupon({ perUserLimit: 0 }), 1000, { now: NOW, userUsageCount: 99 }).ok
    ).toBe(true);
  });

  it('cannot be checked by the cart preview, which does not know the buyer', () => {
    // Placement is authoritative; refusing here would decline valid codes.
    expect(resolveCoupon(coupon(), 1000, { now: NOW }).ok).toBe(true);
  });
});

describe('requireB2B', () => {
  const trade = coupon({ requireB2B: true });

  it('refuses a retail account', () => {
    const result = resolveCoupon(trade, 1000, { now: NOW, user: { role: 'RETAIL_CUSTOMER' } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('allows a trade account', () => {
    expect(resolveCoupon(trade, 1000, { now: NOW, user: { role: 'B2B_BUYER' } }).ok).toBe(true);
  });

  it('allows an account flagged B2B whatever its role', () => {
    expect(
      resolveCoupon(trade, 1000, { now: NOW, user: { role: 'RETAIL_CUSTOMER', isB2B: true } }).ok
    ).toBe(true);
  });

  it('is skipped when there is no buyer to check', () => {
    expect(resolveCoupon(trade, 1000, { now: NOW }).ok).toBe(true);
  });
});

describe('applicableProducts and applicableCategories', () => {
  it('discounts only the products the code names', () => {
    const items = [line({ productId: 'p1', price: 400 }), line({ productId: 'p2', price: 600 })];
    const result = resolveCoupon(coupon({ applicableProducts: ['p1'] }), 1000, { now: NOW, items });

    // 10% of the eligible ₹400, not of the ₹1000 basket.
    expect(result.eligibleSubtotal).toBe(400);
    expect(result.discount).toBe(40);
  });

  it('discounts only the categories the code names', () => {
    const items = [
      line({ categoryId: 'jackets', price: 800 }),
      line({ categoryId: 'mugs', price: 200 }),
    ];
    const result = resolveCoupon(coupon({ applicableCategories: ['jackets'] }), 1000, {
      now: NOW,
      items,
    });
    expect(result.discount).toBe(80);
  });

  it('counts a line that matches either list', () => {
    const items = [
      line({ productId: 'p1', categoryId: 'mugs', price: 300 }),
      line({ productId: 'p9', categoryId: 'jackets', price: 700 }),
    ];
    const result = resolveCoupon(
      coupon({ applicableProducts: ['p1'], applicableCategories: ['jackets'] }),
      1000,
      { now: NOW, items }
    );
    expect(result.eligibleSubtotal).toBe(1000);
  });

  it('multiplies the line quantity into what is eligible', () => {
    const items = [line({ productId: 'p1', price: 250, quantity: 4 })];
    const result = resolveCoupon(coupon({ applicableProducts: ['p1'] }), 1000, { now: NOW, items });
    expect(result.eligibleSubtotal).toBe(1000);
  });

  it('clamps a fixed-amount code to what it actually applies to', () => {
    const items = [line({ productId: 'p1', price: 300 }), line({ productId: 'p2', price: 700 })];
    const result = resolveCoupon(
      coupon({ discountType: 'FIXED_AMOUNT', discountValue: 500, applicableProducts: ['p1'] }),
      1000,
      { now: NOW, items }
    );
    // ₹500 off a ₹300 jacket is ₹300 off, not ₹500 off the whole basket.
    expect(result.discount).toBe(300);
  });

  it('declines when nothing in the basket qualifies', () => {
    const items = [line({ productId: 'p2', categoryId: 'mugs' })];
    const result = resolveCoupon(coupon({ applicableProducts: ['p1'] }), 500, { now: NOW, items });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('This coupon does not apply to anything in your basket');
  });

  it('still checks the minimum against the whole order, not the eligible part', () => {
    const items = [line({ productId: 'p1', price: 400 }), line({ productId: 'p2', price: 600 })];
    const result = resolveCoupon(
      coupon({ applicableProducts: ['p1'], minOrderAmount: 900 }),
      1000,
      { now: NOW, items }
    );
    expect(result.ok).toBe(true);
  });

  it('falls back to the whole subtotal for the preview, which cannot see the basket', () => {
    const result = resolveCoupon(coupon({ applicableProducts: ['p1'] }), 1000, { now: NOW });
    expect(result.discount).toBe(100);
  });
});
