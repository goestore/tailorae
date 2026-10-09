import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Razorpay Checkout, from the browser's side.
 *
 * The whole gateway conversation lives here rather than in the checkout page,
 * because it is a sequence with three failure modes that all look the same from
 * a React component: the gateway is not configured, the customer closed the
 * modal, or the payment went through but our server could not confirm it yet.
 * Collapsing those into "payment failed" is how a customer who has been charged
 * is told their order did not happen.
 *
 * Nothing here decides an amount. The server creates the gateway order from the
 * total it holds, and the browser is handed only what Razorpay needs to open
 * the modal — including the publishable key id, which is the one credential
 * meant to reach a browser at all.
 */

/** The gateway script Razorpay hosts. It has no npm build worth using. */
const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/** Brand accent, so the modal is not visibly a different product. */
const BRAND_COLOUR = '#FBB602';

export interface PaymentConfig {
  enabled: boolean;
  keyId: string | null;
  currency: string;
  /** Written to be shown to a customer when `enabled` is false. */
  reason: string | null;
  webhookConfigured: boolean;
}

/**
 * What checkout renders when the config cannot be read at all.
 *
 * Disabled, with a reason. The important property is that an unknown gateway
 * state is never treated as a working one — the customer sees why the option is
 * unavailable instead of a button that fails after they commit to it.
 */
export const UNAVAILABLE_CONFIG: PaymentConfig = {
  enabled: false,
  keyId: null,
  currency: 'INR',
  reason: 'Online payment is unavailable at the moment. Cash on delivery is still available.',
  webhookConfigured: false,
};

/** Ask the server whether online payment can be offered. Never rejects. */
export async function fetchPaymentConfig(): Promise<PaymentConfig> {
  try {
    const res = await apiClient.get('/payments/config');
    const config = res.data?.data?.razorpay as PaymentConfig | undefined;
    return config ?? UNAVAILABLE_CONFIG;
  } catch {
    return UNAVAILABLE_CONFIG;
  }
}

// ---------------------------------------------------------------------------
// The gateway script
// ---------------------------------------------------------------------------

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpayHandlerResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance;

interface RazorpayWindow extends Window {
  Razorpay?: RazorpayConstructor;
}

/**
 * Load the gateway script once per page.
 *
 * The promise is cached rather than the boolean, so two components asking at
 * the same moment wait on one network request instead of injecting two tags. A
 * failed load clears the cache so a later attempt can retry rather than being
 * stuck with a rejected promise forever.
 */
let scriptPromise: Promise<RazorpayConstructor> | null = null;

export function loadRazorpayCheckout(): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout can only be loaded in a browser'));
  }

  const existing = (window as RazorpayWindow).Razorpay;
  if (existing) return Promise.resolve(existing);

  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const constructor = (window as RazorpayWindow).Razorpay;
      if (constructor) {
        resolve(constructor);
      } else {
        reject(new Error('Razorpay Checkout loaded but did not register itself'));
      }
    };
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout'));
    document.body.appendChild(script);
  });

  scriptPromise.catch(() => {
    scriptPromise = null;
  });

  return scriptPromise;
}

// ---------------------------------------------------------------------------
// The payment itself
// ---------------------------------------------------------------------------

/** What the server hands back when a payment session is opened. */
interface PaymentSession {
  keyId: string;
  gatewayOrderId: string;
  amount: number;
  currency: string;
  orderNumber: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

/**
 * How a payment attempt ended.
 *
 *   - `paid`      — confirmed by our server. Safe to show a paid order.
 *   - `pending`   — the customer paid and the gateway agrees, but our server
 *                   could not confirm it in time. The webhook will settle it.
 *                   Emphatically not a failure, and must never be shown as one.
 *   - `dismissed` — the modal was closed without paying. The order still
 *                   exists and unpaid; the customer can try again.
 *   - `failed`    — the attempt did not succeed and nothing was charged.
 */
export type PaymentOutcome =
  | { status: 'paid'; orderNumber: string }
  | { status: 'pending'; message: string }
  | { status: 'dismissed' }
  | { status: 'failed'; message: string };

/**
 * Take payment for an order that already exists.
 *
 * The order is created first, by `POST /orders`, and its id is all this needs:
 * the amount comes from the database on the server side, so there is nothing
 * here a customer could edit to pay less.
 *
 * Resolves for every outcome including failure — a rejected promise would make
 * "the customer closed the modal" indistinguishable from "the network died",
 * and those want different words on screen.
 */
export async function payForOrder(orderId: string): Promise<PaymentOutcome> {
  let session: PaymentSession;
  let Razorpay: RazorpayConstructor;

  try {
    // Loaded in parallel with the session: the script is ~90KB from a third
    // party and is the slowest part of opening the modal.
    const [sessionRes, constructor] = await Promise.all([
      apiClient.post('/payments/razorpay/create-order', { orderId }),
      loadRazorpayCheckout(),
    ]);
    session = sessionRes.data?.data as PaymentSession;
    Razorpay = constructor;
    if (!session?.gatewayOrderId || !session?.keyId) {
      return { status: 'failed', message: 'Could not start the payment. Please try again.' };
    }
  } catch (error) {
    return {
      status: 'failed',
      message: getApiErrorMessage(error, 'Could not start the payment. Please try again.'),
    };
  }

  return new Promise<PaymentOutcome>((resolve) => {
    // Razorpay calls exactly one of `handler` and `ondismiss` in normal use, but
    // a double call would resolve a settled promise silently and leave the UI in
    // a state nobody chose. Guarded rather than assumed.
    let settled = false;
    const settle = (outcome: PaymentOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const checkout = new Razorpay({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency,
      name: 'Creative Impression',
      description: `Order ${session.orderNumber}`,
      order_id: session.gatewayOrderId,
      prefill: session.prefill,
      theme: { color: BRAND_COLOUR },
      handler: (response) => {
        /**
         * The customer has paid. Everything from here is confirmation, and no
         * branch of it may tell them otherwise — the money has left their
         * account whatever our server says next. The webhook is the backstop
         * for every one of these paths.
         */
        apiClient
          .post('/payments/razorpay/verify', response)
          .then((res) => {
            if (res.data?.data?.confirmed) {
              settle({ status: 'paid', orderNumber: session.orderNumber });
            } else {
              settle({
                status: 'pending',
                message:
                  res.data?.message ??
                  'Payment received. Your order will update as soon as it is confirmed.',
              });
            }
          })
          .catch(() => {
            settle({
              status: 'pending',
              message:
                'Payment received, but we could not confirm it just now. Your order will update shortly.',
            });
          });
      },
      modal: {
        ondismiss: () => settle({ status: 'dismissed' }),
      },
    });

    // Fired when an attempt inside the modal fails. The modal stays open for a
    // retry, so this is recorded and not settled — `ondismiss` still runs if
    // the customer gives up.
    checkout.on('payment.failed', () => {});

    checkout.open();
  });
}
