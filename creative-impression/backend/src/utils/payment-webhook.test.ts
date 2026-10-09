import type { PaymentStatus } from '@prisma/client';
import {
  capturedMessage,
  decideCapture,
  decideFailure,
  decideRefund,
  decideWebhookAction,
  failedMessage,
  gatewayRefMarker,
  refundedMessage,
  resolveOrderReference,
  type OrderPaymentState,
} from '@/utils/payment-webhook';

/**
 * Idempotency, mostly.
 *
 * A gateway delivers at least once, in an order nobody controls, and the two
 * mistakes that cost real money are recording one payment twice and issuing one
 * refund twice. Everything below is an ordering a live gateway can actually
 * produce — a retry, a replay from the dashboard, a `payment.failed` overtaking
 * the `payment.captured` for the customer's second attempt — asserted against
 * the rule that decides what to do about it.
 */

const ORDER_ID = 'clx0000000000000000000000';
const ORDER_NUMBER = 'CI-1757000000000-AB12';
const PAYMENT_ID = 'pay_MnOpQrS789012';
const REFUND_ID = 'rfnd_TuVwXyZ345678';

const order = (
  paymentStatus: PaymentStatus,
  paymentId: string | null = null
): OrderPaymentState => ({ paymentStatus, paymentId });

const captureEvent = (overrides: Record<string, unknown> = {}) => ({
  entity: 'event',
  event: 'payment.captured',
  contains: ['payment'],
  payload: {
    payment: {
      entity: {
        id: PAYMENT_ID,
        entity: 'payment',
        amount: 149900,
        currency: 'INR',
        status: 'captured',
        order_id: 'order_QaBcDeF123456',
        notes: { orderId: ORDER_ID, orderNumber: ORDER_NUMBER },
        ...overrides,
      },
    },
  },
});

const refundEvent = (overrides: Record<string, unknown> = {}) => ({
  entity: 'event',
  event: 'refund.processed',
  contains: ['refund'],
  payload: {
    refund: {
      entity: {
        id: REFUND_ID,
        entity: 'refund',
        amount: 149900,
        payment_id: PAYMENT_ID,
        status: 'processed',
        notes: { orderId: ORDER_ID, orderNumber: ORDER_NUMBER },
        ...overrides,
      },
    },
  },
});

// ---------------------------------------------------------------------------

describe('decideWebhookAction', () => {
  it('reads a capture', () => {
    const action = decideWebhookAction(captureEvent());
    expect(action.kind).toBe('capture');
    expect(action.kind === 'capture' && action.payment.id).toBe(PAYMENT_ID);
    expect(action.kind === 'capture' && action.payment.amount).toBe(149900);
  });

  it('treats an authorisation as a capture', () => {
    // Orders are created with automatic capture, so the pair arrives together
    // and either one is proof the money is committed. Accepting both is safe
    // because the second finds the first's marker; accepting neither would lose
    // a manually captured payment entirely.
    const action = decideWebhookAction({
      ...captureEvent(),
      event: 'payment.authorized',
    });
    expect(action.kind).toBe('capture');
  });

  it('reads a failure and the reason with it', () => {
    const action = decideWebhookAction({
      ...captureEvent({ status: 'failed', error_description: 'Card declined by issuer' }),
      event: 'payment.failed',
    });
    expect(action.kind).toBe('fail');
    expect(action.kind === 'fail' && action.reason).toBe('Card declined by issuer');
  });

  it('falls back to error_reason when there is no description', () => {
    const action = decideWebhookAction({
      ...captureEvent({ status: 'failed', error_reason: 'payment_failed' }),
      event: 'payment.failed',
    });
    expect(action.kind === 'fail' && action.reason).toBe('payment_failed');
  });

  it('reads a refund', () => {
    const action = decideWebhookAction(refundEvent());
    expect(action.kind).toBe('refund');
    expect(action.kind === 'refund' && action.refund.id).toBe(REFUND_ID);
  });

  it('ignores an event type it does not handle, by name', () => {
    // Enabling a webhook in the dashboard turns on a couple of dozen event
    // types. Treating an unknown one as an error means answering non-2xx and
    // being retried forever.
    const action = decideWebhookAction({ event: 'subscription.charged', payload: {} });
    expect(action.kind).toBe('ignore');
    expect(action.kind === 'ignore' && action.reason).toContain('subscription.charged');
  });

  it('ignores junk rather than throwing', () => {
    expect(decideWebhookAction(null).kind).toBe('ignore');
    expect(decideWebhookAction('a string').kind).toBe('ignore');
    expect(decideWebhookAction([]).kind).toBe('ignore');
    expect(decideWebhookAction({}).kind).toBe('ignore');
    expect(decideWebhookAction({ event: 'payment.captured' }).kind).toBe('ignore');
  });

  it('ignores a capture with no amount rather than reading it as zero', () => {
    const event = captureEvent();
    delete (event.payload.payment.entity as Record<string, unknown>).amount;
    expect(decideWebhookAction(event).kind).toBe('ignore');
  });

  it('ignores a refund missing the payment it belongs to', () => {
    const event = refundEvent();
    delete (event.payload.refund.entity as Record<string, unknown>).payment_id;
    expect(decideWebhookAction(event).kind).toBe('ignore');
  });
});

