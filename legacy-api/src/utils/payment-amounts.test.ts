import {
  amountMatches,
  fromPaise,
  refundableCap,
  resolveRefundAmount,
  toPaise,
} from '@/utils/payment-amounts';

/**
 * Rupees are stored as a Float and charged as integer paise, so every one of
 * these is really a test about IEEE 754 losing a paisa somewhere it matters.
 */

describe('toPaise', () => {
  it('converts whole rupees', () => {
    expect(toPaise(1)).toBe(100);
    expect(toPaise(1499)).toBe(149900);
  });

  it('rounds rather than truncating the binary representation', () => {
    // 1234.35 * 100 is 123434.99999999999 in double precision. Truncating —
    // which is what an implicit integer cast does — charges a paisa less than
    // the order says, and the payment then fails to reconcile against it.
    expect(1234.35 * 100).not.toBe(123435);
    expect(toPaise(1234.35)).toBe(123435);
  });

  it('handles the other classic float cases', () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(8.29)).toBe(829);
  });

  it('refuses a value that is not a finite number', () => {
    expect(() => toPaise(Number.NaN)).toThrow(TypeError);
    expect(() => toPaise(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('fromPaise', () => {
  it('round-trips a rupee amount', () => {
    expect(fromPaise(toPaise(1234.35))).toBe(1234.35);
    expect(fromPaise(toPaise(0.05))).toBe(0.05);
  });

  it('converts a gateway figure back for display', () => {
    expect(fromPaise(149900)).toBe(1499);
    expect(fromPaise(1)).toBe(0.01);
  });
});

describe('amountMatches', () => {
  it('accepts the exact amount', () => {
    expect(amountMatches(1499, 149900)).toBe(true);
    expect(amountMatches(1234.35, 123435)).toBe(true);
  });

  it('rejects a single paisa either way', () => {
    // No tolerance on purpose: the gateway charges precisely what it was asked
    // for, so a mismatch is a reconciliation problem and wants a human.
    expect(amountMatches(1499, 149901)).toBe(false);
    expect(amountMatches(1499, 149899)).toBe(false);
  });

  it('rejects a fractional paise figure, which no gateway sends', () => {
    expect(amountMatches(1499, 149900.5)).toBe(false);
  });
});

describe('refundableCap', () => {
  it('is the whole total when nothing has been refunded', () => {
    expect(refundableCap(1499)).toBe(149900);
  });

  it('subtracts what has already gone back', () => {
    expect(refundableCap(1499, 500)).toBe(99900);
  });

  it('never goes negative, so an over-refunded order offers nothing more', () => {
    expect(refundableCap(1499, 2000)).toBe(0);
    expect(refundableCap(1499, 1499)).toBe(0);
  });
});

describe('resolveRefundAmount', () => {
  it('defaults to the whole remaining balance', () => {
    expect(resolveRefundAmount(undefined, 1499)).toEqual({ ok: true, paise: 149900 });
    expect(resolveRefundAmount(undefined, 1499, 499)).toEqual({ ok: true, paise: 100000 });
  });

  it('accepts a partial refund inside the cap', () => {
    expect(resolveRefundAmount(500, 1499)).toEqual({ ok: true, paise: 50000 });
  });

  it('accepts a refund of exactly the remaining balance', () => {
    expect(resolveRefundAmount(1499, 1499)).toEqual({ ok: true, paise: 149900 });
  });

  it('refuses more than is left to refund', () => {
    const result = resolveRefundAmount(2000, 1499);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('exceeds');
  });

  it('refuses a second full refund', () => {
    const result = resolveRefundAmount(undefined, 1499, 1499);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('already been refunded');
  });

  it('refuses zero and negative amounts', () => {
    // A negative refund is the one that some gateways read as a fresh charge.
    expect(resolveRefundAmount(0, 1499).ok).toBe(false);
    expect(resolveRefundAmount(-100, 1499).ok).toBe(false);
  });

  it('refuses a non-finite amount', () => {
    expect(resolveRefundAmount(Number.NaN, 1499).ok).toBe(false);
  });
});
