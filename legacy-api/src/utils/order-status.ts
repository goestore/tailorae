import type { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { postReturnReversal } from '@/utils/ledger';

/**
 * The one place an order's status moves.
 *
 * A marketplace order exists twice over: as the `Order` the customer placed,
 * and as one `SellerOrder` per shop fulfilling it. Both carry a status, and
 * they used to be moved independently — the admin endpoint wrote the parent,
 * the seller endpoint wrote the child, and neither looked at the other. Two
 * things broke because of it, both quietly and both about money:
 *
 *   1. An admin marking an order DELIVERED left every `SellerOrder.deliveredAt`
 *      null. `payableWhere()` needs a delivered sub-order with a delivery date,
 *      so the shops that fulfilled that order were never paid — and nothing
 *      surfaced the fact, because the parent order looked complete.
 *
 *   2. A seller marking their own half DELIVERED left the parent at PENDING, so
 *      the customer could not open a return: the return route requires a
 *      DELIVERED order.
 *
 * Everything below therefore treats a status change as one operation over both
 * sides. The pure half — what a change implies — is exported separately from
 * the half that writes it, so the rules can be unit tested without a database.
 *
 * The rule worth stating plainly, because it is the one a naive rollup gets
 * wrong: a parent is only as far along as its least advanced shop. An order
 * split across three sellers where one has shipped is not a shipped order, it
 * is an order with one parcel in transit. Telling the customer otherwise is how
 * "where is the rest of my order" becomes a support ticket.
 */

/** Fulfilment stages in the order they are walked, earliest first. */
export const FULFILMENT_STAGES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'DELIVERED',
] as const;

export type FulfilmentStage = (typeof FULFILMENT_STAGES)[number];

/**
 * Statuses that end the sale rather than progress it. They sit outside the
 * stage ordering entirely: a cancelled order is not "before" or "after"
 * shipped, it is off the path.
 */
export const VOID_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'RETURNED'];

/** Statuses after which nothing may be changed by an ordinary status update. */
export const CLOSED_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];

export const isVoidStatus = (status: OrderStatus): boolean => VOID_STATUSES.includes(status);
export const isClosedStatus = (status: OrderStatus): boolean => CLOSED_STATUSES.includes(status);

export const isFulfilmentStage = (status: OrderStatus): status is FulfilmentStage =>
  (FULFILMENT_STAGES as readonly string[]).includes(status);

/**
 * How far along a status is. -1 for the void statuses, which are deliberately
 * not comparable with the fulfilment path — callers must check `isVoidStatus`
 * before ranking rather than relying on a cancelled order sorting "first".
 */
export function stageRank(status: OrderStatus): number {
  return (FULFILMENT_STAGES as readonly string[]).indexOf(status);
}

