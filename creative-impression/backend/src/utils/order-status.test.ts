import type { OrderStatus, Prisma } from '@prisma/client';
import {
  applyOrderStatus,
  applySellerOrderStatus,
  cancelOrder,
  cascadeToSellerOrders,
  checkAdminTransition,
  completeReturn,
  parentStatusAfterSellerUpdate,
  paymentStatusAfter,
  rollUpParentStatus,
  sellerStampsFor,
  stageRank,
} from '@/utils/order-status';

/**
 * An order and its sub-orders are one state machine pretending to be two, and
 * every case pinned here is one where letting them drift costs real money: a
 * seller paid for a cancelled order, a seller never paid for a delivered one, a
 * customer told three parcels have shipped when one has.
 *
 * The cascade functions are exercised against an in-memory stand-in for the
 * transaction client rather than a database, because what is being tested is
 * the sequence of writes — restock, cascade, coupon, status — and that sequence
 * is the thing that was wrong, not the SQL.
 */

const NOW = new Date('2026-09-20T12:00:00.000Z');

describe('stageRank', () => {
  it('orders the fulfilment path', () => {
    expect(stageRank('PENDING')).toBeLessThan(stageRank('SHIPPED'));
    expect(stageRank('SHIPPED')).toBeLessThan(stageRank('DELIVERED'));
  });

  it('puts the void statuses off the path rather than at the start', () => {
    // -1 is deliberate: a cancelled order is not "earlier than pending", it is
    // not on the scale at all, and callers must ask isVoidStatus first.
    expect(stageRank('CANCELLED')).toBe(-1);
    expect(stageRank('RETURNED')).toBe(-1);
  });
});

