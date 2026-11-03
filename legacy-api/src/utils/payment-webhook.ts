import type { PaymentStatus } from '@prisma/client';
import { formatRupees } from '@/utils/helpers';
import { fromPaise } from '@/utils/payment-amounts';

/**
 * What a Razorpay webhook means, and whether we have already acted on it.
 *
 * A gateway webhook is not a message, it is a message *delivered at least
 * once*. Razorpay retries on any non-2xx and on a timeout, replays events from
 * the dashboard, and can deliver `payment.captured` before or after the
 * browser's own `/verify` call for the same payment. So every handler here has
 * to answer the same question twice: what does this event say, and has this
 * exact money movement already been recorded? Getting the second one wrong is
 * the expensive failure — an order marked paid twice is only untidy, but a
 * refund issued twice has sent a customer money that will not come back.
 *
 * The whole decision is pure, and split out from the database work, for two
 * reasons. It can be tested exhaustively against every ordering of events a
 * gateway can produce, and it keeps the transactional half small enough to read
 * in one go.
 *
 * Idempotency is enforced in two layers, and both are needed:
 *
 *   1. **The ledger.** Every recorded payment event writes an `OrderTimeline`
 *      row carrying the gateway's own identifier for the money movement — the
 *      payment id, or the refund id — in square brackets. Before acting, we
 *      look for that marker. Because the identifier comes from the gateway and
 *      names the movement rather than the delivery attempt, a replay of the
 *      same event and two *different* events describing one payment both
 *      collapse to the same key.
 *
 *   2. **A compare-and-swap on the order row.** The ledger check and the write
 *      are separate statements, so two deliveries racing inside overlapping
 *      transactions can both pass step 1. The update is therefore guarded on
 *      the payment status it expects to find (`updateMany` with that status in
 *      the `where`), and the returned count — not the code's own optimism —
 *      decides whether this delivery was the one that applied it. Postgres
 *      re-evaluates the predicate under a row lock, so exactly one of the two
 *      can win.
 *
 * There is no dedicated payments table to key a unique index on, and the schema
 * is owned elsewhere, so the marker plus the guarded update is what stands in
 * for one. The marker is human-readable on purpose: the timeline is shown to
 * the customer, and a payment reference is worth seeing there.
 */

// ---------------------------------------------------------------------------
// Timeline vocabulary
// ---------------------------------------------------------------------------

/** `OrderTimeline.status` values this module writes. Free text on the model. */
export const PAYMENT_TIMELINE_STATUS = {
  captured: 'PAYMENT_CAPTURED',
  failed: 'PAYMENT_FAILED',
  refunded: 'PAYMENT_REFUNDED',
  /** Something arrived that needs a person: a double charge, a stray refund. */
  anomaly: 'PAYMENT_ANOMALY',
} as const;

/**
 * How a gateway reference is stamped into a timeline message.
 *
 * Both the writer and the duplicate check go through this, so the two can never
 * drift apart — which would silently disable deduplication rather than fail
 * loudly.
 */
export const gatewayRefMarker = (gatewayId: string): string => `[${gatewayId}]`;

export const capturedMessage = (paymentId: string, amountPaise: number): string =>
  `Payment received via Razorpay — ${formatRupees(fromPaise(amountPaise))} ${gatewayRefMarker(paymentId)}`;

export const failedMessage = (paymentId: string, reason: string | null): string =>
  `Payment attempt failed${reason ? ` — ${reason}` : ''} ${gatewayRefMarker(paymentId)}`;

export const refundedMessage = (refundId: string, amountPaise: number): string =>
  `Refund of ${formatRupees(fromPaise(amountPaise))} processed by Razorpay ${gatewayRefMarker(refundId)}`;

// ---------------------------------------------------------------------------
// Reading the event
// ---------------------------------------------------------------------------

/** The subset of a Razorpay payment entity this integration acts on. */
export interface RazorpayEventPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency?: string;
  status?: string;
  error_description?: string | null;
  error_reason?: string | null;
  notes?: Record<string, unknown> | null;
}

export interface RazorpayEventRefund {
  id: string;
  payment_id: string;
  amount: number;
  status?: string;
  notes?: Record<string, unknown> | null;
}

