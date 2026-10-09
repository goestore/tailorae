import {
  allocateProportionally,
  allocateSellerOrders,
  sellerOrderNumber,
  type SellerGroup,
} from '@/utils/order-split';

/**
 * These are the money rules, so they are pinned rather than eyeballed.
 *
 * Every case here is one that a naive implementation gets wrong: a discount
 * that does not divide evenly, a rate applied after a rate change, a fully
 * discounted basket, house stock mixed with sellers.
 */

/** A seller with a single line — the shape most of these cases need. */
const one = (vendorId: string | null, commissionRate: number, subtotal: number): SellerGroup => ({
  vendorId,
  lines: [{ subtotal, commissionRate }],
});

const sum = (values: number[]): number =>
  Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;

describe('allocateProportionally', () => {
  it('splits exactly when the division is clean', () => {
    expect(allocateProportionally(10000, [5000, 5000])).toEqual([5000, 5000]);
  });

  it('never loses or invents a paisa on an uneven split', () => {
    // ₹100 across three equal sellers: 3333.33… paise each.
    const shares = allocateProportionally(10000, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(shares).toEqual([3334, 3333, 3333]);
  });

  it('weights the split by subtotal', () => {
    const shares = allocateProportionally(9999, [7000, 3000]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(9999);
    expect(shares[0]).toBeGreaterThan(shares[1]);
  });

  it('spreads evenly when every weight is zero rather than dropping the amount', () => {
    const shares = allocateProportionally(101, [0, 0]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(101);
  });

  it('returns zeroes for a zero amount', () => {
    expect(allocateProportionally(0, [100, 200])).toEqual([0, 0]);
  });

  it('handles an empty basket', () => {
    expect(allocateProportionally(500, [])).toEqual([]);
  });
});

describe('allocateSellerOrders', () => {
  const groups: SellerGroup[] = [
    one('shop-a', 10, 700),
    one('shop-b', 15, 300),
  ];

  it('reconciles: the parts sum to the order the customer paid', () => {
    const orderDiscount = 100;
    const orderShipping = 49;
    const allocations = allocateSellerOrders(groups, orderDiscount, orderShipping);

    expect(sum(allocations.map((a) => a.discount))).toBe(orderDiscount);
    expect(sum(allocations.map((a) => a.shippingCost))).toBe(orderShipping);
    // subtotal - discount + shipping, which is what the order charged.
    expect(sum(allocations.map((a) => a.total))).toBe(1000 - orderDiscount + orderShipping);
  });

  it('reconciles on an amount that does not divide evenly', () => {
    const thirds: SellerGroup[] = [
      one('a', 10, 10),
      one('b', 10, 10),
      one('c', 10, 10),
    ];
    const allocations = allocateSellerOrders(thirds, 10, 1);
    expect(sum(allocations.map((a) => a.discount))).toBe(10);
    expect(sum(allocations.map((a) => a.shippingCost))).toBe(1);
  });

  it('charges commission on the discounted value, not the list price', () => {
    const [shopA] = allocateSellerOrders(groups, 100, 0);
    // 700 subtotal, 70 of the 100 discount → 630 net, 10% → 63.
    expect(shopA.discount).toBe(70);
    expect(shopA.commissionAmount).toBe(63);
    expect(shopA.payoutAmount).toBe(567);
  });

  it('does not take commission on shipping', () => {
    const withShipping = allocateSellerOrders(
      [one('a', 10, 100)],
      0,
      49
    )[0];
    expect(withShipping.commissionAmount).toBe(10);
    // The shipping the customer paid is in the total but not in the payout —
    // it covers the courier, and is not the seller's revenue.
    expect(withShipping.total).toBe(149);
    expect(withShipping.payoutAmount).toBe(90);
  });

  it('charges house stock nothing — there is no third party to pay', () => {
    const [house] = allocateSellerOrders(
      [one(null, 10, 500)],
      0,
      0
    );
    expect(house.commissionAmount).toBe(0);
    expect(house.commissionRate).toBe(0);
    expect(house.payoutAmount).toBe(500);
  });

  it('uses the rate it was given, so a later rate change cannot rewrite history', () => {
    const atOrderTime = allocateSellerOrders(
      [one('a', 10, 1000)],
      0,
      0
    )[0];
    const afterRaise = allocateSellerOrders(
      [one('a', 25, 1000)],
      0,
      0
    )[0];
    expect(atOrderTime.commissionAmount).toBe(100);
    expect(afterRaise.commissionAmount).toBe(250);
    expect(atOrderTime.commissionRate).toBe(10);
  });

  it('never drives a payout negative on a fully discounted basket', () => {
    const allocations = allocateSellerOrders(groups, 1000, 0);
    for (const allocation of allocations) {
      expect(allocation.payoutAmount).toBeGreaterThanOrEqual(0);
      expect(allocation.commissionAmount).toBe(0);
    }
    expect(sum(allocations.map((a) => a.total))).toBe(0);
  });

  it('mixes house stock and a seller in one order', () => {
    const mixed = allocateSellerOrders(
      [
        one(null, 0, 400),
        one('shop-a', 20, 600),
      ],
      0,
      49
    );
    expect(sum(mixed.map((a) => a.total))).toBe(1049);
    expect(mixed[0].commissionAmount).toBe(0);
    expect(mixed[1].commissionAmount).toBe(120);
  });

  it('charges each line its own rate and sums them exactly', () => {
    // One shop selling into two categories: kids at 15%, men's at 10%.
    const [shop] = allocateSellerOrders(
      [
        {
          vendorId: 'shop-a',
          lines: [
            { subtotal: 600, commissionRate: 15 },
            { subtotal: 400, commissionRate: 10 },
          ],
        },
      ],
      100,
      0
    );
    // 100 discount → 60 / 40 by line; nets 540 and 360 → 81 + 36.
    expect(shop.lines.map((line) => line.discount)).toEqual([60, 40]);
    expect(shop.lines.map((line) => line.commissionAmount)).toEqual([81, 36]);
    expect(shop.commissionAmount).toBe(117);
    expect(shop.payoutAmount).toBe(783);
    // 117 / 900 = 13%.
    expect(shop.commissionRate).toBe(13);
  });

  it('keeps line discounts and commissions reconciling to the sub-order on awkward numbers', () => {
    const allocations = allocateSellerOrders(
      [
        {
          vendorId: 'a',
          lines: [
            { subtotal: 333.33, commissionRate: 12.5 },
            { subtotal: 99.99, commissionRate: 7 },
            { subtotal: 0.01, commissionRate: 30 },
          ],
        },
        one('b', 9, 251.17),
        one(null, 0, 77.77),
      ],
      123.45,
      49
    );
    for (const allocation of allocations) {
      expect(sum(allocation.lines.map((line) => line.discount))).toBe(allocation.discount);
      expect(sum(allocation.lines.map((line) => line.subtotal))).toBe(allocation.subtotal);
      expect(sum(allocation.lines.map((line) => line.commissionAmount))).toBe(
        allocation.commissionAmount
      );
      expect(
        Math.round((allocation.subtotal - allocation.discount - allocation.commissionAmount) * 100) /
          100
      ).toBe(allocation.payoutAmount);
    }
    expect(sum(allocations.map((a) => a.discount))).toBe(123.45);
    expect(sum(allocations.map((a) => a.total))).toBe(
      Math.round((333.33 + 99.99 + 0.01 + 251.17 + 77.77 - 123.45 + 49) * 100) / 100
    );
  });

  it('reports the line rate as the sub-order rate when there is no net value', () => {
    const [shop] = allocateSellerOrders([one('a', 15, 200)], 200, 0);
    expect(shop.commissionAmount).toBe(0);
    expect(shop.commissionRate).toBe(15);
  });

  it('charges house stock lines nothing whatever rate they carry', () => {
    const [house] = allocateSellerOrders([one(null, 20, 100)], 0, 0);
    expect(house.lines[0]).toMatchObject({ commissionRate: 0, commissionAmount: 0 });
  });

  it('handles an order with no items', () => {
    expect(allocateSellerOrders([], 0, 0)).toEqual([]);
  });
});

describe('sellerOrderNumber', () => {
  it('suffixes the parent order so the relationship is readable', () => {
    expect(sellerOrderNumber('CI-1234', 0)).toBe('CI-1234-A');
    expect(sellerOrderNumber('CI-1234', 1)).toBe('CI-1234-B');
  });

  it('keeps going past 26 sellers rather than colliding', () => {
    expect(sellerOrderNumber('CI-1', 25)).toBe('CI-1-Z');
    expect(sellerOrderNumber('CI-1', 26)).toBe('CI-1-AA');
    expect(sellerOrderNumber('CI-1', 27)).toBe('CI-1-AB');
  });
});