describe('rollUpParentStatus', () => {
  it('says nothing about an order with no sub-orders', () => {
    expect(rollUpParentStatus([])).toBeNull();
  });

  it('follows a single shop exactly', () => {
    expect(rollUpParentStatus(['SHIPPED'])).toBe('SHIPPED');
  });

  it('is NOT shipped when only one of three shops has shipped', () => {
    // The headline case. One parcel in transit is not a shipped order.
    expect(rollUpParentStatus(['SHIPPED', 'PROCESSING', 'PROCESSING'])).toBe('PROCESSING');
  });

  it('is not delivered until the last parcel lands', () => {
    expect(rollUpParentStatus(['DELIVERED', 'DELIVERED', 'SHIPPED'])).toBe('SHIPPED');
    expect(rollUpParentStatus(['DELIVERED', 'DELIVERED', 'DELIVERED'])).toBe('DELIVERED');
  });

  it('lets the slowest shop set the pace regardless of order', () => {
    expect(rollUpParentStatus(['DELIVERED', 'PENDING', 'SHIPPED'])).toBe('PENDING');
  });

  it('does not let a cancelled half hold the rest of the order back', () => {
    expect(rollUpParentStatus(['CANCELLED', 'DELIVERED'])).toBe('DELIVERED');
    expect(rollUpParentStatus(['CANCELLED', 'SHIPPED', 'DELIVERED'])).toBe('SHIPPED');
  });

  it('cancels the order only when every shop cancelled', () => {
    expect(rollUpParentStatus(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
  });

  it('prefers RETURNED when the order ended in a mix of both', () => {
    // A return carries a refund; a cancellation does not. The order should read
    // as the one with money attached to it.
    expect(rollUpParentStatus(['CANCELLED', 'RETURNED'])).toBe('RETURNED');
  });
});

describe('parentStatusAfterSellerUpdate', () => {
  it('leaves the parent alone while shops are still behind', () => {
    expect(parentStatusAfterSellerUpdate('PROCESSING', ['SHIPPED', 'PROCESSING'])).toBeNull();
  });

  it('rolls the parent forward once every shop has caught up', () => {
    expect(parentStatusAfterSellerUpdate('PROCESSING', ['SHIPPED', 'SHIPPED'])).toBe('SHIPPED');
  });

  it('never rolls the parent backwards', () => {
    // A sub-order corrected downwards must not un-ship the customer's order.
    expect(parentStatusAfterSellerUpdate('SHIPPED', ['SHIPPED', 'PROCESSING'])).toBeNull();
  });

  it('does not reopen a cancelled or returned order', () => {
    expect(parentStatusAfterSellerUpdate('CANCELLED', ['DELIVERED'])).toBeNull();
    expect(parentStatusAfterSellerUpdate('RETURNED', ['DELIVERED'])).toBeNull();
  });

  it('closes the parent when every shop has cancelled', () => {
    expect(parentStatusAfterSellerUpdate('PENDING', ['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
  });

  it('says nothing when there is nothing to change', () => {
    expect(parentStatusAfterSellerUpdate('SHIPPED', ['SHIPPED'])).toBeNull();
    expect(parentStatusAfterSellerUpdate('PENDING', [])).toBeNull();
  });
});

describe('cascadeToSellerOrders', () => {
  const sub = (id: string, status: OrderStatus, extra: Partial<{ shippedAt: Date; deliveredAt: Date }> = {}) => ({
    id,
    status,
    shippedAt: extra.shippedAt ?? null,
    deliveredAt: extra.deliveredAt ?? null,
  });

  it('stamps a delivery date on every shop, which is what makes them payable', () => {
    const changes = cascadeToSellerOrders('DELIVERED', [sub('a', 'SHIPPED'), sub('b', 'SHIPPED')], NOW);
    expect(changes).toHaveLength(2);
    for (const change of changes) {
      expect(change.status).toBe('DELIVERED');
      expect(change.deliveredAt).toEqual(NOW);
      // Skipping straight to delivered still records that it shipped.
      expect(change.shippedAt).toEqual(NOW);
    }
  });

  it('does not restamp a delivery date already recorded', () => {
    const earlier = new Date('2026-09-01T00:00:00.000Z');
    const changes = cascadeToSellerOrders(
      'DELIVERED',
      [sub('a', 'SHIPPED', { shippedAt: earlier })],
      NOW
    );
    // Restamping would push the seller's return window back a fortnight.
    expect(changes[0].shippedAt).toBeUndefined();
    expect(changes[0].deliveredAt).toEqual(NOW);
  });

  it('does not drag a shop back down', () => {
    const changes = cascadeToSellerOrders(
      'SHIPPED',
      [sub('a', 'DELIVERED', { deliveredAt: NOW }), sub('b', 'PROCESSING')],
      NOW
    );
    expect(changes.map((change) => change.id)).toEqual(['b']);
  });

  it('cancels every shop that is still live', () => {
    const changes = cascadeToSellerOrders(
      'CANCELLED',
      [sub('a', 'PENDING'), sub('b', 'PROCESSING')],
      NOW
    );
    expect(changes.map((change) => change.status)).toEqual(['CANCELLED', 'CANCELLED']);
  });

  it('leaves an already cancelled or returned shop alone', () => {
    const changes = cascadeToSellerOrders(
      'DELIVERED',
      [sub('a', 'CANCELLED'), sub('b', 'RETURNED'), sub('c', 'SHIPPED')],
      NOW
    );
    expect(changes.map((change) => change.id)).toEqual(['c']);
  });
});

describe('sellerStampsFor', () => {
  const clean = { shippedAt: null, deliveredAt: null };

  it('stamps a shipment', () => {
    expect(sellerStampsFor('SHIPPED', clean, NOW)).toEqual({ shippedAt: NOW });
  });

  it('stamps both when a shop jumps straight to delivered', () => {
    expect(sellerStampsFor('DELIVERED', clean, NOW)).toEqual({ shippedAt: NOW, deliveredAt: NOW });
  });

  it('stamps nothing before dispatch', () => {
    expect(sellerStampsFor('PROCESSING', clean, NOW)).toEqual({});
  });
});

describe('paymentStatusAfter', () => {
  it('marks a delivered COD order paid — the cash changed hands at the door', () => {
    expect(
      paymentStatusAfter('DELIVERED', { paymentMethod: 'COD', paymentStatus: 'PENDING' })
    ).toBe('PAID');
  });

  it('does not invent a payment for a prepaid order that never cleared', () => {
    expect(
      paymentStatusAfter('DELIVERED', { paymentMethod: 'RAZORPAY', paymentStatus: 'PENDING' })
    ).toBeNull();
  });

  it('leaves an already paid order alone on delivery', () => {
    expect(paymentStatusAfter('DELIVERED', { paymentMethod: 'COD', paymentStatus: 'PAID' })).toBeNull();
  });

  it('cancels an uncollected payment and refunds a collected one', () => {
    expect(paymentStatusAfter('CANCELLED', { paymentMethod: 'COD', paymentStatus: 'PENDING' })).toBe(
      'CANCELLED'
    );
    expect(paymentStatusAfter('CANCELLED', { paymentMethod: 'COD', paymentStatus: 'PAID' })).toBe(
      'REFUNDED'
    );
  });

  it('refunds a return that was paid for', () => {
    expect(paymentStatusAfter('RETURNED', { paymentMethod: 'COD', paymentStatus: 'PAID' })).toBe(
      'REFUNDED'
    );
  });
});

describe('checkAdminTransition', () => {
  it('allows a forward move', () => {
    expect(checkAdminTransition('PENDING', 'SHIPPED').ok).toBe(true);
  });

  it('allows cancelling anything still open', () => {
    expect(checkAdminTransition('PROCESSING', 'CANCELLED').ok).toBe(true);
  });

  it('refuses to move a closed order', () => {
    expect(checkAdminTransition('DELIVERED', 'SHIPPED').ok).toBe(false);
    expect(checkAdminTransition('CANCELLED', 'PENDING').ok).toBe(false);
  });

  it('refuses a backwards move, which the sub-orders could not follow', () => {
    expect(checkAdminTransition('SHIPPED', 'PROCESSING').ok).toBe(false);
  });

  it('allows a delivered order to be returned — the one way out of a closed status', () => {
    expect(checkAdminTransition('DELIVERED', 'RETURNED').ok).toBe(true);
  });

  it('refuses a return of goods that never arrived', () => {
    const result = checkAdminTransition('PROCESSING', 'RETURNED');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe('Only a delivered order can be returned');
  });

  it('will not return the same order twice', () => {
    expect(checkAdminTransition('RETURNED', 'RETURNED').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The cascades, against a stand-in transaction client.
// ---------------------------------------------------------------------------

interface FakeOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  paymentMethod: string | null;
  discountCode: string | null;
  total: number;
  actualDelivery?: Date | null;
}

interface FakeSellerOrder {
  id: string;
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  settledAt: Date | null;
  vendorId?: string | null;
  payoutAmount?: number;
}

/** Apply a Prisma-shaped `data` object, honouring increment/decrement. */
const applyData = (row: Record<string, unknown>, data: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      const op = value as { increment?: number; decrement?: number };
      if (typeof op.increment === 'number') {
        row[key] = ((row[key] as number) ?? 0) + op.increment;
        continue;
      }
      if (typeof op.decrement === 'number') {
        row[key] = ((row[key] as number) ?? 0) - op.decrement;
        continue;
      }
    }
    row[key] = value;
  }
};

const makeDb = () => {
  const db = {
    orders: [] as FakeOrder[],
    sellerOrders: [] as FakeSellerOrder[],
    items: [] as { orderId: string; productId: string; variantId: string | null; quantity: number }[],
    products: [] as { id: string; quantity: number }[],
    variants: [] as { id: string; quantity: number }[],
    coupons: [] as { code: string; usageCount: number }[],
    timeline: [] as { orderId: string; status: string; message: string | null }[],
    inventory: [] as { productId: string; quantity: number; type: string; reference: string }[],
    ledger: [] as { vendorId: string; sellerOrderId: string | null; type: string; amount: number }[],
  };

  const findOrder = (id: string) => {
    const order = db.orders.find((row) => row.id === id);
    if (!order) throw new Error(`No order ${id}`);
    return {
      ...order,
      items: db.items.filter((item) => item.orderId === id),
      sellerOrders: db.sellerOrders.filter((sub) => sub.orderId === id),
    };
  };

  const tx = {
    $executeRaw: async () => 0,
    sellerLedgerEntry: {
      findFirst: async ({ where }: { where: { sellerOrderId: string; type: string } }) =>
        db.ledger.find(
          (row) => row.sellerOrderId === where.sellerOrderId && row.type === where.type
        ) ?? null,
      create: async ({ data }: { data: (typeof db.ledger)[number] }) => {
        db.ledger.push(data);
        return data;
      },
    },
    order: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => findOrder(where.id),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const order = db.orders.find((row) => row.id === where.id)!;
        applyData(order as unknown as Record<string, unknown>, data);
        return order;
      },
    },
    sellerOrder: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const sub = db.sellerOrders.find((row) => row.id === where.id);
        if (!sub) throw new Error(`No seller order ${where.id}`);
        return sub;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const sub = db.sellerOrders.find((row) => row.id === where.id)!;
        applyData(sub as unknown as Record<string, unknown>, data);
        return sub;
      },
    },
    product: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const product = db.products.find((row) => row.id === where.id)!;
        applyData(product as unknown as Record<string, unknown>, data);
        return product;
      },
    },
    productVariant: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const variant = db.variants.find((row) => row.id === where.id)!;
        applyData(variant as unknown as Record<string, unknown>, data);
        return variant;
      },
    },
    coupon: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { code: string; usageCount: { gt: number } };
        data: Record<string, unknown>;
      }) => {
        const matches = db.coupons.filter(
          (row) => row.code === where.code && row.usageCount > where.usageCount.gt
        );
        for (const match of matches) applyData(match as unknown as Record<string, unknown>, data);
        return { count: matches.length };
      },
    },
    orderTimeline: {
      create: async ({ data }: { data: { orderId: string; status: string; message: string | null } }) => {
        db.timeline.push(data);
        return data;
      },
    },
    inventoryTracking: {
      createMany: async ({ data }: { data: (typeof db.inventory)[number][] }) => {
        db.inventory.push(...data);
        return { count: data.length };
      },
    },
  };

  return { db, tx: tx as unknown as Prisma.TransactionClient };
};

