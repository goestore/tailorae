import type { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { applyOrderStatus } from '@/utils/order-status';
import { amountMatches, fromPaise } from '@/utils/payment-amounts';
import {
  PAYMENT_TIMELINE_STATUS,
  capturedMessage,
  decideCapture,
  decideFailure,
  decideRefund,
  failedMessage,
  gatewayRefMarker,
  refundedMessage,
  type EventDecision,
} from '@/utils/payment-webhook';
import { sendOrderConfirmation } from '@/services/notifications';

/**
 * Writing a payment down, exactly once.
 *
 * Every route that learns something about money — the browser handshake at
 * `/verify`, the webhook, the admin refund — funnels through here, so there is
 * one implementation of "has this already been recorded" rather than three that
 * drift. The rules themselves are pure and live in `utils/payment-webhook`;
 * this module is the transactional half that reads the order, asks those rules
 * what to do, and performs the guarded write.
 *
 * The guarantee, restated because it is the whole point: a payment or refund
 * arriving twice moves the order once. See the header of
 * `utils/payment-webhook` for why it takes two layers — the timeline marker
 * catches replays, and the compare-and-swap on the order row catches the race
 * the marker check cannot, because Postgres re-evaluates an `updateMany`
 * predicate under a row lock while a `findFirst` sees only committed rows.
 *
 * Nothing here is exposed to a caller as an exception. A payment event that
 * cannot be applied is a result with an outcome and a reason, because the right
 * response to most of them is a 200 that stops the gateway retrying, not a
 * stack trace.
 */

export type RecordOutcome =
  /** The movement was recorded by this call. */
  | 'applied'
  /** Already recorded; this call changed nothing. Success. */
  | 'duplicate'
  /** Written to the timeline for a human, without moving the payment status. */
  | 'recorded'
  /** Contradicts what we hold, and money is involved. Flagged for a person. */
  | 'conflict'
  /** Safely nothing to do. */
  | 'ignored'
  /** The order named by the event does not exist. */
  | 'unknown-order';

export interface PaymentRecordResult {
  outcome: RecordOutcome;
  message: string;
  orderId: string | null;
  orderNumber: string | null;
  paymentStatus: PaymentStatus | null;
  orderStatus: OrderStatus | null;
}

/** Where an event came from, for the timeline and the logs. */
export type EventSource = 'webhook' | 'checkout' | 'admin';

type Tx = Prisma.TransactionClient;

const orderSelect = {
  id: true,
  orderNumber: true,
  userId: true,
  status: true,
  total: true,
  paymentId: true,
  paymentStatus: true,
  paymentMethod: true,
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

/**
 * Has this exact money movement already been written down?
 *
 * Keyed on the gateway's own identifier, stamped into the timeline message by
 * `gatewayRefMarker`. A payment id names one charge and a refund id names one
 * transfer, so two different event types describing the same movement — say
 * `payment.authorized` and `payment.captured` — collapse to one key, which a
 * per-event key would not.
 */
async function alreadyRecorded(tx: Tx, orderId: string, gatewayId: string): Promise<boolean> {
  const existing = await tx.orderTimeline.findFirst({
    where: { orderId, message: { contains: gatewayRefMarker(gatewayId) } },
    select: { id: true },
  });
  return existing !== null;
}

/** Find our order by id, or by order number when that is all the event carried. */
async function loadOrder(
  tx: Tx,
  reference: { by: 'id' | 'orderNumber'; value: string }
): Promise<OrderRow | null> {
  return reference.by === 'id'
    ? tx.order.findUnique({ where: { id: reference.value }, select: orderSelect })
    : tx.order.findUnique({ where: { orderNumber: reference.value }, select: orderSelect });
}

/**
 * Record something that needs a person, and make sure it is not silent.
 *
 * A conflict is the case where our records and the gateway's disagree about
 * real money — a second charge, a refund on an unpaid order. It goes to the
 * timeline so it is visible on the order, and to the error log so it is visible
 * in whatever collects those. It deliberately does not change the payment
 * status: guessing which of two contradictory truths to adopt is how the wrong
 * one becomes permanent.
 */
async function writeAnomaly(
  tx: Tx,
  order: OrderRow,
  message: string,
  actorId: string | null
): Promise<void> {
  console.error(`[pay] anomaly on ${order.orderNumber}: ${message}`);
  await tx.orderTimeline.create({
    data: {
      orderId: order.id,
      status: PAYMENT_TIMELINE_STATUS.anomaly,
      message,
      createdBy: actorId,
    },
  });
}

const result = (
  outcome: RecordOutcome,
  message: string,
  order: OrderRow | null,
  paymentStatus: PaymentStatus | null = null
): PaymentRecordResult => ({
  outcome,
  message,
  orderId: order?.id ?? null,
  orderNumber: order?.orderNumber ?? null,
  paymentStatus,
  orderStatus: order?.status ?? null,
});

/**
 * Turn a non-`apply` decision into a result, writing an anomaly where one is
 * warranted. Shared by all three recorders so they treat the verdicts alike.
 */
async function settleNonApply(
  tx: Tx,
  order: OrderRow,
  decision: Exclude<EventDecision, { action: 'apply' }>,
  actorId: string | null
): Promise<PaymentRecordResult> {
  if (decision.action === 'conflict') {
    await writeAnomaly(tx, order, decision.message, actorId);
    return result('conflict', decision.message, order, order.paymentStatus);
  }
  if (decision.action === 'record') {
    await tx.orderTimeline.create({
      data: {
        orderId: order.id,
        status: PAYMENT_TIMELINE_STATUS.refunded,
        message: decision.message,
        createdBy: actorId,
      },
    });
    return result('recorded', decision.message, order, order.paymentStatus);
  }
  if (decision.action === 'duplicate') {
    return result('duplicate', decision.message, order, order.paymentStatus);
  }
  return result('ignored', decision.message, order, order.paymentStatus);
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export interface CaptureInput {
  reference: { by: 'id' | 'orderNumber'; value: string };
  paymentId: string;
  amountPaise: number;
  source: EventSource;
  actorId?: string | null;
  /** Restricts the write to one customer's own order. Set by `/verify`. */
  requireUserId?: string;
}

/**
 * Record that an order has been paid.
 *
 * On success this also moves a still-PENDING order to CONFIRMED through
 * `applyOrderStatus`, which is the shared helper that keeps the parent order
 * and every seller's half in step. Doing it by hand here would be the exact bug
 * that helper was written to fix — a parent that moved while its sub-orders sat
 * at PENDING, invisible to the shops meant to fulfil them.
 *
 * The confirmation email is sent afterwards and outside the transaction, by the
 * caller, because a prepaid order's confirmation should say it is paid.
 */
export async function recordCapture(input: CaptureInput): Promise<PaymentRecordResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.reference);
    if (!order) {
      return result('unknown-order', `No order matches ${input.reference.value}`, null);
    }
    if (input.requireUserId && order.userId !== input.requireUserId) {
      // Reported as a missing order rather than a forbidden one: confirming
      // that somebody else's order exists is itself a small leak.
      return result('unknown-order', `No order matches ${input.reference.value}`, null);
    }

    const seen = await alreadyRecorded(tx, order.id, input.paymentId);
    const decision = decideCapture(order, input.paymentId, seen);
    if (decision.action !== 'apply') {
      return settleNonApply(tx, order, decision, input.actorId ?? null);
    }

    /**
     * The compare-and-swap. The `where` names the statuses this decision was
     * made against, so a delivery that lost a race finds nothing to update and
     * reports a duplicate instead of writing a second payment over the first.
     */
    const applied = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: { in: ['PENDING', 'FAILED'] } },
      data: { paymentStatus: 'PAID', paymentId: input.paymentId },
    });
    if (applied.count === 0) {
      return result(
        'duplicate',
        `Payment ${input.paymentId} was recorded by a concurrent delivery`,
        order,
        'PAID'
      );
    }

    await tx.orderTimeline.create({
      data: {
        orderId: order.id,
        status: PAYMENT_TIMELINE_STATUS.captured,
        message: capturedMessage(input.paymentId, input.amountPaise),
        createdBy: input.actorId ?? null,
      },
    });

    /**
     * The money is real whatever the amount says, so a mismatch is recorded
     * alongside the payment rather than used to reject it — refusing here would
     * leave a charged customer with an unpaid order, which is strictly worse
     * than a flagged one. In practice this cannot fire: the gateway order is
     * created from `Order.total` and charges exactly that. If it ever does, the
     * order total moved underneath a live payment and a person needs to look.
     */
    if (!amountMatches(order.total, input.amountPaise)) {
      await writeAnomaly(
        tx,
        order,
        `Paid ${fromPaise(input.amountPaise)} against an order total of ${order.total} — amounts do not reconcile`,
        input.actorId ?? null
      );
    }

    // Payment is what confirms a prepaid order. Only from PENDING: an order
    // already further along must not be dragged backwards by a late webhook.
    if (order.status === 'PENDING') {
      await applyOrderStatus(tx, {
        orderId: order.id,
        next: 'CONFIRMED',
        actorId: input.actorId ?? null,
        message: 'Payment received — order confirmed',
      });
    }

    return result('applied', `Payment ${input.paymentId} recorded`, order, 'PAID');
  });

  if (outcome.outcome === 'applied' && outcome.orderId) {
    // Not awaited, and after the commit: the payment is recorded either way,
    // and a slow or missing mail server must not hold up a webhook response
    // that the gateway will otherwise retry.
    void sendOrderConfirmation(outcome.orderId);
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Failure
// ---------------------------------------------------------------------------

export interface FailureInput {
  reference: { by: 'id' | 'orderNumber'; value: string };
  paymentId: string;
  reason: string | null;
  actorId?: string | null;
}

/**
 * Record a failed attempt.
 *
 * The order is left alive at FAILED rather than cancelled: the customer's next
 * attempt should pay the order they already have, not force them back through
 * checkout to build it again. Stock stays reserved for the same reason — see
 * the note on abandoned orders in `routes/orders.ts`.
 */
export async function recordFailure(input: FailureInput): Promise<PaymentRecordResult> {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.reference);
    if (!order) {
      return result('unknown-order', `No order matches ${input.reference.value}`, null);
    }

    const seen = await alreadyRecorded(tx, order.id, input.paymentId);
    const decision = decideFailure(order, input.paymentId, seen);
    if (decision.action !== 'apply') {
      return settleNonApply(tx, order, decision, input.actorId ?? null);
    }

    // Guarded on PENDING alone. A paid order is excluded by the decision above,
    // and this is the lock-level restatement of it.
    const applied = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'FAILED' },
    });
    if (applied.count === 0) {
      return result(
        'ignored',
        `Order is no longer pending — failure of ${input.paymentId} not applied`,
        order,
        order.paymentStatus
      );
    }

    await tx.orderTimeline.create({
      data: {
        orderId: order.id,
        status: PAYMENT_TIMELINE_STATUS.failed,
        message: failedMessage(input.paymentId, input.reason),
        createdBy: input.actorId ?? null,
      },
    });

    return result('applied', `Failed attempt ${input.paymentId} recorded`, order, 'FAILED');
  });
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export interface RefundInput {
  reference: { by: 'id' | 'orderNumber'; value: string };
  refundId: string;
  amountPaise: number;
  actorId?: string | null;
}

