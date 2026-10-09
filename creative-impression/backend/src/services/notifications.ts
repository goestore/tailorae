import { OrderStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatRupees as rupees } from '@/utils/helpers';
import { sendMail, sendMailBatch, type MailMessage, type MailResult } from '@/services/mailer';

/**
 * What the store actually sends, and when.
 *
 * Every function here is fire-and-forget from the caller's point of view: they
 * catch their own failures and resolve, because none of these is worth failing
 * an order or a stock update over. Call them with `void` after the work they
 * report on has committed.
 */

const storefront = (): string =>
  (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** The address to reach a customer on: their account, else the delivery form. */
const recipientFor = (order: {
  user?: { email: string | null } | null;
  shippingAddress?: { email: string | null } | null;
}): string | null => order.user?.email || order.shippingAddress?.email || null;

/**
 * Customer-facing wording per status. Statuses the shopper does not need a mail
 * about (PENDING is the confirmation they already got) are deliberately absent —
 * a mail for every internal step trains people to ignore all of them.
 */
const STATUS_MAIL: Partial<Record<OrderStatus, { subject: string; line: string }>> = {
  CONFIRMED: {
    subject: 'Your order is confirmed',
    line: 'We have confirmed your order and it is going into production or packing now.',
  },
  PROCESSING: {
    subject: 'Your order is being prepared',
    line: 'Your order is being picked and packed. We will send tracking as soon as it ships.',
  },
  SHIPPED: {
    subject: 'Your order has shipped',
    line: 'Your parcel is on its way.',
  },
  DELIVERED: {
    subject: 'Your order has been delivered',
    line: 'Your parcel has been delivered. If anything is not right, you have 7 days to raise a return.',
  },
  CANCELLED: {
    subject: 'Your order has been cancelled',
    line: 'This order has been cancelled. Any payment already made is refunded to the original method.',
  },
  RETURNED: {
    subject: 'We have your return',
    line: 'Your return has reached us and is going through its quality check.',
  },
};

/**
 * The receipt, sent once when an order is placed.
 *
 * Reads the order back rather than taking it as an argument so the mail can
 * never quote a total the database does not hold.
 */
export async function sendOrderConfirmation(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, firstName: true } },
        shippingAddress: true,
        items: { include: { product: { select: { name: true } } } },
      },
    });
    if (!order) return;

    const to = recipientFor(order);
    if (!to) return;

    const lines = order.items.map(
      (item) =>
        `  ${item.product?.name ?? 'Item'} × ${item.quantity} — ${rupees(item.price * item.quantity)}`
    );

    const address = order.shippingAddress;
    const text = [
      `Hi ${order.user?.firstName || address?.fullName || 'there'},`,
      '',
      `Thanks for your order. We have it, and this is what it contains.`,
      '',
      `Order number: ${order.orderNumber}`,
      '',
      ...lines,
      '',
      `Subtotal: ${rupees(order.subtotal)}`,
      ...(order.discount > 0
        ? [`Discount${order.discountCode ? ` (${order.discountCode})` : ''}: -${rupees(order.discount)}`]
        : []),
      `Shipping: ${order.shippingCost === 0 ? 'Free' : rupees(order.shippingCost)}`,
      `Total: ${rupees(order.total)}`,
      '',
      ...(address
        ? [
            'Delivering to:',
            `  ${address.fullName}`,
            `  ${address.addressLine1}${address.addressLine2 ? `, ${address.addressLine2}` : ''}`,
            `  ${address.city}, ${address.state} ${address.postalCode}`,
            '',
          ]
        : []),
      `Track it any time: ${storefront()}/track-order?order=${encodeURIComponent(order.orderNumber)}`,
      `Your invoice: ${storefront()}/invoice/${order.id}`,
      '',
      'Creative Impression',
    ].join('\n');

    await sendMail({
      to,
      subject: `Order ${order.orderNumber} confirmed`,
      text,
    });
  } catch (error) {
    console.error('[notifications] order confirmation failed:', (error as Error).message);
  }
}