export type WebhookAction =
  | { kind: 'capture'; payment: RazorpayEventPayment }
  | { kind: 'fail'; payment: RazorpayEventPayment; reason: string | null }
  | { kind: 'refund'; refund: RazorpayEventRefund; payment: RazorpayEventPayment | null }
  /** Delivered, understood, and deliberately not acted on. Still a 200. */
  | { kind: 'ignore'; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

function readPaymentEntity(payload: unknown): RazorpayEventPayment | null {
  if (!isRecord(payload)) return null;
  const wrapper = payload.payment;
  if (!isRecord(wrapper)) return null;
  const entity = wrapper.entity;
  if (!isRecord(entity)) return null;

  const id = readString(entity.id);
  if (!id) return null;
  // Amount is the one field with no sensible default: a missing amount must not
  // become a zero-rupee payment that reconciles against nothing.
  if (typeof entity.amount !== 'number' || !Number.isFinite(entity.amount)) return null;

  return {
    id,
    order_id: readString(entity.order_id),
    amount: entity.amount,
    currency: readString(entity.currency) ?? undefined,
    status: readString(entity.status) ?? undefined,
    error_description: readString(entity.error_description),
    error_reason: readString(entity.error_reason),
    notes: isRecord(entity.notes) ? entity.notes : null,
  };
}

function readRefundEntity(payload: unknown): RazorpayEventRefund | null {
  if (!isRecord(payload)) return null;
  const wrapper = payload.refund;
  if (!isRecord(wrapper)) return null;
  const entity = wrapper.entity;
  if (!isRecord(entity)) return null;

  const id = readString(entity.id);
  const paymentId = readString(entity.payment_id);
  if (!id || !paymentId) return null;
  if (typeof entity.amount !== 'number' || !Number.isFinite(entity.amount)) return null;

  return {
    id,
    payment_id: paymentId,
    amount: entity.amount,
    status: readString(entity.status) ?? undefined,
    notes: isRecord(entity.notes) ? entity.notes : null,
  };
}

/**
 * The events acted on.
 *
 * Razorpay will happily deliver two dozen event types once a webhook is enabled
 * in the dashboard, and an integration that treats an unknown one as an error
 * spends its life answering 400 and being retried. Anything not on this list is
 * acknowledged and ignored by name.
 */
export const HANDLED_EVENTS = [
  'payment.captured',
  'payment.authorized',
  'payment.failed',
  'refund.processed',
] as const;

/**
 * Turn a decoded event body into the one thing to do about it.
 *
 * `payment.authorized` is treated as a capture on purpose. Orders are created
 * with automatic capture, so authorisation and capture arrive together and the
 * customer's money is committed either way; handling only the latter would
 * leave a manually captured payment unrecorded. The idempotency layers are what
 * make accepting both safe — the second of the pair finds the first's marker
 * and does nothing.
 */
export function decideWebhookAction(body: unknown): WebhookAction {
  if (!isRecord(body)) return { kind: 'ignore', reason: 'body is not an object' };

  const event = readString(body.event);
  if (!event) return { kind: 'ignore', reason: 'event name missing' };

  if (event === 'payment.captured' || event === 'payment.authorized') {
    const payment = readPaymentEntity(body.payload);
    if (!payment) return { kind: 'ignore', reason: `${event} carried no readable payment entity` };
    return { kind: 'capture', payment };
  }

  if (event === 'payment.failed') {
    const payment = readPaymentEntity(body.payload);
    if (!payment) return { kind: 'ignore', reason: `${event} carried no readable payment entity` };
    return {
      kind: 'fail',
      payment,
      reason: payment.error_description ?? payment.error_reason ?? null,
    };
  }

  if (event === 'refund.processed') {
    const refund = readRefundEntity(body.payload);
    if (!refund) return { kind: 'ignore', reason: `${event} carried no readable refund entity` };
    return { kind: 'refund', refund, payment: readPaymentEntity(body.payload) };
  }

  return { kind: 'ignore', reason: `unhandled event ${event}` };
}

/**
 * Which of our orders an event is about.
 *
 * The gateway knows nothing about our order ids, so we put them in `notes` when
 * the gateway order is created and read them back here — the only link between
 * the two systems, and the reason `notes` is written on refunds as well as on
 * orders. The human order number carried alongside is a second route in, used
 * when an event predates the notes convention or was raised from the dashboard
 * by hand.
 *
 * Returns null when the event cannot be attributed. That is not a transient
 * failure and retrying will not fix it, so the caller acknowledges and logs
 * rather than asking the gateway to try again forever.
 */
export function resolveOrderReference(
  action: WebhookAction
): { by: 'id'; value: string } | { by: 'orderNumber'; value: string } | null {
  const noteSets: Array<Record<string, unknown> | null | undefined> = [];

  if (action.kind === 'capture' || action.kind === 'fail') {
    noteSets.push(action.payment.notes);
  } else if (action.kind === 'refund') {
    // The refund's own notes first: a partial refund names the order it settles
    // even when the payment it hangs off has been re-noted.
    noteSets.push(action.refund.notes, action.payment?.notes);
  }

  for (const notes of noteSets) {
    if (!notes) continue;
    const id = readString(notes.orderId);
    if (id) return { by: 'id', value: id };
  }
  for (const notes of noteSets) {
    if (!notes) continue;
    const number = readString(notes.orderNumber);
    if (number) return { by: 'orderNumber', value: number };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deciding whether to act
// ---------------------------------------------------------------------------

/**
 * What to do with an event once the order it belongs to has been read.
 *
 *   - `apply`     — this delivery is the one that records the movement.
 *   - `duplicate` — already recorded. A success, not an error: the gateway is
 *                   told 200 so it stops retrying.
 *   - `record`    — write it to the timeline for a human, but do not move the
 *                   payment status. Used where the event is real but the status
 *                   it implies is already terminal.
 *   - `conflict`  — the event contradicts what we hold, and money is involved.
 *                   Recorded loudly as an anomaly; needs a person.
 *   - `ignore`    — safely nothing to do.
 */
export type EventDecision =
  | { action: 'apply' }
  | { action: 'duplicate'; message: string }
  | { action: 'record'; message: string }
  | { action: 'conflict'; message: string }
  | { action: 'ignore'; message: string };

/** The order state these rules need. */
export interface OrderPaymentState {
  paymentStatus: PaymentStatus;
  paymentId: string | null;
}

/**
 * Whether to record a capture.
 *
 * The case that costs money is the third one: an order already PAID by a
 * *different* payment id means the customer has been charged twice — two
 * checkout attempts that both went through, most often. Overwriting the id
 * would erase the evidence of the first charge and leave nothing to refund
 * against, so it is refused and flagged instead.
 *
 * A capture arriving after a refund, or on a cancelled order, is the same shape
 * of problem from the other direction: real money that our records say should
 * not be here. Neither may quietly flip the order back to PAID.
 */
export function decideCapture(
  order: OrderPaymentState,
  paymentId: string,
  alreadyRecorded: boolean
): EventDecision {
  if (alreadyRecorded) {
    return { action: 'duplicate', message: `Payment ${paymentId} is already recorded` };
  }
  if (order.paymentStatus === 'PAID') {
    return order.paymentId === paymentId
      ? { action: 'duplicate', message: `Payment ${paymentId} is already recorded` }
      : {
          action: 'conflict',
          message: `Order is already paid by ${order.paymentId ?? 'an unrecorded payment'}; ${paymentId} looks like a second charge and needs refunding`,
        };
  }
  if (order.paymentStatus === 'REFUNDED') {
    return {
      action: 'conflict',
      message: `Capture ${paymentId} arrived on an order already refunded — needs reconciling by hand`,
    };
  }
  if (order.paymentStatus === 'CANCELLED') {
    return {
      action: 'conflict',
      message: `Capture ${paymentId} arrived on a cancelled order — the money must be refunded`,
    };
  }
  // PENDING, or FAILED where the customer simply tried again and succeeded.
  return { action: 'apply' };
}

/**
 * Whether to record a failed attempt.
 *
 * The rule that matters: a failure never un-pays a paid order. A customer who
 * abandons one attempt and completes the next produces `payment.failed` and
 * `payment.captured` in an order nobody controls, and letting the failure land
 * second would mark a genuinely paid order FAILED and stop it being fulfilled.
 */
export function decideFailure(
  order: OrderPaymentState,
  paymentId: string,
  alreadyRecorded: boolean
): EventDecision {
  if (alreadyRecorded) {
    return { action: 'duplicate', message: `Failure of ${paymentId} is already recorded` };
  }
  if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') {
    return {
      action: 'ignore',
      message: `Ignoring failed attempt ${paymentId} — the order is already ${order.paymentStatus.toLowerCase()}`,
    };
  }
  return { action: 'apply' };
}

/**
 * Whether to record a processed refund.
 *
 * `REFUNDED` is terminal on the order, and there is no per-refund table to hold
 * a running total, so a second distinct refund cannot move the status further.
 * It is still written to the timeline rather than dropped — a partial refund
 * followed by another is a legitimate sequence, and the record of it is what an
 * admin reconciles the bank statement against.
 *
 * A refund against an order we never marked paid is the alarming one: either a
 * capture webhook was missed, or money left for something never collected.
 */
export function decideRefund(
  order: OrderPaymentState,
  refundId: string,
  alreadyRecorded: boolean
): EventDecision {
  if (alreadyRecorded) {
    return { action: 'duplicate', message: `Refund ${refundId} is already recorded` };
  }
  if (order.paymentStatus === 'REFUNDED') {
    return {
      action: 'record',
      message: `Further refund ${refundId} recorded against an order already marked refunded`,
    };
  }
  if (order.paymentStatus !== 'PAID') {
    return {
      action: 'conflict',
      message: `Refund ${refundId} arrived on an order that is ${order.paymentStatus.toLowerCase()}, not paid — needs reconciling by hand`,
    };
  }
  return { action: 'apply' };
}