/**
 * Record that money has gone back to the customer.
 *
 * Recording only. The transfer itself is `createRefund` in
 * `services/payments/razorpay`, and the two are deliberately separate calls:
 * the gateway is the system of record for whether money moved, and this is our
 * copy of what it told us. `refund.processed` arriving from the webhook is the
 * gateway confirming settlement, which is why the same function serves both the
 * admin route and the webhook.
 */
export async function recordRefund(input: RefundInput): Promise<PaymentRecordResult> {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.reference);
    if (!order) {
      return result('unknown-order', `No order matches ${input.reference.value}`, null);
    }

    const seen = await alreadyRecorded(tx, order.id, input.refundId);
    const decision = decideRefund(order, input.refundId, seen);
    if (decision.action !== 'apply') {
      return settleNonApply(tx, order, decision, input.actorId ?? null);
    }

    const applied = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: 'PAID' },
      data: { paymentStatus: 'REFUNDED' },
    });
    if (applied.count === 0) {
      return result(
        'duplicate',
        `Refund ${input.refundId} was recorded by a concurrent delivery`,
        order,
        'REFUNDED'
      );
    }

    await tx.orderTimeline.create({
      data: {
        orderId: order.id,
        status: PAYMENT_TIMELINE_STATUS.refunded,
        message: refundedMessage(input.refundId, input.amountPaise),
        createdBy: input.actorId ?? null,
      },
    });

    return result('applied', `Refund ${input.refundId} recorded`, order, 'REFUNDED');
  });
}

/**
 * Whether a refund has already been sent for this order.
 *
 * Read before contacting the gateway, because the gateway itself has no opinion
 * — asking it to refund the same payment twice succeeds twice. This is the only
 * thing standing between a double-clicked admin button and a customer being
 * paid back two times.
 */
export async function refundAlreadyIssued(orderId: string): Promise<boolean> {
  const existing = await prisma.orderTimeline.findFirst({
    where: { orderId, status: PAYMENT_TIMELINE_STATUS.refunded },
    select: { id: true },
  });
  return existing !== null;
}
