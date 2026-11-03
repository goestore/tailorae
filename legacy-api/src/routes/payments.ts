import { Router, Response, Request } from 'express';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { isNonEmptyString } from '@/utils/helpers';
import { fromPaise, resolveRefundAmount, toPaise } from '@/utils/payment-amounts';
import {
  decideWebhookAction,
  resolveOrderReference,
  type WebhookAction,
} from '@/utils/payment-webhook';
import {
  createGatewayOrder,
  createRefund,
  fetchGatewayOrderNotes,
  fetchPayment,
  gatewayStatus,
  razorpayReady,
  razorpayWebhookReady,
  verifyCheckoutPayload,
  verifyWebhook,
} from '@/services/payments/razorpay';
import {
  recordCapture,
  recordFailure,
  recordRefund,
  refundAlreadyIssued,
} from '@/services/payments/record';

/**
 * Online payments.
 *
 * Razorpay only. Stripe and PayPal previously had endpoints here that answered
 * 501 forever; both are gone rather than left as dead routes advertising
 * capability that does not exist. Their packages remain in `package.json`,
 * imported by nothing — removing a dependency is not this change's business,
 * but nothing in `src/` refers to either gateway. The storefront prices in
 * rupees and sells in India, so INR through Razorpay is the whole requirement.
 *
 * The flow, and which step guarantees what:
 *
 *   1. `POST /api/orders` places the order. Totals are computed server-side
 *      from the cart, as they always were.
 *   2. `POST /razorpay/create-order` creates the gateway order **for the amount
 *      in the database**. No amount is ever read from a request body — that is
 *      the single most important line in this file.
 *   3. The browser opens Razorpay Checkout and, on success, posts the
 *      handshake to `/razorpay/verify`. The signature proves the gateway issued
 *      the payment; the gateway is then asked which of our orders it belongs
 *      to, because the browser's claim about that is not evidence.
 *   4. `/razorpay/webhook` is what makes the money side correct. It is the only
 *      path that still works when the customer closes the tab mid-payment, and
 *      it is the authority on settlement and refunds.
 *
 * Steps 3 and 4 both record the same payment, in an order nobody controls.
 * `services/payments/record` is what makes that safe.
 *
 * Without credentials every one of these answers honestly: `/config` reports
 * `enabled: false` with the reason, and the write endpoints answer 503 with the
 * same reason. Nothing pretends a payment succeeded.
 */

const router = Router();

/** The webhook's path within this router. */
const WEBHOOK_ROUTE = '/razorpay/webhook';

/**
 * The webhook's full path, for the `express.raw` mount in `src/index.ts` —
 * signature verification needs the bytes as sent, and the global `express.json`
 * would consume them. Derived from the route above and exported rather than
 * written out twice, so the parser mount and the handler cannot drift apart: if
 * they ever did, the body would arrive parsed and the handler would refuse it
 * rather than skip verification.
 */
export const RAZORPAY_WEBHOOK_PATH = `/api/payments${WEBHOOK_ROUTE}`;

/** 503 with the gateway's own reason, so the client can show it verbatim. */
const gatewayUnavailable = (res: Response): void => {
  const status = gatewayStatus();
  res.status(503).json({
    success: false,
    message: status.reason ?? 'Online payment is not available',
    data: { gateway: { enabled: false, reason: status.reason } },
  });
};

// @route   GET /api/payments/config
// @desc    Whether online payment can be offered, and the publishable key
// @access  Public — `keyId` is the publishable half and is meant for the browser
//
// Checkout calls this before rendering the payment step. It is what lets the
// online option be disabled *with a reason* rather than offered as a button
// that fails after the customer commits to it.
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Payment configuration fetched',
    data: { razorpay: gatewayStatus() },
  });
});

