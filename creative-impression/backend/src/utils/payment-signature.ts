import crypto from 'crypto';

/**
 * The signatures Razorpay asks us to check, and nothing else.
 *
 * Two different signatures arrive from two different places, and conflating
 * them is the classic way to build an integration that looks verified and is
 * not:
 *
 *   - The **checkout signature** comes back to the browser when the modal
 *     closes, and is an HMAC of `razorpay_order_id|razorpay_payment_id` keyed
 *     on the API *key secret*.
 *   - The **webhook signature** arrives in `x-razorpay-signature`, and is an
 *     HMAC of the raw request body keyed on the *webhook secret* — a different
 *     secret, configured separately in the dashboard.
 *
 * Both live here, as pure functions over strings, so they can be tested
 * against known vectors without a gateway, a database or a network. The rule
 * that makes them worth having is at the bottom of every function: a signature
 * that cannot be checked is not a signature that passes. Every path returns
 * false when the secret is missing rather than short-circuiting to true, which
 * is the failure that would let anybody who can reach the endpoint mark any
 * order paid.
 */

/** The message Razorpay signs when the checkout modal succeeds. */
export const checkoutSignatureBody = (gatewayOrderId: string, paymentId: string): string =>
  `${gatewayOrderId}|${paymentId}`;

/** Lowercase hex HMAC-SHA256, which is the encoding Razorpay uses throughout. */
export function hmacSha256Hex(message: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Compare two hex digests without leaking where they first differ.
 *
 * `===` on a signature is a timing oracle: it returns as soon as a byte
 * mismatches, so an attacker can recover a valid digest one character at a
 * time by measuring the response. `timingSafeEqual` needs equal-length buffers
 * or it throws, so the length check comes first — and length is not a secret,
 * a digest of the wrong length is simply malformed.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length || a.length === 0) return false;
  // A non-hex string would decode to a shorter buffer and throw below.
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export interface CheckoutSignaturePayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Validate the handshake the browser hands back after a successful payment.
 *
 * This is what stops a customer opening dev tools and POSTing an invented
 * `razorpay_payment_id` at `/verify` to mark their own order paid. It proves
 * the gateway saw the payment; it does not prove the money settled, which is
 * what the webhook is for.
 */
export function verifyCheckoutSignature(
  payload: Partial<CheckoutSignaturePayload> | null | undefined,
  keySecret: string | undefined
): boolean {
  if (!keySecret) return false;
  if (!payload) return false;

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;
  if (
    typeof razorpay_order_id !== 'string' ||
    typeof razorpay_payment_id !== 'string' ||
    typeof razorpay_signature !== 'string' ||
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature
  ) {
    return false;
  }

  const expected = hmacSha256Hex(
    checkoutSignatureBody(razorpay_order_id, razorpay_payment_id),
    keySecret
  );
  return timingSafeEqualHex(expected, razorpay_signature);
}

/**
 * Validate `x-razorpay-signature` over the **raw** request body.
 *
 * Raw, byte for byte, is not a detail. `JSON.parse` followed by
 * `JSON.stringify` reorders nothing in practice but does normalise unicode
 * escapes, number formatting and key spacing, and any one of those changes the
 * digest — so a re-serialised body fails to verify against a genuine
 * signature, and the natural "fix" for that is to stop verifying. The route
 * mounts `express.raw` for this path alone so the Buffer survives.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string | null | undefined,
  signature: string | string[] | undefined,
  webhookSecret: string | undefined
): boolean {
  if (!webhookSecret) return false;
  if (rawBody === null || rawBody === undefined) return false;
  if (typeof signature !== 'string' || !signature) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  if (body.length === 0) return false;

  return timingSafeEqualHex(hmacSha256Hex(body, webhookSecret), signature);
}
