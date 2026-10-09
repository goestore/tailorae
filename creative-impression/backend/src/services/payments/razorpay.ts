import Razorpay from 'razorpay';
import {
  verifyCheckoutSignature,
  verifyWebhookSignature,
  type CheckoutSignaturePayload,
} from '@/utils/payment-signature';

/**
 * The one place that talks to Razorpay.
 *
 * There are no Razorpay credentials on this project yet, and — exactly as with
 * `services/mailer` — that is the reason this exists rather than the reason to
 * postpone it. With the client behind one module the call sites are already
 * correct, and setting `RAZORPAY_KEY_ID` is the whole remaining step.
 *
 * Unconfigured, it does **not** pretend. The mailer can log a message and let
 * the order stand because an unsent email costs nothing; a payment cannot,
 * because the equivalent shortcut is marking an order paid that nobody paid
 * for. So every operation returns a typed failure carrying a reason, logs it as
 * `[pay:log]`, and the callers surface that reason to the customer — the online
 * option is disabled in checkout before it can be clicked, and the endpoints
 * answer 503 with the reason rather than 500 or, worse, 200.
 *
 * Nothing here throws. A gateway that is down, slow, or misconfigured must not
 * take a request down with it; the caller decides what a failure means.
 *
 * India, INR, and rupee-denominated throughout. Stripe and PayPal are in
 * `package.json` and imported by nothing — see the note at the head of
 * `routes/payments.ts` for why their endpoints were removed rather than left
 * answering 501 forever.
 */

/** Every amount crossing this boundary is integer paise. INR only. */
export const GATEWAY_CURRENCY = 'INR';

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

export interface GatewayRefund {
  id: string;
  paymentId: string;
  amount: number;
  status: string;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amount: number;
  status: string;
  method: string | null;
}

/** Success carries the entity; failure carries a reason fit to show a person. */
export type GatewayResult<T> = { ok: true; data: T } | { ok: false; reason: string; configured: boolean };

const readKeyId = (): string => process.env.RAZORPAY_KEY_ID?.trim() ?? '';
const readKeySecret = (): string => process.env.RAZORPAY_KEY_SECRET?.trim() ?? '';
const readWebhookSecret = (): string => process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? '';

/**
 * Both halves of the API key are needed, and a half-configured gateway is worse
 * than an unconfigured one: it fails at the moment the customer clicks pay
 * rather than before the option is offered.
 */
export const razorpayReady = (): boolean => Boolean(readKeyId() && readKeySecret());

/**
 * The webhook secret is configured separately in the dashboard and is a
 * separate readiness question. Payments can be taken without it — the browser
 * handshake still verifies — but nothing would then confirm settlement or
 * report a refund, so the health endpoint reports it apart.
 */
export const razorpayWebhookReady = (): boolean => Boolean(readWebhookSecret());

/** Why the gateway is unavailable, or null when it is available. */
export function razorpayUnavailableReason(): string | null {
  if (readKeyId() && readKeySecret()) return null;
  if (!readKeyId() && !readKeySecret()) {
    return 'Online payment is not set up yet — RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are unset';
  }
  return readKeyId()
    ? 'Online payment is misconfigured — RAZORPAY_KEY_SECRET is unset'
    : 'Online payment is misconfigured — RAZORPAY_KEY_ID is unset';
}

/**
 * What the storefront is told, and what it may safely hold.
 *
 * `keyId` is the publishable half of the pair — Razorpay Checkout needs it in
 * the browser — so it is the only credential that ever leaves this process. The
 * secret and the webhook secret never appear in a response.
 */
export interface GatewayStatus {
  enabled: boolean;
  keyId: string | null;
  currency: string;
  /** Present only when disabled, and written to be shown to a customer. */
  reason: string | null;
  /** Settlement confirmation and refund reporting need this separately. */
  webhookConfigured: boolean;
}

export function gatewayStatus(): GatewayStatus {
  const reason = razorpayUnavailableReason();
  return {
    enabled: reason === null,
    keyId: reason === null ? readKeyId() : null,
    currency: GATEWAY_CURRENCY,
    reason,
    webhookConfigured: razorpayWebhookReady(),
  };
}

// Built once and reused, and rebuilt if the key changes under it — the same
// reasoning as the mailer's transport, plus a practical one: `nodemon` reloads
// this module on edit but not on an `.env` change.
let client: Razorpay | null = null;
let clientKeyId = '';