/** A short note when an order moves to a status the customer cares about. */
export async function sendOrderStatusUpdate(orderId: string, status: OrderStatus): Promise<void> {
  const copy = STATUS_MAIL[status];
  if (!copy) return;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, firstName: true } },
        shippingAddress: { select: { email: true, fullName: true } },
      },
    });
    if (!order) return;

    const to = recipientFor(order);
    if (!to) return;

    const text = [
      `Hi ${order.user?.firstName || order.shippingAddress?.fullName || 'there'},`,
      '',
      copy.line,
      '',
      `Order number: ${order.orderNumber}`,
      ...(order.trackingNumber
        ? [`Tracking: ${order.carrier ? `${order.carrier} ` : ''}${order.trackingNumber}`]
        : []),
      '',
      `Track it: ${storefront()}/track-order?order=${encodeURIComponent(order.orderNumber)}`,
      '',
      'Creative Impression',
    ].join('\n');

    await sendMail({ to, subject: `${copy.subject} — ${order.orderNumber}`, text });
  } catch (error) {
    console.error('[notifications] status update failed:', (error as Error).message);
  }
}

/**
 * Tell everyone waiting that something is back.
 *
 * `notifiedAt` is stamped for the whole batch after sending, which is what
 * stops a second stock edit an hour later mailing the same people again.
 * Requests are only claimed when there is genuinely stock to claim them for, so
 * a save that leaves the quantity at zero sends nothing.
 */
export async function notifyRestocked(productId: string, variantId?: string | null): Promise<number> {
  try {
    const waiting = await prisma.stockNotification.findMany({
      where: {
        productId,
        notifiedAt: null,
        // A size-specific request is only answered by that size coming back.
        // A product-level request is answered by any restock of the product.
        ...(variantId ? { OR: [{ variantId }, { variantId: null }] } : { variantId: null }),
      },
      include: {
        product: { select: { name: true, slug: true, id: true } },
        variant: { select: { name: true } },
      },
    });
    if (waiting.length === 0) return 0;

    const messages: MailMessage[] = waiting.map((request) => {
      const size = request.variant?.name;
      const url = `${storefront()}/products/${request.product.slug || request.product.id}`;
      return {
        to: request.email,
        subject: `Back in stock: ${request.product.name}`,
        text: [
          `${request.product.name}${size ? ` in ${size}` : ''} is available again.`,
          '',
          'You asked us to tell you when it came back, so here we are. Stock on a',
          'restock does not usually last, and we cannot hold it for you.',
          '',
          url,
          '',
          'Creative Impression',
          '',
          'You received this because you asked to be told about this one item.',
          'It is not a subscription and there is nothing to unsubscribe from.',
        ].join('\n'),
      };
    });

    await sendMailBatch(messages);

    await prisma.stockNotification.updateMany({
      where: { id: { in: waiting.map((request) => request.id) } },
      data: { notifiedAt: new Date() },
    });

    return waiting.length;
  } catch (error) {
    console.error('[notifications] restock alert failed:', (error as Error).message);
    return 0;
  }
}

// ============================================
// AUTHENTICATION MAIL
// ============================================

/**
 * Where this API answers, for links that must reach the backend rather than
 * the storefront. Defaults to the development port so a fresh checkout sends
 * working links with no configuration at all.
 */