/** One shop's half of an order, as the rules below need to see it. */
export interface SellerOrderState {
  id: string;
  status: OrderStatus;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

/** A change to write to one sub-order. Omitted stamps are left as they were. */
export interface SellerOrderChange {
  id: string;
  status: OrderStatus;
  shippedAt?: Date;
  deliveredAt?: Date;
}

/**
 * The parent status implied by the shops fulfilling it.
 *
 * Live sub-orders govern: a cancelled half does not hold the rest of the order
 * back, so a two-shop order where one shop cancelled and the other delivered is
 * a delivered order. Only when nothing is left alive does the parent take a
 * void status itself, and a return outranks a cancellation there because it is
 * the one that carries a refund.
 *
 * Returns null when there is nothing to say — an order with no sub-orders at
 * all, which is what a pre-split legacy order looks like.
 */
export function rollUpParentStatus(subStatuses: readonly OrderStatus[]): OrderStatus | null {
  if (subStatuses.length === 0) return null;

  const live = subStatuses.filter((status) => !isVoidStatus(status));
  if (live.length === 0) {
    return subStatuses.includes('RETURNED') ? 'RETURNED' : 'CANCELLED';
  }

  // The least advanced shop sets the pace. This is the partial-shipment rule.
  return live.reduce((lowest, status) => (stageRank(status) < stageRank(lowest) ? status : lowest));
}

/**
 * What the parent should become after one shop moved, or null to leave it.
 *
 * Forward only. A parent that has reached SHIPPED does not fall back to
 * PROCESSING because a late sub-order was added or a shop was corrected, and a
 * parent already cancelled or returned is not reopened by fulfilment activity
 * underneath it.
 */
export function parentStatusAfterSellerUpdate(
  current: OrderStatus,
  subStatuses: readonly OrderStatus[]
): OrderStatus | null {
  if (isVoidStatus(current)) return null;

  const rolled = rollUpParentStatus(subStatuses);
  if (rolled === null || rolled === current) return null;

  // Every shop cancelled or returned: the order itself is over.
  if (isVoidStatus(rolled)) return rolled;

  return stageRank(rolled) > stageRank(current) ? rolled : null;
}

/**
 * The sub-order writes an admin's change to the parent implies.
 *
 * Moving the parent to a fulfilment stage drags every shop up to at least that
 * stage — that is what makes an admin-marked delivery payable — but never drags
 * one back down: a shop that already delivered stays delivered when the parent
 * is corrected to SHIPPED. Cancelling or returning the parent applies to every
 * shop still live, and leaves the ones already cancelled or returned alone so
 * their existing record is not overwritten.
 *
 * `shippedAt` and `deliveredAt` are stamped on the way past, and only when
 * missing: settlement counts the return window from the delivery date, so
 * restamping it would quietly push a seller's payout back.
 */
export function cascadeToSellerOrders(
  next: OrderStatus,
  subs: readonly SellerOrderState[],
  now: Date = new Date()
): SellerOrderChange[] {
  const changes: SellerOrderChange[] = [];

  for (const sub of subs) {
    if (isVoidStatus(sub.status)) continue;

    if (isVoidStatus(next)) {
      changes.push({ id: sub.id, status: next });
      continue;
    }

    if (stageRank(sub.status) >= stageRank(next)) continue;

    const change: SellerOrderChange = { id: sub.id, status: next };
    if (stageRank(next) >= stageRank('SHIPPED') && !sub.shippedAt) change.shippedAt = now;
    if (next === 'DELIVERED' && !sub.deliveredAt) change.deliveredAt = now;
    changes.push(change);
  }

  return changes;
}

/** The stamps a sub-order reaching `next` under its own steam should carry. */
export function sellerStampsFor(
  next: OrderStatus,
  current: Pick<SellerOrderState, 'shippedAt' | 'deliveredAt'>,
  now: Date = new Date()
): { shippedAt?: Date; deliveredAt?: Date } {
  const stamps: { shippedAt?: Date; deliveredAt?: Date } = {};
  if (isVoidStatus(next)) return stamps;
  if (stageRank(next) >= stageRank('SHIPPED') && !current.shippedAt) stamps.shippedAt = now;
  if (next === 'DELIVERED' && !current.deliveredAt) stamps.deliveredAt = now;
  return stamps;
}

/**
 * What a status change does to the money side, or null to leave it alone.
 *
 * Nothing anywhere used to set `paymentStatus` to PAID, so every order sat at
 * PENDING forever and the dashboard's revenue — which sums PAID orders — was
 * always zero. Cash on delivery is the case that matters here: the cash is
 * handed over at the door, so delivery *is* the payment event and there is no
 * gateway callback that will ever say so.
 *
 * A prepaid order is not touched on delivery: it was already PAID when the
 * gateway said it was, and if it somehow is not, delivery does not make it so.
 */
export function paymentStatusAfter(
  next: OrderStatus,
  order: { paymentMethod: PaymentMethod | null; paymentStatus: PaymentStatus }
): PaymentStatus | null {
  if (next === 'DELIVERED') {
    return order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING' ? 'PAID' : null;
  }
  if (next === 'CANCELLED') {
    if (order.paymentStatus === 'PAID') return 'REFUNDED';
    return order.paymentStatus === 'PENDING' ? 'CANCELLED' : null;
  }
  if (next === 'RETURNED') {
    return order.paymentStatus === 'PAID' ? 'REFUNDED' : null;
  }
  return null;
}

/**
 * Whether an admin may move a parent order from `current` to `next`.
 *
 * Cancelling is allowed from anywhere still open. Otherwise the path runs
 * forwards one or more stages: an order does not go back to PROCESSING after it
 * shipped, because the sub-orders underneath it cannot be un-shipped and the
 * two sides would part company again.
 *
 * RETURNED is the one move out of a closed status, and only out of DELIVERED —
 * goods have to have arrived before they can come back. Callers must route it
 * through `completeReturn` rather than `applyOrderStatus`: it carries a refund
 * and a restock, and a status write alone would leave the money and the shelf
 * both wrong.
 */
export function checkAdminTransition(
  current: OrderStatus,
  next: OrderStatus
): { ok: true } | { ok: false; message: string } {
  if (next === 'RETURNED') {
    return current === 'DELIVERED'
      ? { ok: true }
      : { ok: false, message: 'Only a delivered order can be returned' };
  }
  if (isClosedStatus(current)) {
    return { ok: false, message: `Order status can no longer be changed (status: ${current})` };
  }
  if (next === 'CANCELLED') return { ok: true };
  if (next === current) {
    return { ok: false, message: `Order is already ${current}` };
  }
  if (stageRank(next) < stageRank(current)) {
    return { ok: false, message: `An order cannot go back from ${current} to ${next}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Applying a change. Everything below takes a transaction client rather than
// importing Prisma, so callers control the transaction boundary — a status
// change that touches stock, coupons and two tables must commit as one thing —
// and so the module stays importable by tests that have no database.
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

/** What a line of the order needs to carry to be restocked. */
interface RestockableItem {
  productId: string;
  variantId: string | null;
  quantity: number;
}

/**
 * Put stock back and record why.
 *
 * Both cancellation and a completed return land here. The inventory movement is
 * written alongside the increment rather than left implied, so a stock figure
 * that looks wrong can always be traced to the order that moved it.
 */
export async function restockOrderItems(
  tx: Tx,
  items: readonly RestockableItem[],
  reference: string
): Promise<void> {
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { quantity: { increment: item.quantity } },
    });
    if (item.variantId) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { quantity: { increment: item.quantity } },
      });
    }
  }
  if (items.length > 0) {
    await tx.inventoryTracking.createMany({
      data: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        type: 'return',
        reference,
      })),
    });
  }
}

/**
 * Hand a coupon use back.
 *
 * Order placement increments `usageCount`, so a cancelled order that never
 * decrements it burns a use of a limited code forever. A single-use launch code
 * cancelled once is then dead for everybody, which reads as the code being
 * broken. The `gt: 0` guard means a double cancellation cannot drive the count
 * negative and hand out extra uses instead.
 */
export async function releaseCouponUse(tx: Tx, code: string | null): Promise<void> {
  if (!code) return;
  await tx.coupon.updateMany({
    where: { code, usageCount: { gt: 0 } },
    data: { usageCount: { decrement: 1 } },
  });
}

/** Write one sub-order change. */
async function writeSellerChange(tx: Tx, change: SellerOrderChange): Promise<void> {
  await tx.sellerOrder.update({
    where: { id: change.id },
    data: {
      status: change.status,
      ...(change.shippedAt ? { shippedAt: change.shippedAt } : {}),
      ...(change.deliveredAt ? { deliveredAt: change.deliveredAt } : {}),
    },
  });
}

export interface StatusChangeResult {
  status: OrderStatus;
  /** Null when the change did not touch the money side. */
  paymentStatus: PaymentStatus | null;
  /** How many shops' halves were moved with it. */
  sellerOrdersChanged: number;
}

/**
 * Move a parent order, and every shop underneath it, to `next`.
 *
 * Used by the admin status endpoint. For CANCELLED prefer `cancelOrder`, which
 * also restocks and releases the coupon; this function moves statuses only.
 */
export async function applyOrderStatus(
  tx: Tx,
  params: {
    orderId: string;
    next: OrderStatus;
    actorId?: string | null;
    message?: string;
    now?: Date;
  }
): Promise<StatusChangeResult> {
  const now = params.now ?? new Date();
  const order = await tx.order.findUniqueOrThrow({
    where: { id: params.orderId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      sellerOrders: { select: { id: true, status: true, shippedAt: true, deliveredAt: true } },
    },
  });

  const changes = cascadeToSellerOrders(params.next, order.sellerOrders, now);
  for (const change of changes) await writeSellerChange(tx, change);

  const paymentStatus = paymentStatusAfter(params.next, order);

  await tx.order.update({
    where: { id: order.id },
    data: {
      status: params.next,
      ...(params.next === 'DELIVERED' ? { actualDelivery: now } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
    },
  });

  await tx.orderTimeline.create({
    data: {
      orderId: order.id,
      status: params.next,
      message: params.message ?? `Status changed to ${params.next}`,
      createdBy: params.actorId ?? null,
    },
  });

  return { status: params.next, paymentStatus, sellerOrdersChanged: changes.length };
}

/**
 * Move one shop's half forward, and roll the parent up if that was the last one.
 *
 * The rollup is the point: a seller marking their parcel delivered is what makes
 * the parent DELIVERED once — and only once — every other shop has delivered
 * too. Until then the parent stays where the slowest shop left it, so a
 * customer with three parcels in flight is not told their order arrived.
 */
export async function applySellerOrderStatus(
  tx: Tx,
  params: {
    sellerOrderId: string;
    next: OrderStatus;
    actorId?: string | null;
    /** Tracking and carrier, written in the same statement as the status. */
    extra?: Prisma.SellerOrderUncheckedUpdateInput;
    now?: Date;
  }
): Promise<{ parentStatus: OrderStatus | null; parentPaymentStatus: PaymentStatus | null }> {
  const now = params.now ?? new Date();
  const current = await tx.sellerOrder.findUniqueOrThrow({
    where: { id: params.sellerOrderId },
    select: { id: true, orderId: true, shippedAt: true, deliveredAt: true },
  });

  await tx.sellerOrder.update({
    where: { id: current.id },
    data: {
      ...(params.extra ?? {}),
      status: params.next,
      ...sellerStampsFor(params.next, current, now),
    },
  });

  const parent = await tx.order.findUniqueOrThrow({
    where: { id: current.orderId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      sellerOrders: { select: { status: true } },
    },
  });

  const rolled = parentStatusAfterSellerUpdate(
    parent.status,
    parent.sellerOrders.map((sub) => sub.status)
  );
  if (rolled === null) return { parentStatus: null, parentPaymentStatus: null };

  const paymentStatus = paymentStatusAfter(rolled, parent);

  await tx.order.update({
    where: { id: parent.id },
    data: {
      status: rolled,
      ...(rolled === 'DELIVERED' ? { actualDelivery: now } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
    },
  });
  await tx.orderTimeline.create({
    data: {
      orderId: parent.id,
      status: rolled,
      message:
        parent.sellerOrders.length > 1
          ? `Status changed to ${rolled} — every shop in this order has reached it`
          : `Status changed to ${rolled}`,
      createdBy: params.actorId ?? null,
    },
  });

  return { parentStatus: rolled, parentPaymentStatus: paymentStatus };
}

/**
 * Cancel an order: statuses, stock, coupon and payment, in one transaction.
 *
 * The cascade is not a nicety. `heldWhere()` counts any sub-order that is not
 * cancelled or returned, so sub-orders left at PENDING under a cancelled parent
 * keep appearing as a seller's pipeline money — and, worse, the seller endpoint
 * would happily walk one of them all the way to DELIVERED and make it payable.
 * A cancelled order must be cancelled on both sides or it is not cancelled.
 */
export async function cancelOrder(
  tx: Tx,
  params: { orderId: string; actorId?: string | null; message?: string; now?: Date }
): Promise<StatusChangeResult> {
  const now = params.now ?? new Date();
  const order = await tx.order.findUniqueOrThrow({
    where: { id: params.orderId },
    select: {
      id: true,
      orderNumber: true,
      discountCode: true,
      paymentMethod: true,
      paymentStatus: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
      sellerOrders: { select: { id: true, status: true, shippedAt: true, deliveredAt: true } },
    },
  });

  const changes = cascadeToSellerOrders('CANCELLED', order.sellerOrders, now);
  for (const change of changes) await writeSellerChange(tx, change);

  await restockOrderItems(tx, order.items, order.orderNumber);
  await releaseCouponUse(tx, order.discountCode);

  const paymentStatus = paymentStatusAfter('CANCELLED', order);

  await tx.order.update({
    where: { id: order.id },
    data: { status: 'CANCELLED', ...(paymentStatus ? { paymentStatus } : {}) },
  });
  await tx.orderTimeline.create({
    data: {
      orderId: order.id,
      status: 'CANCELLED',
      message: params.message ?? 'Order cancelled',
      createdBy: params.actorId ?? null,
    },
  });

  return { status: 'CANCELLED', paymentStatus, sellerOrdersChanged: changes.length };
}

export interface ReturnCompletionResult extends StatusChangeResult {
  refundAmount: number;
  /**
   * Sub-orders already settled when the return completed. Their money has left
   * the building, so marking them RETURNED does not claw it back by itself —
   * the RETURN_REVERSAL entries below do, against the next payout.
   */
  alreadySettled: string[];
  /**
   * Ledger reversals posted: every sub-order whose sale had been credited to
   * the seller (settled or not), as a negative entry that the next payout nets.
   */
  reversed: { orderNumber: string; amount: number }[];
}

/**
 * Complete a return: refund, restock, and take the sale off both sides.
 *
 * A return that only updates a status string on the request row leaves the
 * order DELIVERED, the stock missing, and — the expensive part — every
 * sub-order at DELIVERED with a `deliveredAt` ticking towards payable. The
 * shop is then paid for goods sitting back on the shelf. Moving the sub-orders
 * to RETURNED is what `UNPAYABLE_STATUSES` in utils/settlement needs to see.
 *
 * `refundAmount` defaults to the order total. It is recorded rather than moved:
 * there is no refund rail wired up, so this is the ledger entry an admin
 * reconciles the actual transfer against.
 */
export async function completeReturn(
  tx: Tx,
  params: {
    orderId: string;
    actorId?: string | null;
    refundAmount?: number;
    now?: Date;
  }
): Promise<ReturnCompletionResult> {
  const now = params.now ?? new Date();
  const order = await tx.order.findUniqueOrThrow({
    where: { id: params.orderId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      paymentMethod: true,
      paymentStatus: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
      sellerOrders: {
        select: {
          id: true,
          orderNumber: true,
          vendorId: true,
          payoutAmount: true,
          status: true,
          shippedAt: true,
          deliveredAt: true,
          settledAt: true,
        },
      },
    },
  });

  // Read before the cascade: afterwards every one of these is RETURNED, and
  // the question being asked is which of them had money sent out while the
  // sale still stood.
  const alreadySettled = order.sellerOrders
    .filter((sub) => sub.settledAt !== null && !isVoidStatus(sub.status))
    .map((sub) => sub.orderNumber);

  // Take back what the ledger already credited. postReturnReversal decides
  // whether there is anything to take back and never posts twice.
  const reversed: ReturnCompletionResult['reversed'] = [];
  for (const sub of order.sellerOrders) {
    if (isVoidStatus(sub.status)) continue;
    const entry = await postReturnReversal(tx, sub, params.actorId);
    if (entry) reversed.push({ orderNumber: sub.orderNumber, amount: -entry.amount });
  }

  const changes = cascadeToSellerOrders('RETURNED', order.sellerOrders, now);
  for (const change of changes) await writeSellerChange(tx, change);

  await restockOrderItems(tx, order.items, order.orderNumber);

  const refundAmount =
    params.refundAmount === undefined ? order.total : Math.round(params.refundAmount * 100) / 100;
  const paymentStatus = paymentStatusAfter('RETURNED', order);

  await tx.order.update({
    where: { id: order.id },
    data: { status: 'RETURNED', ...(paymentStatus ? { paymentStatus } : {}) },
  });
  await tx.orderTimeline.create({
    data: {
      orderId: order.id,
      status: 'RETURNED',
      message: `Return completed — refund of ${refundAmount} recorded`,
      createdBy: params.actorId ?? null,
    },
  });

  return {
    status: 'RETURNED',
    paymentStatus,
    sellerOrdersChanged: changes.length,
    refundAmount,
    alreadySettled,
    reversed,
  };
}
