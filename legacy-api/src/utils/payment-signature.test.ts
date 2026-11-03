import {
  checkoutSignatureBody,
  hmacSha256Hex,
  timingSafeEqualHex,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '@/utils/payment-signature';

/**
 * Signature verification is the only thing standing between the payment
 * endpoints and anybody who can reach them: without it, a POST naming an order
 * id marks that order paid. So these tests care less about the happy path than
 * about every way a check could accidentally pass — an absent secret, an empty
 * signature, a body that was re-serialised on the way in.
 *
 * The expected digests below are fixed strings rather than values recomputed by
 * the test. Recomputing them with the same helper the implementation uses would
 * assert only that a function equals itself, and would keep passing if the
 * algorithm changed underneath.
 */

const KEY_SECRET = 'rzp_test_secret_key';
const WEBHOOK_SECRET = 'whsec_test_value';

const GATEWAY_ORDER_ID = 'order_QaBcDeF123456';
const PAYMENT_ID = 'pay_MnOpQrS789012';

/** HMAC-SHA256 of `order_QaBcDeF123456|pay_MnOpQrS789012` under KEY_SECRET. */
const VALID_CHECKOUT_SIGNATURE =
  '4ecf9d6c55d0c42204f9bb4a4d2c11d35f5e77a82b50da971b111a71111c6cca';

const WEBHOOK_BODY = '{"event":"payment.captured","payload":{}}';
/** HMAC-SHA256 of WEBHOOK_BODY under WEBHOOK_SECRET. */
const VALID_WEBHOOK_SIGNATURE =
  '60d1cd144fda5e40ec55bb6d49e63b385dfba142254288919c96e4fa74a547ad';

describe('checkoutSignatureBody', () => {
  it('joins the two ids with a pipe, in the order Razorpay signs them', () => {
    expect(checkoutSignatureBody(GATEWAY_ORDER_ID, PAYMENT_ID)).toBe(
      `${GATEWAY_ORDER_ID}|${PAYMENT_ID}`
    );
  });
});

describe('hmacSha256Hex', () => {
  it('produces the documented lowercase hex digest', () => {
    expect(hmacSha256Hex(`${GATEWAY_ORDER_ID}|${PAYMENT_ID}`, KEY_SECRET)).toBe(
      VALID_CHECKOUT_SIGNATURE
    );
  });

  it('is sensitive to the secret', () => {
    expect(hmacSha256Hex('same message', 'secret-a')).not.toBe(
      hmacSha256Hex('same message', 'secret-b')
    );
  });
});

describe('timingSafeEqualHex', () => {
  it('accepts identical digests', () => {
    expect(timingSafeEqualHex(VALID_CHECKOUT_SIGNATURE, VALID_CHECKOUT_SIGNATURE)).toBe(true);
  });

  it('is case-insensitive about hex, which the transport is not consistent about', () => {
    expect(
      timingSafeEqualHex(VALID_CHECKOUT_SIGNATURE, VALID_CHECKOUT_SIGNATURE.toUpperCase())
    ).toBe(true);
  });

  it('rejects a digest differing in one character', () => {
    const tampered = `0${VALID_CHECKOUT_SIGNATURE.slice(1)}`;
    expect(timingSafeEqualHex(VALID_CHECKOUT_SIGNATURE, tampered)).toBe(false);
  });

  it('rejects rather than throwing on mismatched lengths', () => {
    // `crypto.timingSafeEqual` throws on unequal buffers, and a thrown error in
    // a verification path is one `catch` away from being read as "carry on".
    expect(timingSafeEqualHex(VALID_CHECKOUT_SIGNATURE, 'abcd')).toBe(false);
  });

  it('rejects two empty strings, which are trivially equal', () => {
    expect(timingSafeEqualHex('', '')).toBe(false);
  });

  it('rejects non-hex input rather than letting it decode to something shorter', () => {
    const nonHex = 'z'.repeat(VALID_CHECKOUT_SIGNATURE.length);
    expect(timingSafeEqualHex(VALID_CHECKOUT_SIGNATURE, nonHex)).toBe(false);
  });
});

describe('verifyCheckoutSignature', () => {
  const validPayload = {
    razorpay_order_id: GATEWAY_ORDER_ID,
    razorpay_payment_id: PAYMENT_ID,
    razorpay_signature: VALID_CHECKOUT_SIGNATURE,
  };

  it('accepts the genuine handshake', () => {
    expect(verifyCheckoutSignature(validPayload, KEY_SECRET)).toBe(true);
  });

  it('refuses when the secret is missing', () => {
    // The case this whole project is in today. Verification must fail closed:
    // with no secret nothing can be proven, and "unprovable" is not "fine".
    expect(verifyCheckoutSignature(validPayload, undefined)).toBe(false);
    expect(verifyCheckoutSignature(validPayload, '')).toBe(false);
  });

  it('refuses the wrong secret', () => {
    expect(verifyCheckoutSignature(validPayload, 'some_other_secret')).toBe(false);
  });

  it('refuses a payment id swapped for another', () => {
    // The replay a customer could otherwise attempt with a real signature.
    expect(
      verifyCheckoutSignature({ ...validPayload, razorpay_payment_id: 'pay_Different' }, KEY_SECRET)
    ).toBe(false);
  });

  it('refuses an order id swapped for another', () => {
    expect(
      verifyCheckoutSignature({ ...validPayload, razorpay_order_id: 'order_Different' }, KEY_SECRET)
    ).toBe(false);
  });

  it('refuses an empty or absent signature', () => {
    expect(verifyCheckoutSignature({ ...validPayload, razorpay_signature: '' }, KEY_SECRET)).toBe(
      false
    );
    expect(
      verifyCheckoutSignature(
        { razorpay_order_id: GATEWAY_ORDER_ID, razorpay_payment_id: PAYMENT_ID },
        KEY_SECRET
      )
    ).toBe(false);
  });

  it('refuses a payload that is null or missing its fields', () => {
    expect(verifyCheckoutSignature(null, KEY_SECRET)).toBe(false);
    expect(verifyCheckoutSignature(undefined, KEY_SECRET)).toBe(false);
    expect(verifyCheckoutSignature({}, KEY_SECRET)).toBe(false);
  });

  it('refuses non-string fields smuggled in as JSON objects', () => {
    expect(
      verifyCheckoutSignature(
        { ...validPayload, razorpay_payment_id: { toString: () => PAYMENT_ID } as never },
        KEY_SECRET
      )
    ).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  it('accepts a genuine signature over the raw body', () => {
    expect(verifyWebhookSignature(WEBHOOK_BODY, VALID_WEBHOOK_SIGNATURE, WEBHOOK_SECRET)).toBe(true);
  });

  it('accepts the same body as a Buffer, which is how express.raw delivers it', () => {
    expect(
      verifyWebhookSignature(Buffer.from(WEBHOOK_BODY, 'utf8'), VALID_WEBHOOK_SIGNATURE, WEBHOOK_SECRET)
    ).toBe(true);
  });

  it('refuses when the webhook secret is unset', () => {
    expect(verifyWebhookSignature(WEBHOOK_BODY, VALID_WEBHOOK_SIGNATURE, undefined)).toBe(false);
  });

  it('refuses the API key secret in place of the webhook secret', () => {
    // Two different secrets configured in two different places. Using one for
    // the other is the mistake that makes an endpoint look verified and is not.
    expect(verifyWebhookSignature(WEBHOOK_BODY, VALID_WEBHOOK_SIGNATURE, KEY_SECRET)).toBe(false);
  });

  it('refuses a body altered after signing', () => {
    const tampered = WEBHOOK_BODY.replace('captured', 'refunded');
    expect(verifyWebhookSignature(tampered, VALID_WEBHOOK_SIGNATURE, WEBHOOK_SECRET)).toBe(false);
  });

  it('refuses a re-serialised body, which is why the raw bytes are kept', () => {
    // `JSON.parse` then `JSON.stringify` produces equivalent JSON with a
    // different byte sequence, and therefore a different digest. This is the
    // whole reason `express.raw` is mounted for the webhook path.
    const reSerialised = JSON.stringify({ payload: {}, event: 'payment.captured' });
    expect(reSerialised).not.toBe(WEBHOOK_BODY);
    expect(verifyWebhookSignature(reSerialised, VALID_WEBHOOK_SIGNATURE, WEBHOOK_SECRET)).toBe(false);
  });

  it('refuses an empty body', () => {
    expect(verifyWebhookSignature('', VALID_WEBHOOK_SIGNATURE, WEBHOOK_SECRET)).toBe(false);
    expect(verifyWebhookSignature(Buffer.alloc(0), VALID_WEBHOOK_SIGNATURE, WEBHOOK_SECRET)).toBe(
      false
    );
  });

  it('refuses a missing, empty, or repeated signature header', () => {
    expect(verifyWebhookSignature(WEBHOOK_BODY, undefined, WEBHOOK_SECRET)).toBe(false);
    expect(verifyWebhookSignature(WEBHOOK_BODY, '', WEBHOOK_SECRET)).toBe(false);
    // A repeated header arrives as an array; it is not a signature.
    expect(
      verifyWebhookSignature(WEBHOOK_BODY, [VALID_WEBHOOK_SIGNATURE], WEBHOOK_SECRET)
    ).toBe(false);
  });

  it('refuses a null or undefined body', () => {
    expect(verifyWebhookSignature(null, VALID_WEBHOOK_SIGNATURE, WEBHOOK_SECRET)).toBe(false);
    expect(verifyWebhookSignature(undefined, VALID_WEBHOOK_SIGNATURE, WEBHOOK_SECRET)).toBe(false);
  });
});