const apiBase = (): string =>
  (process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');

/**
 * Put a link where a developer can find it when it could not be posted.
 *
 * The alternative — returning the link in the API response when NODE_ENV is
 * not production — was considered and rejected. NODE_ENV is not a security
 * boundary: it is routinely unset (this very server treats an unset value as
 * development when it prints its banner), so one missing variable on a
 * deployed box would turn `forgot-password` into "hand me a reset link for any
 * address you name", which is every account on the site, from an
 * unauthenticated endpoint. The blast radius of getting that one condition
 * wrong is total.
 *
 * This keys off something narrower and truer instead: whether the message
 * actually went anywhere. `via: 'log'` means SMTP is unconfigured and the
 * recipient could not possibly have received it, so printing the link helps
 * the only person who can see the log and costs nothing. Configure SMTP and
 * these lines stop appearing on their own, with no environment flag to get
 * wrong.
 *
 * It also keeps the response shape identical for a known and an unknown
 * address, so the guard against enumerating registered emails is exercised the
 * same way in development as in production.
 */
const traceUndeliverableLink = (result: MailResult, label: string, url: string): void => {
  if (result.via !== 'log') return;
  console.info(`[auth:link] ${label} — ${url}`);
};

/**
 * The reset link.
 *
 * Points at the storefront, not this API: redeeming a reset has to be a POST
 * from a form the person has typed a new password into. A link that reset
 * something on GET would fire from every mail scanner and link preview that
 * touches the message.
 */
export async function sendPasswordResetLink(params: {
  to: string;
  firstName?: string | null;
  token: string;
  expiresInMinutes: number;
}): Promise<void> {
  try {
    const url = `${storefront()}/auth/reset-password?token=${encodeURIComponent(params.token)}`;
    const text = [
      `Hi ${params.firstName || 'there'},`,
      '',
      'Someone asked to reset the password on the Creative Impression account',
      'registered to this address. If that was you, follow this link and choose',
      'a new one:',
      '',
      url,
      '',
      `The link works once and stops working in ${params.expiresInMinutes} minutes.`,
      '',
      'If it was not you, you do not need to do anything. Your password has not',
      'changed and nobody can change it without this link.',
      '',
      'Creative Impression',
    ].join('\n');

    const result = await sendMail({ to: params.to, subject: 'Reset your password', text });
    traceUndeliverableLink(result, `password reset for ${params.to}`, url);
  } catch (error) {
    console.error('[notifications] password reset mail failed:', (error as Error).message);
  }
}

/**
 * The verification link.
 *
 * Points at this API rather than the storefront, and is answered on GET. That
 * is the opposite of the reset link above, on purpose: there is no storefront
 * page for this yet, and confirming an address is not a state change worth
 * protecting from a mail scanner — the worst a prefetching client can do is
 * mark an address verified that its own owner was about to mark anyway. A
 * reset is an account takeover, so it stays behind a form.
 */
export async function sendEmailVerificationLink(params: {
  to: string;
  firstName?: string | null;
  token: string;
  expiresInDays: number;
}): Promise<void> {
  try {
    const url = `${apiBase()}/api/auth/verify-email?token=${encodeURIComponent(params.token)}`;
    const text = [
      `Hi ${params.firstName || 'there'},`,
      '',
      'Welcome to Creative Impression. Confirm this is your address so we can',
      'send you order updates and let you recover the account if you ever lose',
      'the password:',
      '',
      url,
      '',
      `The link works once and stops working in ${params.expiresInDays} days.`,
      '',
      'You can shop and place orders in the meantime — this only confirms where',
      'we should write to you.',
      '',
      'Creative Impression',
    ].join('\n');

    const result = await sendMail({ to: params.to, subject: 'Confirm your email address', text });
    traceUndeliverableLink(result, `email verification for ${params.to}`, url);
  } catch (error) {
    console.error('[notifications] verification mail failed:', (error as Error).message);
  }
}

/**
 * Told after the fact, never asked beforehand.
 *
 * If a reset was not the account holder's doing, this is how they find out
 * while it is still worth acting on. It carries no link — a mail about a
 * suspicious password change that asks you to click something is exactly the
 * shape of the attack it is warning about.
 */
export async function sendPasswordChangedNotice(params: {
  to: string;
  firstName?: string | null;
  changedAt: Date;
}): Promise<void> {
  try {
    const text = [
      `Hi ${params.firstName || 'there'},`,
      '',
      'The password on your Creative Impression account was changed on',
      `${params.changedAt.toUTCString()}.`,
      '',
      'If that was you, there is nothing to do — this is only a record.',
      '',
      'If it was not, contact us straight away and do not use any link in this',
      'message to do it. Go to the site the way you normally would and use the',
      'contact page there.',
      '',
      'Creative Impression',
    ].join('\n');

    await sendMail({ to: params.to, subject: 'Your password was changed', text });
  } catch (error) {
    console.error('[notifications] password change notice failed:', (error as Error).message);
  }
}