// @route   POST /api/payments/razorpay/create-order
// @desc    Create a gateway order for one of our orders
// @access  Private
router.post('/razorpay/create-order', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!razorpayReady()) {
      gatewayUnavailable(res);
      return;
    }

    const { orderId } = (req.body ?? {}) as Record<string, unknown>;
    if (!isNonEmptyString(orderId)) {
      res.status(400).json({ success: false, message: 'orderId is required' });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId.trim() },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        status: true,
        total: true,
        paymentStatus: true,
        paymentMethod: true,
        user: { select: { email: true, phone: true, firstName: true, lastName: true } },
      },
    });

    if (!order || order.userId !== req.userId) {
      // Deliberately the same answer for "does not exist" and "is not yours":
      // distinguishing them turns this into an order-id oracle.
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (order.paymentStatus === 'PAID') {
      res.status(409).json({ success: false, message: 'This order has already been paid' });
      return;
    }
    if (order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'CANCELLED') {
      res.status(409).json({
        success: false,
        message: `This order can no longer be paid (payment status: ${order.paymentStatus})`,
      });
      return;
    }
    if (order.status === 'CANCELLED' || order.status === 'RETURNED') {
      res.status(409).json({
        success: false,
        message: `This order can no longer be paid (status: ${order.status})`,
      });
      return;
    }
    if (order.paymentMethod === 'COD') {
      res.status(409).json({
        success: false,
        message: 'This is a cash-on-delivery order and is not paid online',
      });
      return;
    }

    // The amount, from the database. Never from the request.
    const created = await createGatewayOrder({
      amountPaise: toPaise(order.total),
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    if (!created.ok) {
      res.status(created.configured ? 502 : 503).json({
        success: false,
        message: created.reason,
      });
      return;
    }

    const status = gatewayStatus();
    res.status(201).json({
      success: true,
      message: 'Payment session created',
      data: {
        // Everything Razorpay Checkout needs in the browser, and nothing more.
        keyId: status.keyId,
        gatewayOrderId: created.data.id,
        amount: created.data.amount,
        currency: created.data.currency,
        orderId: order.id,
        orderNumber: order.orderNumber,
        prefill: {
          name: [order.user.firstName, order.user.lastName].filter(Boolean).join(' '),
          email: order.user.email,
          contact: order.user.phone ?? '',
        },
      },
    });
  } catch (error) {
    console.error('[PAYMENTS] create-order failed:', error);
    res.status(500).json({ success: false, message: 'Failed to start the payment' });
  }
});

// @route   POST /api/payments/razorpay/verify
// @desc    Verify the checkout handshake and record the payment
// @access  Private
//
// This is the fast path that lets the customer see a paid order immediately.
// It is not the authority — the webhook is — and it is written so that being
// unable to complete safely is reported as "not confirmed yet" rather than
// guessed at.
router.post('/razorpay/verify', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!razorpayReady()) {
      gatewayUnavailable(res);
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const gatewayOrderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;

    if (!isNonEmptyString(gatewayOrderId) || !isNonEmptyString(paymentId)) {
      res.status(400).json({
        success: false,
        message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required',
      });
      return;
    }

    if (
      !verifyCheckoutPayload({
        razorpay_order_id: gatewayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '',
      })
    ) {
      // Loud, because a genuine customer never sees this: either the payload was
      // tampered with, or the key secret does not match the key the checkout was
      // opened with.
      console.error(`[pay] checkout signature rejected for ${gatewayOrderId}`);
      res.status(400).json({ success: false, message: 'Payment signature could not be verified' });
      return;
    }

    /**
     * Which of our orders this payment settles is read back from the gateway,
     * not taken from the request. A valid signature proves the gateway issued
     * this order/payment pair; it says nothing about which of our orders the
     * customer meant it for, and a customer who has legitimately paid a small
     * order could otherwise replay that signature against a larger unpaid one.
     */
    const gatewayOrder = await fetchGatewayOrderNotes(gatewayOrderId);
    const payment = await fetchPayment(paymentId);

    if (!gatewayOrder.ok || !payment.ok) {
      /**
       * The signature verified, so the payment is almost certainly real — but
       * without the gateway's answer we cannot say which order it belongs to,
       * and recording it against the one the browser named is exactly the hole
       * described above. 202 says what is true: received, not yet confirmed.
       * The webhook will settle it, which is why that path exists.
       */
      const reason = gatewayOrder.ok ? (payment as { reason: string }).reason : gatewayOrder.reason;
      console.error(`[pay] could not confirm ${paymentId} with the gateway: ${reason}`);
      res.status(202).json({
        success: true,
        message:
          'Payment received and awaiting confirmation from the gateway. Your order will update shortly.',
        data: { confirmed: false },
      });
      return;
    }

    if (payment.data.orderId !== gatewayOrderId) {
      console.error(
        `[pay] ${paymentId} belongs to ${payment.data.orderId}, not ${gatewayOrderId} — rejected`
      );
      res.status(400).json({ success: false, message: 'Payment does not match this order' });
      return;
    }

    const ourOrderId = gatewayOrder.data.notes.orderId;
    if (typeof ourOrderId !== 'string' || !ourOrderId) {
      console.error(`[pay] gateway order ${gatewayOrderId} carries no orderId note`);
      res.status(202).json({
        success: true,
        message: 'Payment received and awaiting confirmation from the gateway.',
        data: { confirmed: false },
      });
      return;
    }

    /**
     * `authorized` and `captured` both mean the customer's money is committed.
     * Anything else — `created`, `failed` — is not a payment yet, and must not
     * mark an order paid.
     */
    if (payment.data.status !== 'captured' && payment.data.status !== 'authorized') {
      res.status(409).json({
        success: false,
        message: `Payment is ${payment.data.status} and has not been collected`,
      });
      return;
    }

    const recorded = await recordCapture({
      reference: { by: 'id', value: ourOrderId },
      paymentId,
      // The gateway's figure, not the browser's.
      amountPaise: payment.data.amount,
      source: 'checkout',
      actorId: req.userId ?? null,
      // Belt and braces on top of the notes lookup: the order still has to be
      // this customer's.
      requireUserId: req.userId!,
    });

    if (recorded.outcome === 'unknown-order') {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (recorded.outcome === 'conflict') {
      res.status(409).json({ success: false, message: recorded.message });
      return;
    }

    res.json({
      success: true,
      message:
        recorded.outcome === 'duplicate' ? 'Payment was already recorded' : 'Payment successful',
      data: {
        confirmed: true,
        orderId: recorded.orderId,
        orderNumber: recorded.orderNumber,
        paymentStatus: recorded.paymentStatus,
      },
    });
  } catch (error) {
    console.error('[PAYMENTS] verify failed:', error);
    res.status(500).json({ success: false, message: 'Failed to verify the payment' });
  }
});

