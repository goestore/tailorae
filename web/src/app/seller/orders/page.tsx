'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button, LoadingSpinner } from '@/components/common';
import { useSeller } from '@/components/seller/SellerContext';
import { formatPaise } from '@/lib/money';
import { NEXT_STEP, getSellerOrders, updateSellerOrder, type SellerOrder } from '@/lib/seller-api';
import type { OrderStatus } from '@/types';
import { Select } from '../_components/fields';
import { Empty, NoShopYet, NotForRole, PageHeader, formatDate, prettyStatus } from '../_components/ui';

/**
 * The shop's orders (`GET /seller/orders`, a page at a time).
 *
 * One card per seller order — this shop's part of a customer order, which may
 * have had other shops in it. The address is what the label needs; the API
 * never gives a seller the customer's email or phone. The next-step button
 * offers the transition a seller normally takes; marking an order shipped asks
 * for the tracking number, which the API requires.
 */

const STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
];

const CANCELLABLE: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT'];

export default function SellerOrdersPage() {
  const { me, can } = useSeller();
  const shop = me?.shop ?? null;
  const allowed = Boolean(shop) && can('ORDERS');

  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getSellerOrders({ status, page })
        .then((result) => {
          setOrders(result.items);
          setPages(result.pages);
          setTotal(result.total);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    [status, page]
  );

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!shop) return <NoShopYet />;
  if (!can('ORDERS')) return <NotForRole what="orders" />;
  if (isLoading) return <LoadingSpinner className="min-h-[50vh]" size="lg" />;

  return (
    <main className="section-y">
      <div className="container-max">
        <PageHeader
          title="Orders"
          lead="Your part of each order. A customer may have bought from other shops in the same basket; you fulfil and are paid for yours."
          actions={
            <Link href="/seller" className="btn btn-outline btn-sm">
              Back to overview
            </Link>
          }
        />

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="w-[220px]">
            <Select
              id="order-status"
              label="Show"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatus | '');
                setPage(1);
              }}
            >
              <option value="">All orders</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {prettyStatus(s)}
                </option>
              ))}
            </Select>
          </div>
          <p className="m-0 text-meta" style={{ color: 'var(--ink-3)' }}>
            {total} {total === 1 ? 'order' : 'orders'}
          </p>
        </div>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        {orders.length === 0 ? (
          <Empty title={status ? `No ${prettyStatus(status).toLowerCase()} orders` : 'No orders yet'}>
            They appear here the moment someone buys one of your products.
          </Empty>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onChanged={(next) => setOrders((rows) => rows.map((row) => (row.id === next.id ? next : row)))}
              />
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav className="mt-8 flex items-center gap-3" aria-label="Pages">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-meta" style={{ color: 'var(--ink-3)' }}>
              Page {page} of {pages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </nav>
        )}
      </div>
    </main>
  );
}