function getClient(): Razorpay | null {
  if (!razorpayReady()) return null;
  if (client && clientKeyId === readKeyId()) return client;

  client = new Razorpay({ key_id: readKeyId(), key_secret: readKeySecret() });
  clientKeyId = readKeyId();
  return client;
}

/** The unconfigured branch, in one place so every operation logs alike. */
function notConfigured<T>(operation: string, detail: string): GatewayResult<T> {
  const reason = razorpayUnavailableReason() ?? 'Online payment is not available';
  console.info(`[pay:log] ${operation} ${detail} — not sent, ${reason}`);
  return { ok: false, reason, configured: false };
}

/** A gateway that answered, badly. Distinct from one that was never asked. */
function gatewayFailed<T>(operation: string, error: unknown): GatewayResult<T> {
  // The SDK rejects with `{ error: { description } }` for API errors and with a
  // plain Error for transport failures.
  const raw = error as { error?: { description?: string; reason?: string }; message?: string };
  const reason = raw?.error?.description ?? raw?.message ?? 'The payment gateway did not respond';
  console.error(`[pay] ${operation} failed: ${reason}`);
  return { ok: false, reason, configured: true };
}

/**
 * Create the gateway-side order a checkout session is opened against.
 *
 * `notes.orderId` is not decoration. It is the only link from a Razorpay entity
 * back to one of our orders — webhooks arrive knowing nothing but their own
 * ids — so `utils/payment-webhook` reads it to attribute an event. Losing it
 * means a payment that cannot be matched to anything.
 *
 * `receipt` is capped at 40 characters by the API; our order numbers are well
 * inside that, and it is truncated rather than allowed to fail the call.
 */
export async function createGatewayOrder(params: {
  amountPaise: number;
  orderId: string;
  orderNumber: string;
}): Promise<GatewayResult<GatewayOrder>> {
  const api = getClient();
  if (!api) return notConfigured('create-order', `for ${params.orderNumber}`);

  if (!Number.isInteger(params.amountPaise) || params.amountPaise < 100) {
    // Razorpay's floor is ₹1. Catching it here gives a readable message rather
    // than a raw gateway error at the last step of checkout.
    return {
      ok: false,
      reason: 'Order total is below the ₹1 minimum the gateway accepts',
      configured: true,
    };
  }

  try {
    const order = await api.orders.create({
      amount: params.amountPaise,
      currency: GATEWAY_CURRENCY,
      receipt: params.orderNumber.slice(0, 40),
      notes: { orderId: params.orderId, orderNumber: params.orderNumber },
    });
    return {
      ok: true,
      data: {
        id: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        receipt: order.receipt ?? null,
        status: order.status,
      },
    };
  } catch (error) {
    return gatewayFailed('create-order', error);
  }
}

/**
 * Read a gateway order back, for the `notes` we stamped on it at creation.
 *
 * This is what binds a verified payment to the right one of our orders. The
 * checkout signature proves the gateway issued that order/payment pair — it
 * does not prove which of *our* orders the pair belongs to, and the browser
 * supplies that claim. A customer who has paid for a small order could
 * otherwise replay its perfectly valid signature against a larger unpaid order
 * of their own. Reading `notes.orderId` back from the gateway removes the
 * browser from that decision entirely.
 */
export async function fetchGatewayOrderNotes(
  gatewayOrderId: string
): Promise<GatewayResult<{ id: string; amount: number; notes: Record<string, unknown> }>> {
  const api = getClient();
  if (!api) return notConfigured('fetch-order', gatewayOrderId);

  try {
    const order = await api.orders.fetch(gatewayOrderId);
    return {
      ok: true,
      data: {
        id: order.id,
        amount: Number(order.amount),
        notes: (order.notes ?? {}) as Record<string, unknown>,
      },
    };
  } catch (error) {
    return gatewayFailed('fetch-order', error);
  }
}

/**
 * Read a payment back from the gateway.
 *
 * The browser's signature proves the gateway issued the payment id; it does not
 * prove the amount or the status, both of which come from here. Verifying an
 * amount against the signed payload alone would trust a number the browser
 * supplied.
 */