describe('resolveOrderReference', () => {
  it('prefers the order id from the notes', () => {
    expect(resolveOrderReference(decideWebhookAction(captureEvent()))).toEqual({
      by: 'id',
      value: ORDER_ID,
    });
  });

  it('falls back to the order number when no id was noted', () => {
    const action = decideWebhookAction(captureEvent({ notes: { orderNumber: ORDER_NUMBER } }));
    expect(resolveOrderReference(action)).toEqual({ by: 'orderNumber', value: ORDER_NUMBER });
  });

  it('finds the reference on a refund', () => {
    expect(resolveOrderReference(decideWebhookAction(refundEvent()))).toEqual({
      by: 'id',
      value: ORDER_ID,
    });
  });

  it("reads the payment's notes when the refund itself carries none", () => {
    // A dashboard-issued refund has no notes of its own; the payment it hangs
    // off still names the order.
    const event = {
      ...refundEvent({ notes: {} }),
      payload: {
        refund: { entity: { ...refundEvent().payload.refund.entity, notes: {} } },
        payment: { entity: captureEvent().payload.payment.entity },
      },
    };
    expect(resolveOrderReference(decideWebhookAction(event))).toEqual({
      by: 'id',
      value: ORDER_ID,
    });
  });

  it('returns null when nothing attributes the event, rather than guessing', () => {
    const action = decideWebhookAction(captureEvent({ notes: {} }));
    expect(resolveOrderReference(action)).toBeNull();
  });

  it('ignores a blank note value', () => {
    const action = decideWebhookAction(captureEvent({ notes: { orderId: '   ' } }));
    expect(resolveOrderReference(action)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('decideCapture', () => {
  it('applies the first time a payment is seen', () => {
    expect(decideCapture(order('PENDING'), PAYMENT_ID, false)).toEqual({ action: 'apply' });
  });

  it('is a no-op when the ledger already holds this payment', () => {
    // The retry case: Razorpay resends after a timeout, and the marker written
    // by the first delivery is what stops the second doing anything.
    const decision = decideCapture(order('PAID', PAYMENT_ID), PAYMENT_ID, true);
    expect(decision.action).toBe('duplicate');
  });

  it('is a no-op when the order is already paid by the same payment', () => {
    // The other half of the retry case: `/verify` recorded it, then the webhook
    // arrived for the same payment. Caught even without the ledger marker.
    expect(decideCapture(order('PAID', PAYMENT_ID), PAYMENT_ID, false).action).toBe('duplicate');
  });

  it('flags a second, different payment instead of overwriting the first', () => {
    // Two checkout attempts that both went through. Overwriting `paymentId`
    // would erase the charge there is still something to refund against.
    const decision = decideCapture(order('PAID', 'pay_FirstOne'), 'pay_SecondOne', false);
    expect(decision.action).toBe('conflict');
    expect(decision.action === 'conflict' && decision.message).toContain('pay_FirstOne');
    expect(decision.action === 'conflict' && decision.message).toContain('second charge');
  });

  it('applies after a failed attempt, because the customer simply tried again', () => {
    expect(decideCapture(order('FAILED'), PAYMENT_ID, false)).toEqual({ action: 'apply' });
  });

  it('refuses to un-refund an order', () => {
    const decision = decideCapture(order('REFUNDED', 'pay_Old'), PAYMENT_ID, false);
    expect(decision.action).toBe('conflict');
  });

  it('flags money arriving on a cancelled order', () => {
    // A customer who cancelled while the gateway was still processing. The
    // money is real and has to go back; quietly marking the order paid hides
    // that from everybody.
    const decision = decideCapture(order('CANCELLED'), PAYMENT_ID, false);
    expect(decision.action).toBe('conflict');
    expect(decision.action === 'conflict' && decision.message).toContain('refunded');
  });
});

describe('decideFailure', () => {
  it('applies to a pending order', () => {
    expect(decideFailure(order('PENDING'), PAYMENT_ID, false)).toEqual({ action: 'apply' });
  });

  it('never un-pays a paid order', () => {
    // The ordering that matters: attempt one fails, attempt two succeeds, and
    // the two webhooks arrive in the wrong order. Letting the failure land
    // second would mark a genuinely paid order FAILED and stop it shipping.
    const decision = decideFailure(order('PAID', 'pay_SecondAttempt'), 'pay_FirstAttempt', false);
    expect(decision.action).toBe('ignore');
    expect(decision.action === 'ignore' && decision.message).toContain('already paid');
  });

  it('never touches a refunded order', () => {
    expect(decideFailure(order('REFUNDED'), PAYMENT_ID, false).action).toBe('ignore');
  });

  it('is a no-op on a replayed failure', () => {
    expect(decideFailure(order('FAILED'), PAYMENT_ID, true).action).toBe('duplicate');
  });
});

describe('decideRefund', () => {
  it('applies the first time a refund is seen', () => {
    expect(decideRefund(order('PAID', PAYMENT_ID), REFUND_ID, false)).toEqual({ action: 'apply' });
  });

  it('is a no-op on a replayed refund', () => {
    // The expensive one. A refund recorded twice is a customer paid twice, and
    // this is the check that stops it.
    const decision = decideRefund(order('REFUNDED', PAYMENT_ID), REFUND_ID, true);
    expect(decision.action).toBe('duplicate');
  });

  it('is a no-op when the refund we issued comes back as a webhook', () => {
    // `POST /razorpay/refund` records the refund immediately; Razorpay then
    // sends `refund.processed` for the same refund id. Same movement, one
    // record.
    expect(decideRefund(order('REFUNDED', PAYMENT_ID), REFUND_ID, true).action).toBe('duplicate');
  });

  it('records a second distinct refund without moving the status again', () => {
    // Two partial refunds is a legitimate sequence. There is no per-refund
    // table to total them, so the second is written to the timeline for an
    // admin to reconcile rather than dropped.
    const decision = decideRefund(order('REFUNDED', PAYMENT_ID), 'rfnd_Second', false);
    expect(decision.action).toBe('record');
  });

  it('flags a refund against an order never marked paid', () => {
    const decision = decideRefund(order('PENDING'), REFUND_ID, false);
    expect(decision.action).toBe('conflict');
    expect(decision.action === 'conflict' && decision.message).toContain('not paid');
  });

  it('flags a refund on a failed order', () => {
    expect(decideRefund(order('FAILED'), REFUND_ID, false).action).toBe('conflict');
  });
});

describe('event orderings a live gateway produces', () => {
  it('authorised then captured records once', () => {
    // Both events carry the same payment id, so the second finds the marker.
    const first = decideCapture(order('PENDING'), PAYMENT_ID, false);
    expect(first).toEqual({ action: 'apply' });

    const second = decideCapture(order('PAID', PAYMENT_ID), PAYMENT_ID, true);
    expect(second.action).toBe('duplicate');
  });

  it('verify-then-webhook records once', () => {
    const viaBrowser = decideCapture(order('PENDING'), PAYMENT_ID, false);
    expect(viaBrowser).toEqual({ action: 'apply' });

    const viaWebhook = decideCapture(order('PAID', PAYMENT_ID), PAYMENT_ID, true);
    expect(viaWebhook.action).toBe('duplicate');
  });

  it('webhook-then-verify records once', () => {
    // The customer closed the tab; the webhook won. When the browser call
    // arrives late it must find the work done, not do it again.
    const viaWebhook = decideCapture(order('PENDING'), PAYMENT_ID, false);
    expect(viaWebhook).toEqual({ action: 'apply' });

    const viaBrowser = decideCapture(order('PAID', PAYMENT_ID), PAYMENT_ID, true);
    expect(viaBrowser.action).toBe('duplicate');
  });

  it('a dashboard replay days later still records once', () => {
    expect(decideCapture(order('PAID', PAYMENT_ID), PAYMENT_ID, true).action).toBe('duplicate');
    expect(decideRefund(order('REFUNDED', PAYMENT_ID), REFUND_ID, true).action).toBe('duplicate');
  });

  it('pay, refund, and a replayed capture does not resurrect the payment', () => {
    expect(decideCapture(order('PENDING'), PAYMENT_ID, false)).toEqual({ action: 'apply' });
    expect(decideRefund(order('PAID', PAYMENT_ID), REFUND_ID, false)).toEqual({ action: 'apply' });
    // The replay, arriving after the refund, is caught by the ledger marker.
    expect(decideCapture(order('REFUNDED', PAYMENT_ID), PAYMENT_ID, true).action).toBe('duplicate');
  });
});

describe('timeline markers', () => {
  it('wraps a gateway id so the ledger check can find it again', () => {
    expect(gatewayRefMarker(PAYMENT_ID)).toBe(`[${PAYMENT_ID}]`);
  });

  it('stamps the payment id into a captured message', () => {
    const message = capturedMessage(PAYMENT_ID, 149900);
    expect(message).toContain(gatewayRefMarker(PAYMENT_ID));
    // Rupees, as a customer reads them — the timeline is shown to them.
    expect(message).toContain('₹1,499.00');
  });

  it('stamps the payment id into a failure message, with and without a reason', () => {
    expect(failedMessage(PAYMENT_ID, 'Card declined')).toContain(gatewayRefMarker(PAYMENT_ID));
    expect(failedMessage(PAYMENT_ID, 'Card declined')).toContain('Card declined');
    expect(failedMessage(PAYMENT_ID, null)).toContain(gatewayRefMarker(PAYMENT_ID));
  });

  it('stamps the refund id, not the payment id, into a refund message', () => {
    // Keyed on the refund so two partial refunds of one payment stay distinct.
    const message = refundedMessage(REFUND_ID, 50000);
    expect(message).toContain(gatewayRefMarker(REFUND_ID));
    expect(message).not.toContain(gatewayRefMarker(PAYMENT_ID));
    expect(message).toContain('₹500.00');
  });

  it('produces markers that cannot collide between a payment and a refund', () => {
    expect(gatewayRefMarker(PAYMENT_ID)).not.toBe(gatewayRefMarker(REFUND_ID));
  });
});
