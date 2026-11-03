import type { Prisma } from '@prisma/client';

/**
 * When a seller's money actually becomes payable.
 *
 * The naive rule — "anything not yet settled" — pays a shop for a parcel that
 * is still in a van, and for one the customer is about to send back. Money paid
 * out and then clawed back is the worst version of this, so the gate is:
 *
 *   delivered, and past the return window the customer was promised.
 *
 * The window is the same seven days the return policy states. Keeping the two
 * in step matters: pay a day early and a valid return has already been settled
 * against a shop that no longer owes it back.
 */

/** Days after delivery before a sub-order can be paid out. Matches the return policy. */
export const RETURN_WINDOW_DAYS = 7;

/** Statuses that will never be paid — the sale did not stand. */
export const UNPAYABLE_STATUSES = ['CANCELLED', 'RETURNED'] as const;

/** The moment before which a delivery is out of its return window. */
export function payableCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Return requests that do not stand in the way of a payout.
 *
 * A return that has been rejected is over, so the money is the seller's after
 * all. Anything else — pending, approved, in progress — is a claim on this
 * parcel, and paying it out while that claim is open is the clawback the whole
 * module exists to avoid. The status only becomes RETURNED when the return
 * completes, which can easily be after the seven-day window has elapsed.
 */
const NO_OPEN_RETURN: Prisma.OrderWhereInput = {
  OR: [{ returnRequest: { is: null } }, { returnRequest: { status: 'REJECTED' } }],
};

/**
 * The full test for "this money can go out now", as one reusable clause so the
 * payable and held queries cannot drift apart: held is defined below as its
 * exact complement.
 */
function clearedForPayout(now: Date): Prisma.SellerOrderWhereInput {
  return {
    status: 'DELIVERED',
    deliveredAt: { not: null, lte: payableCutoff(now) },
    order: NO_OPEN_RETURN,
  };
}

/**
 * Sub-orders a shop can be paid for right now.
 *
 * `deliveredAt` rather than `updatedAt`: the clock starts when the customer got
 * the parcel, not when the row was last touched.
 */
export function payableWhere(vendorId?: string, now: Date = new Date()): Prisma.SellerOrderWhereInput {
  return {
    ...(vendorId ? { vendorId } : { vendorId: { not: null } }),
    settledAt: null,
    ...clearedForPayout(now),
  };
}

/**
 * Sub-orders that will become payable but have not yet: still in fulfilment, or
 * delivered and inside the return window. Shown to a seller separately so
 * "due" means due, and money in the pipeline is visible rather than missing.
 */
export function heldWhere(vendorId?: string, now: Date = new Date()): Prisma.SellerOrderWhereInput {
  return {
    ...(vendorId ? { vendorId } : { vendorId: { not: null } }),
    settledAt: null,
    status: { notIn: [...UNPAYABLE_STATUSES] },
    NOT: clearedForPayout(now),
  };
}

/**
 * Why one sub-order is not payable yet, in words a seller can act on.
 * Returns null when it is payable.
 *
 * `returnStatus` is the parent order's return request, when the caller read it.
 * Omitting it only costs the seller an explanation — the query is what actually
 * withholds the money — but a payout that silently fails to appear is precisely
 * the thing this function exists to prevent.
 */
export function holdReason(
  order: {
    status: string;
    deliveredAt: Date | null;
    settledAt: Date | null;
    returnStatus?: string | null;
  },
  now: Date = new Date()
): string | null {
  if (order.settledAt) return 'Already settled';
  if ((UNPAYABLE_STATUSES as readonly string[]).includes(order.status)) {
    return order.status === 'CANCELLED' ? 'Order cancelled' : 'Order returned';
  }
  if (order.status !== 'DELIVERED') return 'Not delivered yet';
  if (!order.deliveredAt) return 'Delivery date not recorded';
  if (order.returnStatus && order.returnStatus !== 'REJECTED') {
    return 'Customer has opened a return';
  }

  const cutoff = payableCutoff(now);
  if (order.deliveredAt > cutoff) {
    const daysLeft = Math.ceil(
      (order.deliveredAt.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000)
    );
    return `In return window — ${daysLeft} more ${daysLeft === 1 ? 'day' : 'days'}`;
  }
  return null;
}