export async function fetchPayment(paymentId: string): Promise<GatewayResult<GatewayPayment>> {
  const api = getClient();
  if (!api) return notConfigured('fetch-payment', paymentId);

  try {
    const payment = await api.payments.fetch(paymentId);
    return {
      ok: true,
      data: {
        id: payment.id,
        orderId: payment.order_id ?? null,
        amount: Number(payment.amount),
        status: payment.status,
        method: payment.method ?? null,
      },
    };
  } catch (error) {
    return gatewayFailed('fetch-payment', error);
  }
}

/**
 * Capture an authorised payment.
 *
 * Orders are created with the account's automatic capture setting, under which
 * Razorpay captures on authorisation and this is never needed. It exists for
 * the account configured to capture manually, where an uncaptured
 * authorisation is released after five days and the sale is simply lost.
 * Capturing an already-captured payment is an error at the gateway, not a
 * silent success, so the caller checks status first.
 */
export async function capturePayment(
  paymentId: string,
  amountPaise: number
): Promise<GatewayResult<GatewayPayment>> {
  const api = getClient();
  if (!api) return notConfigured('capture', paymentId);

  try {
    const payment = await api.payments.capture(paymentId, amountPaise, GATEWAY_CURRENCY);
    return {
      ok: true,
      data: {
        id: payment.id,
        orderId: payment.order_id ?? null,
        amount: Number(payment.amount),
        status: payment.status,
        method: payment.method ?? null,
      },
    };
  } catch (error) {
    return gatewayFailed('capture', error);
  }
}

/**
 * Move money back to the customer.
 *
 * This is the function that actually transfers — the distinction worth being
 * precise about, because two other places in this codebase *record* a refund
 * and move nothing:
 *
 *   - `PATCH /admin/returns/:id` marking a return COMPLETED calls
 *     `completeReturn`, which restocks, writes `refundAmount` on the return
 *     request and sets the order REFUNDED. That is a ledger entry describing
 *     what is owed.
 *   - `paymentStatusAfter` in `utils/order-status` moves a cancelled or
 *     returned order to REFUNDED for the same reason.
 *
 * Neither has ever contacted a bank. `POST /api/payments/razorpay/refund` is
 * what does, and until an admin calls it — or a future automatic hook does —
 * an order marked REFUNDED means "we owe this", not "this has been sent".
 *
 * `notes.orderId` is written for the same reason as on the order: the
 * `refund.processed` webhook has to find its way back here.
 *
 * The idempotency of this call is the caller's problem, and is handled in
 * `services/payments/record` — the gateway will happily issue a second refund
 * against the same payment if asked twice.
 */
export async function createRefund(params: {
  paymentId: string;
  amountPaise: number;
  orderId: string;
  orderNumber: string;
  reason?: string;
}): Promise<GatewayResult<GatewayRefund>> {
  const api = getClient();
  if (!api) return notConfigured('refund', `${params.paymentId} for ${params.orderNumber}`);

  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    return { ok: false, reason: 'Refund amount must be a positive whole number of paise', configured: true };
  }

  try {
    const refund = await api.payments.refund(params.paymentId, {
      amount: params.amountPaise,
      // `normal` settles in five to seven working days at no charge; `optimum`
      // is instant where the customer's bank supports it and costs a fee. The
      // slow one is the right default for a returns process that is not itself
      // instant.
      speed: 'normal',
      notes: {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        ...(params.reason ? { reason: params.reason.slice(0, 256) } : {}),
      },
    });
    return {
      ok: true,
      data: {
        id: refund.id,
        paymentId: refund.payment_id,
        amount: Number(refund.amount ?? params.amountPaise),
        status: refund.status,
      },
    };
  } catch (error) {
    return gatewayFailed('refund', error);
  }
}

/**
 * Verify the handshake the browser returns from Razorpay Checkout.
 *
 * The maths lives in `utils/payment-signature`, where it is unit tested without
 * a gateway; this only supplies the secret. It returns false rather than
 * throwing when unconfigured, which is the safe direction — an unverifiable
 * payment is an unverified one.
 */
export function verifyCheckoutPayload(payload: Partial<CheckoutSignaturePayload>): boolean {
  return verifyCheckoutSignature(payload, readKeySecret() || undefined);
}

/** Verify `x-razorpay-signature` over the raw request body. */
export function verifyWebhook(rawBody: Buffer | string, signature: string | undefined): boolean {
  return verifyWebhookSignature(rawBody, signature, readWebhookSecret() || undefined);
}