const OrderCard: React.FC<{ order: SellerOrder; onChanged: (order: SellerOrder) => void }> = ({ order, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const [carrier, setCarrier] = useState(order.carrier ?? '');
  const next = NEXT_STEP[order.status];
  const to = order.shipTo;

  const move = async (status: OrderStatus, done: string, extra: { trackingNumber?: string; carrier?: string } = {}) => {
    setBusy(true);
    try {
      onChanged(await updateSellerOrder(order.id, { status, ...extra }));
      toast.success(done);
      setShipping(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ship = (event: React.FormEvent) => {
    event.preventDefault();
    if (!tracking.trim()) {
      toast.error('Add the tracking number from the courier.');
      return;
    }
    void move('SHIPPED', 'Marked shipped', { trackingNumber: tracking.trim(), carrier: carrier.trim() || undefined });
  };

  const cancel = () => {
    if (!window.confirm(`Cancel ${order.orderNumber}? The customer is told and refunded if they paid.`)) return;
    void move('CANCELLED', 'Order cancelled');
  };

  return (
    <article className="border border-line p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
        <div>
          <p className="m-0 font-mono text-[14px] font-semibold text-ink">{order.orderNumber}</p>
          <p className="m-0 mt-1 text-meta" style={{ color: 'var(--ink-3)' }}>
            {formatDate(order.createdAt)} · {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'}
          </p>
        </div>
        <span className="text-caption font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--ink-2)' }}>
          {prettyStatus(order.status)}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {order.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-3 text-[13.5px]">
              <span style={{ color: 'var(--ink-2)' }}>
                {item.name}
                {[item.size, item.color].filter(Boolean).length ? ` (${[item.size, item.color].filter(Boolean).join(', ')})` : ''}
                {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                <span className="ml-2 font-mono text-small" style={{ color: 'var(--ink-3)' }}>
                  {item.sku}
                </span>
              </span>
              <span className="text-ink">{formatPaise(item.unitPaise * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <address className="m-0 text-[13.5px] not-italic" style={{ color: 'var(--ink-2)' }}>
          <span className="text-caption font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--ink-3)' }}>
            Ship to
          </span>
          <br />
          {to.name && (
            <>
              <strong className="text-ink">{to.name}</strong>
              <br />
            </>
          )}
          {[to.line1, to.line2].filter(Boolean).join(', ')}
          <br />
          {[to.city, to.state].filter(Boolean).join(', ')} {to.postalCode}
        </address>
      </div>

      {order.notes && (
        <p className="m-0 mt-3 text-meta" style={{ color: 'var(--ink-2)' }}>
          <strong className="text-ink">Note:</strong> {order.notes}
        </p>
      )}

      {/* The money, stated plainly: what the buyer paid, what the platform
          took, and what this shop is owed. */}
      <dl className="m-0 mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-3 text-meta sm:grid-cols-4">
        <div>
          <dt className="m-0" style={{ color: 'var(--ink-3)' }}>
            Buyer paid
          </dt>
          <dd className="m-0 font-semibold text-ink">{formatPaise(order.totalPaise)}</dd>
        </div>
        <div>
          <dt className="m-0" style={{ color: 'var(--ink-3)' }}>
            Commission
          </dt>
          <dd className="m-0 text-ink">−{formatPaise(order.commissionPaise)}</dd>
        </div>
        <div>
          <dt className="m-0" style={{ color: 'var(--ink-3)' }}>
            Your payout
          </dt>
          <dd className="m-0 font-semibold text-ink">{formatPaise(order.payoutPaise)}</dd>
        </div>
        <div>
          <dt className="m-0" style={{ color: 'var(--ink-3)' }}>
            Settled
          </dt>
          <dd className="m-0 text-ink">{order.settledAt ? formatDate(order.settledAt) : 'Not yet'}</dd>
        </div>
      </dl>

      {order.trackingNumber && (
        <p className="m-0 mt-3 text-meta" style={{ color: 'var(--ink-3)' }}>
          Tracking: {order.carrier ? `${order.carrier} · ` : ''}
          <span className="font-mono text-ink">{order.trackingNumber}</span>
          {order.shippedAt ? ` · shipped ${formatDate(order.shippedAt)}` : ''}
        </p>
      )}

      {shipping ? (
        <form onSubmit={ship} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            placeholder="Tracking number *"
            className="h-8 w-48 text-meta"
            aria-label={`Tracking number for ${order.orderNumber}`}
            required
          />
          <input
            value={carrier}
            onChange={(event) => setCarrier(event.target.value)}
            placeholder="Courier (e.g. Delhivery)"
            className="h-8 w-48 text-meta"
            aria-label={`Courier for ${order.orderNumber}`}
          />
          <Button type="submit" size="sm" loading={busy}>
            Mark shipped
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setShipping(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {next && (
            <Button
              size="sm"
              loading={busy}
              onClick={() => (next.status === 'SHIPPED' ? setShipping(true) : void move(next.status, next.label))}
            >
              {next.label}
            </Button>
          )}
          {order.status === 'PROCESSING' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setShipping(true)}>
              Ship now
            </Button>
          )}
          {CANCELLABLE.includes(order.status) && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={cancel}>
              Cancel order
            </Button>
          )}
        </div>
      )}
    </article>
  );
};
