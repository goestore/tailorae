'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, LoadingSpinner } from '@/components/common';
import {
  NEXT_STEP,
  getSellerOrders,
  updateSellerOrder,
  type SellerOrder,
} from '@/lib/seller-api';
import { formatCurrency } from '@/utils/helpers';
import { RootState } from '@/store';

const prettyStatus = (status: string): string =>
  status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A seller's own orders.
 *
 * One card per sub-order — this shop's half of a customer order, which may
 * have had other shops in it. The next-step button offers exactly the one
 * transition the API will accept rather than a menu of statuses most of which
 * would be refused.
 */
export default function SellerOrdersPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/seller/orders');
  }, [isInitialized, user, router]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      getSellerOrders()
        .then((rows) => {
          setOrders(rows);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const run = async (id: string, action: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await action();
      toast.success(done);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      // Cleared whatever happened. Left set on success it outlives the request
      // and the card's next step stays disabled until the page is reloaded —
      // so accepting an order made "start preparing" unreachable.
      setBusyId(null);
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Sell', href: '/seller' },
            { label: 'Orders' },
          ]}
        />

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1
              className="m-0 text-ink"
              style={{
                fontSize: 'clamp(26px, 3.6vw, 38px)',
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              Orders
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Your half of each order. A customer may have bought from other shops in the same
              basket; you fulfil and are paid for yours.
            </p>
          </div>
          <Link href="/seller" className="btn btn-outline btn-sm">
            Back to dashboard
          </Link>
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        {orders.length === 0 ? (
          <div className="mt-10 border border-line bg-surface-2 px-6 py-14 text-center">
            <p className="m-0 text-lg text-ink">No orders yet</p>
            <p className="mx-auto mt-2 max-w-[46ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
              They appear here the moment someone buys one of your products.
            </p>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-4">
            {orders.map((order) => {
              const next = NEXT_STEP[order.status];
              const destination = order.order.shippingAddress;

              return (
                <article key={order.id} className="border border-line p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
                    <div>
                      <p className="m-0 font-mono text-[14px] font-semibold text-ink">
                        {order.orderNumber}
                      </p>
                      <p className="m-0 mt-1 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                        {formatDate(order.createdAt)}
                        {destination ? ` · to ${destination.city}, ${destination.state} ${destination.postalCode}` : ''}
                      </p>
                    </div>
                    <span
                      className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      {prettyStatus(order.status)}
                    </span>
                  </div>

                  <ul className="m-0 mt-4 flex list-none flex-col gap-1.5 p-0">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-baseline justify-between gap-3 text-[13.5px]"
                      >
                        <span style={{ color: 'var(--ink-2)' }}>
                          {item.product?.name ?? 'Item'}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                          <span className="ml-2 font-mono text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                            {item.sku}
                          </span>
                        </span>
                        <span className="text-ink">{formatCurrency(item.price * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>

                  {/* The money, stated plainly: what the buyer paid, what the
                      platform took, and what this shop is owed. */}
                  <dl
                    className="m-0 mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-3 text-[13px] sm:grid-cols-4"
                  >
                    <div>
                      <dt className="m-0" style={{ color: 'var(--ink-3)' }}>
                        Buyer paid
                      </dt>
                      <dd className="m-0 font-semibold text-ink">{formatCurrency(order.total)}</dd>
                    </div>
                    <div>
                      <dt className="m-0" style={{ color: 'var(--ink-3)' }}>
                        Commission ({order.commissionRate}%)
                      </dt>
                      <dd className="m-0 text-ink">−{formatCurrency(order.commissionAmount)}</dd>
                    </div>
                    <div>
                      <dt className="m-0" style={{ color: 'var(--ink-3)' }}>
                        Your payout
                      </dt>
                      <dd className="m-0 font-semibold text-ink">
                        {formatCurrency(order.payoutAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="m-0" style={{ color: 'var(--ink-3)' }}>
                        Settled
                      </dt>
                      <dd className="m-0 text-ink">
                        {order.settledAt ? formatDate(order.settledAt) : 'Not yet'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {next && (
                      <Button
                        size="sm"
                        loading={busyId === order.id}
                        onClick={() =>
                          run(
                            order.id,
                            () => updateSellerOrder(order.id, { status: next.status }),
                            next.label
                          )
                        }
                      >
                        {next.label}
                      </Button>
                    )}

                    {/* Tracking is worth capturing at the point the parcel goes
                        out, which is the same moment as "mark shipped". */}
                    {(order.status === 'READY_FOR_SHIPMENT' || order.status === 'SHIPPED') && (
                      <>
                        <input
                          value={tracking[order.id] ?? order.trackingNumber ?? ''}
                          onChange={(event) =>
                            setTracking((current) => ({ ...current, [order.id]: event.target.value }))
                          }
                          placeholder="Tracking number"
                          className="h-8 w-44 text-[13px]"
                          aria-label={`Tracking number for ${order.orderNumber}`}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === order.id}
                          onClick={() =>
                            run(
                              order.id,
                              () =>
                                updateSellerOrder(order.id, {
                                  trackingNumber: tracking[order.id] ?? '',
                                }),
                              'Tracking saved'
                            )
                          }
                        >
                          Save tracking
                        </Button>
                      </>
                    )}

                    {order.trackingNumber && order.status === 'SHIPPED' && (
                      <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                        {order.carrier ? `${order.carrier} · ` : ''}
                        {order.trackingNumber}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