/** A two-shop order: one product each, one coupon spent, nothing settled. */
const seedTwoShopOrder = (overrides: Partial<FakeOrder> = {}) => {
  const fake = makeDb();
  fake.db.orders.push({
    id: 'order-1',
    orderNumber: 'CI-1',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'COD',
    discountCode: 'SAVE10',
    total: 1000,
    ...overrides,
  });
  fake.db.items.push(
    { orderId: 'order-1', productId: 'p1', variantId: 'v1', quantity: 2 },
    { orderId: 'order-1', productId: 'p2', variantId: null, quantity: 1 }
  );
  fake.db.products.push({ id: 'p1', quantity: 5 }, { id: 'p2', quantity: 5 });
  fake.db.variants.push({ id: 'v1', quantity: 3 });
  fake.db.coupons.push({ code: 'SAVE10', usageCount: 4 });
  fake.db.sellerOrders.push(
    {
      id: 'sub-a',
      orderId: 'order-1',
      orderNumber: 'CI-1-A',
      status: 'PENDING',
      shippedAt: null,
      deliveredAt: null,
      settledAt: null,
    },
    {
      id: 'sub-b',
      orderId: 'order-1',
      orderNumber: 'CI-1-B',
      status: 'PENDING',
      shippedAt: null,
      deliveredAt: null,
      settledAt: null,
    }
  );
  return fake;
};

