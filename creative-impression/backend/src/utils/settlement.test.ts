import {
  RETURN_WINDOW_DAYS,
  holdReason,
  payableCutoff,
  payableWhere,
} from '@/utils/settlement';

/**
 * When money becomes payable is the rule most worth pinning: pay a day early
 * and a valid return has already been settled against a shop that no longer
 * owes it back.
 */

const NOW = new Date('2026-09-20T12:00:00.000Z');
const daysAgo = (days: number): Date =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe('payableCutoff', () => {
  it('is exactly the return window behind now', () => {
    expect(payableCutoff(NOW).toISOString()).toBe(daysAgo(RETURN_WINDOW_DAYS).toISOString());
  });
});

describe('payableWhere', () => {
  it('only ever asks for delivered, unsettled sub-orders', () => {
    const where = payableWhere(undefined, NOW);
    expect(where.status).toBe('DELIVERED');
    expect(where.settledAt).toBeNull();
  });

  it('excludes house stock, which has nobody to pay', () => {
    expect(payableWhere(undefined, NOW).vendorId).toEqual({ not: null });
  });

  it('scopes to one shop when asked', () => {
    expect(payableWhere('shop-a', NOW).vendorId).toBe('shop-a');
  });

  it('withholds a payout while a return is open on the parent order', () => {
    // A return opened on day two completes on day nine; without this the
    // seven-day window would have paid the seller out from under it.
    expect(payableWhere(undefined, NOW).order).toEqual({
      OR: [{ returnRequest: { is: null } }, { returnRequest: { status: 'REJECTED' } }],
    });
  });
});

describe('holdReason', () => {
  const base = { status: 'DELIVERED', deliveredAt: daysAgo(10), settledAt: null };

  it('clears a delivery that is past the return window', () => {
    expect(holdReason(base, NOW)).toBeNull();
  });

  it('holds a delivery still inside the window, and says how long is left', () => {
    const reason = holdReason({ ...base, deliveredAt: daysAgo(2) }, NOW);
    expect(reason).toBe('In return window — 5 more days');
  });

  it('uses the singular on the last day', () => {
    const reason = holdReason({ ...base, deliveredAt: daysAgo(6) }, NOW);
    expect(reason).toBe('In return window — 1 more day');
  });

  it('holds anything not yet delivered', () => {
    expect(holdReason({ ...base, status: 'SHIPPED' }, NOW)).toBe('Not delivered yet');
    expect(holdReason({ ...base, status: 'PENDING' }, NOW)).toBe('Not delivered yet');
  });

  it('never pays a cancelled or returned order', () => {
    expect(holdReason({ ...base, status: 'CANCELLED' }, NOW)).toBe('Order cancelled');
    expect(holdReason({ ...base, status: 'RETURNED' }, NOW)).toBe('Order returned');
  });

  it('will not pay the same order twice', () => {
    expect(holdReason({ ...base, settledAt: daysAgo(1) }, NOW)).toBe('Already settled');
  });

  it('holds a delivery whose customer has opened a return', () => {
    expect(holdReason({ ...base, returnStatus: 'PENDING' }, NOW)).toBe(
      'Customer has opened a return'
    );
    expect(holdReason({ ...base, returnStatus: 'APPROVED' }, NOW)).toBe(
      'Customer has opened a return'
    );
  });

  it('pays out once a return has been rejected', () => {
    expect(holdReason({ ...base, returnStatus: 'REJECTED' }, NOW)).toBeNull();
  });

  it('holds a delivery with no recorded date rather than guessing', () => {
    expect(holdReason({ ...base, deliveredAt: null }, NOW)).toBe('Delivery date not recorded');
  });

  it('treats the boundary as payable, matching the query', () => {
    // Exactly `RETURN_WINDOW_DAYS` old: the query uses `lte`, so it is in.
    expect(holdReason({ ...base, deliveredAt: daysAgo(RETURN_WINDOW_DAYS) }, NOW)).toBeNull();
  });
});