// @route   POST /api/payments/razorpay/webhook
// @desc    Settlement, failure and refund notifications from Razorpay
// @access  Public — authenticated by HMAC signature, not by a token
//
// The endpoint that actually matters. A customer who closes the tab after
// paying never calls `/verify`, and their money is real regardless; this is the
// only path that records it. It is also the authority on refunds, which is why
// the same handler serves both.
//
// Status codes here are instructions to a retrying machine, not to a person:
//   200 — dealt with, or knowably undealable-with. Stop retrying.
//   400 — the signature did not verify. Retrying will not help either.
//   500 — something transient broke on our side. Please do retry.
router.post(WEBHOOK_ROUTE, async (req: Request, res: Response) => {
  const eventId = req.header('x-razorpay-event-id') ?? 'unknown';

  if (!razorpayWebhookReady()) {
    // Never 200 an event that was not verified. A missing secret means every
    // caller is unauthenticated, including anyone who found this URL.
    console.error(
      `[pay:log] webhook ${eventId} rejected — not verified, RAZORPAY_WEBHOOK_SECRET is unset`
    );
    res.status(503).json({ success: false, message: 'Webhook secret is not configured' });
    return;
  }

  /**
   * `express.raw` is mounted for this path in `src/index.ts`, so the body
   * arrives as the bytes Razorpay signed. If it is anything else, the mount is
   * missing or has been reordered behind `express.json`, and the signature
   * cannot be checked — which must fail, not fall back to trusting the body.
   */
  if (!Buffer.isBuffer(req.body)) {
    console.error(
      `[pay] webhook ${eventId} arrived without a raw body — check the express.raw mount in src/index.ts`
    );
    res.status(500).json({ success: false, message: 'Webhook body was not readable' });
    return;
  }

  if (!verifyWebhook(req.body, req.header('x-razorpay-signature'))) {
    console.error(`[pay] webhook ${eventId} signature rejected`);
    res.status(400).json({ success: false, message: 'Invalid signature' });
    return;
  }

  // Parsed only after the signature is verified, over the exact bytes signed.
  let action: WebhookAction;
  try {
    action = decideWebhookAction(JSON.parse(req.body.toString('utf8')));
  } catch {
    console.error(`[pay] webhook ${eventId} body was not valid JSON`);
    res.status(400).json({ success: false, message: 'Body is not valid JSON' });
    return;
  }

  if (action.kind === 'ignore') {
    res.json({ success: true, message: 'Acknowledged', data: { handled: false, reason: action.reason } });
    return;
  }

  const reference = resolveOrderReference(action);
  if (!reference) {
    /**
     * A verified event we cannot attribute to an order. Retrying will not
     * conjure the missing note, so it is acknowledged — but loudly, because it
     * means real money moved against something we cannot find.
     */
    console.error(`[pay] webhook ${eventId} (${action.kind}) carries no order reference — cannot attribute`);
    res.json({
      success: true,
      message: 'Acknowledged',
      data: { handled: false, reason: 'no order reference in notes' },
    });
    return;
  }

  try {
    const outcome =
      action.kind === 'capture'
        ? await recordCapture({
            reference,
            paymentId: action.payment.id,
            amountPaise: action.payment.amount,
            source: 'webhook',
          })
        : action.kind === 'fail'
          ? await recordFailure({
              reference,
              paymentId: action.payment.id,
              reason: action.reason,
            })
          : await recordRefund({
              reference,
              refundId: action.refund.id,
              amountPaise: action.refund.amount,
            });

    console.info(
      `[pay] webhook ${eventId} ${action.kind} -> ${outcome.outcome}: ${outcome.message}`
    );

    // Every one of these is a 200. `duplicate` is the normal result of a retry
    // and is a success; `conflict` and `unknown-order` are recorded and logged,
    // and no amount of retrying will change them.
    res.json({
      success: true,
      message: 'Acknowledged',
      data: { handled: outcome.outcome === 'applied', outcome: outcome.outcome },
    });
  } catch (error) {
    // Transient: the database was unreachable, a transaction deadlocked. This
    // is the one case where Razorpay retrying is the right thing, so say so.
    console.error(`[PAYMENTS] webhook ${eventId} failed:`, error);
    res.status(500).json({ success: false, message: 'Could not record the event' });
  }
});