describe('cancelOrder', () => {
  it('cancels both shops, so neither can be walked to delivered and paid', async () => {
    const { db, tx } = seedTwoShopOrder();

    const result = await cancelOrder(tx, { orderId: 'order-1', actorId: 'user-1' });

    expect(result.sellerOrdersChanged).toBe(2);
    expect(db.sellerOrders.map((sub) => sub.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(db.orders[0].status).toBe('CANCELLED');
  });

  it('puts the stock back, product and variant alike', async () => {
    const { db, tx } = seedTwoShopOrder();

    await cancelOrder(tx, { orderId: 'order-1', actorId: 'user-1' });

    expect(db.products.find((p) => p.id === 'p1')!.quantity).toBe(7);
    expect(db.products.find((p) => p.id === 'p2')!.quantity).toBe(6);
    expect(db.variants[0].quantity).toBe(5);
    expect(db.inventory).toHaveLength(2);
    expect(db.inventory[0]).toMatchObject({ type: 'return', reference: 'CI-1' });
  });

  it('hands the coupon use back that placement took', async () => {
    const { db, tx } = seedTwoShopOrder();

    await cancelOrder(tx, { orderId: 'order-1', actorId: 'user-1' });

    expect(db.coupons[0].usageCount).toBe(3);
  });

  it('never drives a coupon count below zero', async () => {
    const { db, tx } = seedTwoShopOrder();
    db.coupons[0].usageCount = 0;

    await cancelOrder(tx, { orderId: 'order-1', actorId: 'user-1' });

    expect(db.coupons[0].usageCount).toBe(0);
  });

  it('cancels an uncollected payment and records why on the timeline', async () => {
    const { db, tx } = seedTwoShopOrder();

    await cancelOrder(tx, { orderId: 'order-1', actorId: 'user-1', message: 'Cancelled by customer' });

    expect(db.orders[0].paymentStatus).toBe('CANCELLED');
    expect(db.timeline).toEqual([
      { orderId: 'order-1', status: 'CANCELLED', message: 'Cancelled by customer', createdBy: 'user-1' },
    ]);
  });

  it('leaves a shop that already cancelled itself as it was', async () => {
    const { db, tx } = seedTwoShopOrder();
    db.sellerOrders[0].status = 'CANCELLED';

    const result = await cancelOrder(tx, { orderId: 'order-1', actorId: 'user-1' });

    expect(result.sellerOrdersChanged).toBe(1);
  });
});

describe('applyOrderStatus', () => {
  it('stamps every shop on an admin-marked delivery, which is what makes them payable', async () => {
    const { db, tx } = seedTwoShopOrder({ status: 'SHIPPED' });

    await applyOrderStatus(tx, {
      orderId: 'order-1',
      next: 'DELIVERED',
      actorId: 'admin-1',
      now: NOW,
    });

    for (const sub of db.sellerOrders) {
      expect(sub.status).toBe('DELIVERED');
      expect(sub.deliveredAt).toEqual(NOW);
    }
    expect(db.orders[0].actualDelivery).toEqual(NOW);
  });

  it('collects the cash on a COD delivery, so revenue is no longer always zero', async () => {
    const { db, tx } = seedTwoShopOrder({ status: 'SHIPPED' });

    const result = await applyOrderStatus(tx, { orderId: 'order-1', next: 'DELIVERED', now: NOW });

    expect(result.paymentStatus).toBe('PAID');
    expect(db.orders[0].paymentStatus).toBe('PAID');
  });

  it('leaves a prepaid order to its gateway', async () => {
    const { db, tx } = seedTwoShopOrder({ status: 'SHIPPED', paymentMethod: 'RAZORPAY' });

    await applyOrderStatus(tx, { orderId: 'order-1', next: 'DELIVERED', now: NOW });

    expect(db.orders[0].paymentStatus).toBe('PENDING');
  });
});

describe('applySellerOrderStatus', () => {
  it('does not tell the customer their order shipped when one shop still has it', async () => {
    const { db, tx } = seedTwoShopOrder({ status: 'PROCESSING' });
    db.sellerOrders[0].status = 'READY_FOR_SHIPMENT';
    db.sellerOrders[1].status = 'PROCESSING';

    const result = await applySellerOrderStatus(tx, {
      sellerOrderId: 'sub-a',
      next: 'SHIPPED',
      now: NOW,
    });

    expect(result.parentStatus).toBeNull();
    expect(db.orders[0].status).toBe('PROCESSING');
    expect(db.sellerOrders[0].shippedAt).toEqual(NOW);
    expect(db.timeline).toHaveLength(0);
  });

  it('rolls the parent forward when the last shop catches up', async () => {
    const { db, tx } = seedTwoShopOrder({ status: 'PROCESSING' });
    db.sellerOrders[0].status = 'SHIPPED';
    db.sellerOrders[1].status = 'READY_FOR_SHIPMENT';

    const result = await applySellerOrderStatus(tx, {
      sellerOrderId: 'sub-b',
      next: 'SHIPPED',
      now: NOW,
    });

    expect(result.parentStatus).toBe('SHIPPED');
    expect(db.orders[0].status).toBe('SHIPPED');
    expect(db.timeline[0].message).toMatch(/every shop/);
  });

  it('makes the order returnable once every shop has delivered, and takes the COD', async () => {
    const { db, tx } = seedTwoShopOrder({ status: 'SHIPPED' });
    db.sellerOrders[0].status = 'DELIVERED';
    db.sellerOrders[1].status = 'SHIPPED';

    const result = await applySellerOrderStatus(tx, {
      sellerOrderId: 'sub-b',
      next: 'DELIVERED',
      now: NOW,
    });

    // Before the rollup existed the parent stayed PENDING and the customer
    // could never open a return, which requires a DELIVERED order.
    expect(result.parentStatus).toBe('DELIVERED');
    expect(db.orders[0].status).toBe('DELIVERED');
    expect(db.orders[0].paymentStatus).toBe('PAID');
  });

  it('writes tracking in the same breath as the status', async () => {
    const { db, tx } = seedTwoShopOrder({ status: 'PROCESSING' });
    db.sellerOrders[0].status = 'READY_FOR_SHIPMENT';

    await applySellerOrderStatus(tx, {
      sellerOrderId: 'sub-a',
      next: 'SHIPPED',
      extra: { trackingNumber: 'TRK-1' },
      now: NOW,
    });

    expect(db.sellerOrders[0]).toMatchObject({ status: 'SHIPPED', trackingNumber: 'TRK-1' });
  });
});

describe('completeReturn', () => {
  const seedDelivered = () => {
    const fake = seedTwoShopOrder({ status: 'DELIVERED', paymentStatus: 'PAID' });
    for (const sub of fake.db.sellerOrders) {
      sub.status = 'DELIVERED';
      sub.deliveredAt = NOW;
    }
    return fake;
  };

  it('takes the sale off both sides, so settlement stops counting it', async () => {
    const { db, tx } = seedDelivered();

    await completeReturn(tx, { orderId: 'order-1', actorId: 'admin-1', now: NOW });

    expect(db.orders[0].status).toBe('RETURNED');
    // RETURNED is exactly what UNPAYABLE_STATUSES in utils/settlement looks for.
    expect(db.sellerOrders.map((sub) => sub.status)).toEqual(['RETURNED', 'RETURNED']);
  });

  it('restocks the returned goods and refunds the payment', async () => {
    const { db, tx } = seedDelivered();

    const result = await completeReturn(tx, { orderId: 'order-1', now: NOW });

    expect(db.products.find((p) => p.id === 'p1')!.quantity).toBe(7);
    expect(db.orders[0].paymentStatus).toBe('REFUNDED');
    expect(result.refundAmount).toBe(1000);
  });

  it('records a partial refund when one is given', async () => {
    const { tx } = seedDelivered();

    const result = await completeReturn(tx, { orderId: 'order-1', refundAmount: 249.567, now: NOW });

    expect(result.refundAmount).toBe(249.57);
  });

  it('names the sub-orders already settled, whose money cannot be un-sent', async () => {
    const { db, tx } = seedDelivered();
    db.sellerOrders[0].settledAt = NOW;

    const result = await completeReturn(tx, { orderId: 'order-1', now: NOW });

    expect(result.alreadySettled).toEqual(['CI-1-A']);
  });

  it('posts a ledger reversal for a settled sub-order, so the next payout nets it', async () => {
    const { db, tx } = seedDelivered();
    Object.assign(db.sellerOrders[0], { settledAt: NOW, vendorId: 'shop-a', payoutAmount: 540 });
    Object.assign(db.sellerOrders[1], { vendorId: 'shop-b', payoutAmount: 300 });

    const result = await completeReturn(tx, { orderId: 'order-1', now: NOW });

    expect(result.reversed).toEqual([{ orderNumber: 'CI-1-A', amount: 540 }]);
    expect(db.ledger).toEqual([
      expect.objectContaining({ vendorId: 'shop-a', type: 'RETURN_REVERSAL', amount: -540 }),
    ]);
  });

  it('does not report an unsettled order as needing recovery', async () => {
    const { tx } = seedDelivered();

    const result = await completeReturn(tx, { orderId: 'order-1', now: NOW });

    expect(result.alreadySettled).toEqual([]);
  });
});
