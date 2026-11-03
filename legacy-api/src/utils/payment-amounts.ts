/**
 * Rupees on our side, paise on the gateway's.
 *
 * `Order.total` is a `Float` holding rupees, because that is how the rest of
 * the storefront prices things. Razorpay works exclusively in the smallest
 * currency unit and rejects anything that is not an integer. Converting
 * between the two by hand at each call site is how an order for ₹1,234.35 gets
 * sent as 123434 paise: `1234.35 * 100` is `123434.99999999999` in IEEE 754,
 * and `Math.trunc` — or an implicit cast — silently loses the paisa. It is one
 * paisa, and it is also a payment whose amount does not match the order it is
 * attached to, which is a reconciliation problem rather than a rounding one.
 *
 * Everything here rounds rather than truncates, and the reconciliation check
 * compares integers so a float never decides whether a customer paid enough.
 */

/** Rupees to integer paise, rounded to the nearest paisa. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new TypeError(`Cannot convert ${rupees} to paise`);
  }
  return Math.round(rupees * 100);
}

/** Integer paise back to rupees, for display and for writing to a Float column. */
export function fromPaise(paise: number): number {
  if (!Number.isFinite(paise)) {
    throw new TypeError(`Cannot convert ${paise} from paise`);
  }
  return Math.round(paise) / 100;
}

/**
 * Whether a gateway amount settles one of our orders.
 *
 * Exact equality, deliberately. There is no tolerance to be generous with:
 * Razorpay charges precisely the integer we asked it to, so a mismatch means
 * the payment belongs to a different order, an order whose total changed after
 * the gateway order was created, or a tampered request. All three want a human,
 * not a fuzzy comparison that lets the first one through.
 */
export function amountMatches(expectedRupees: number, paidPaise: number): boolean {
  return Number.isInteger(paidPaise) && toPaise(expectedRupees) === paidPaise;
}

/**
 * The most that may still be refunded against an order, in paise.
 *
 * Guards the refund route from the two mistakes that move real money the wrong
 * way: refunding more than was collected, and refunding a negative amount —
 * which some gateways happily read as a fresh charge.
 */
export function refundableCap(orderTotalRupees: number, alreadyRefundedRupees = 0): number {
  const cap = toPaise(orderTotalRupees) - toPaise(alreadyRefundedRupees);
  return cap > 0 ? cap : 0;
}

/**
 * Validate a requested refund against what is left to refund.
 *
 * Returns the amount in paise to send to the gateway, or a reason it must not
 * be sent. An omitted amount means "the whole remaining balance", which is what
 * a return completion asks for.
 */
export function resolveRefundAmount(
  requestedRupees: number | undefined,
  orderTotalRupees: number,
  alreadyRefundedRupees = 0
): { ok: true; paise: number } | { ok: false; message: string } {
  const cap = refundableCap(orderTotalRupees, alreadyRefundedRupees);
  if (cap <= 0) {
    return { ok: false, message: 'This order has already been refunded in full' };
  }
  if (requestedRupees === undefined) {
    return { ok: true, paise: cap };
  }
  if (!Number.isFinite(requestedRupees) || requestedRupees <= 0) {
    return { ok: false, message: 'Refund amount must be a positive number of rupees' };
  }
  const paise = toPaise(requestedRupees);
  if (paise > cap) {
    return {
      ok: false,
      message: `Refund amount exceeds the ${fromPaise(cap)} still refundable on this order`,
    };
  }
  return { ok: true, paise };
}