// @route   POST /api/payments/razorpay/refund
// @desc    Actually send money back to a customer
// @access  Private/Admin
//
// The distinction this endpoint exists to close: `PATCH /admin/returns/:id`
// marking a return COMPLETED *records* a refund — it restocks, writes
// `refundAmount` on the return request, and sets the order REFUNDED — but has
// never contacted a bank. Everything it does is a ledger entry meaning "we owe
// this". This route is what moves the money.
//
// It is deliberately a separate, admin-only step rather than something the
// return completion triggers by itself: with no credentials on this project
// there is nothing to trigger, and an automatic transfer is not a thing to wire
// up untested. The return flow can call this once keys are in place.
router.post('/razorpay/refund', authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    if (!razorpayReady()) {
      gatewayUnavailable(res);
      return;
    }

    const { orderId, amount, reason } = (req.body ?? {}) as Record<string, unknown>;
    if (!isNonEmptyString(orderId)) {
      res.status(400).json({ success: false, message: 'orderId is required' });
      return;
    }
    if (amount !== undefined && amount !== null && typeof amount !== 'number') {
      res.status(400).json({ success: false, message: 'amount must be a number of rupees' });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId.trim() },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        paymentId: true,
        paymentStatus: true,
        paymentMethod: true,
      },
    });

    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (order.paymentMethod === 'COD') {
      res.status(409).json({
        success: false,
        message: 'This order was paid in cash on delivery — there is nothing for the gateway to return',
      });
      return;
    }
    if (!order.paymentId) {
      res.status(409).json({
        success: false,
        message: 'No gateway payment is recorded against this order, so there is nothing to refund',
      });
      return;
    }

    /**
     * The guard that stops a double-clicked button paying a customer twice.
     * The gateway will not stop it — asking Razorpay to refund the same payment
     * twice succeeds twice — so this check, not the gateway, is what makes the
     * endpoint safe to retry.
     */
    if (await refundAlreadyIssued(order.id)) {
      res.status(409).json({
        success: false,
        message: 'A refund has already been issued for this order',
      });
      return;
    }

    const resolved = resolveRefundAmount(
      typeof amount === 'number' ? amount : undefined,
      order.total
    );
    if (!resolved.ok) {
      res.status(400).json({ success: false, message: resolved.message });
      return;
    }

    // Money moves here.
    const refund = await createRefund({
      paymentId: order.paymentId,
      amountPaise: resolved.paise,
      orderId: order.id,
      orderNumber: order.orderNumber,
      ...(isNonEmptyString(reason) ? { reason: reason.trim() } : {}),
    });

    if (!refund.ok) {
      res.status(refund.configured ? 502 : 503).json({ success: false, message: refund.reason });
      return;
    }

    // And is written down here. A `refund.processed` webhook will arrive for the
    // same refund id later; the marker written now is what makes that a no-op.
    const recorded = await recordRefund({
      reference: { by: 'id', value: order.id },
      refundId: refund.data.id,
      amountPaise: refund.data.amount,
      actorId: req.userId ?? null,
    });

    res.json({
      success: true,
      message: `Refund of ${fromPaise(refund.data.amount)} sent to the customer`,
      data: {
        refundId: refund.data.id,
        amount: fromPaise(refund.data.amount),
        gatewayStatus: refund.data.status,
        recorded: recorded.outcome,
        paymentStatus: recorded.paymentStatus,
      },
    });
  } catch (error) {
    console.error('[PAYMENTS] refund failed:', error);
    res.status(500).json({ success: false, message: 'Failed to issue the refund' });
  }
});

// @route   GET /api/payments/:id
// @desc    Get payment details (looks up own order by payment ID or order ID)
// @access  Private
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id }, { paymentId: id }],
        ...(req.user?.role === 'ADMIN' ? {} : { userId: req.userId! }),
      },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        paymentMethod: true,
        paymentId: true,
        receiptUrl: true,
        invoiceUrl: true,
        subtotal: true,
        discount: true,
        tax: true,
        shippingCost: true,
        total: true,
        createdAt: true,
      },
    });

    if (!order) {
      res.status(404).json({ success: false, message: 'Payment not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Payment details fetched',
      data: { payment: order },
    });
  } catch (error) {
    console.error('[PAYMENTS] get failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
    });
  }
});

export default router;
