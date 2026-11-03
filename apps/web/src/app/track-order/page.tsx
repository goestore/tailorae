'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Breadcrumbs, Button, Input, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { formatPaise } from '@/lib/money';
import { fetchOrderByReference } from '@/lib/orders-api';
import { useSignedIn } from '@/hooks/useSignedIn';
import { OrderStatus } from '@/types';

interface TrackedItem {
  name: string;
  quantity: number;
  thumbnail?: string | null;
}

/** One shop's parcel: each seller ships and tracks its own part of the order. */
interface Shipment {
  status: OrderStatus;
  trackingNumber?: string | null;
  carrier?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

/** What `GET /track-order?orderNumber=&email=` answers. */
interface TrackedOrder {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  createdAt: string;
  deliveredAt?: string | null;
  shipments?: Shipment[];
  items?: TrackedItem[];
  timeline?: Array<{ status: string; message: string | null; createdAt: string }>;
  /** Only when read from the signed-in shopper's own order. */
  totalPaise?: number;
}

/**
 * The stages a healthy order walks through. `CANCELLED` and `RETURNED` are
 * deliberately absent: they are not a step further along, and lighting up
 * "Confirmed" for a cancelled order tells the customer the opposite of the
 * truth. Those two render as their own notice instead.
 */
const STEPS: Array<{ label: string; statuses: OrderStatus[] }> = [
  { label: 'Placed', statuses: ['PENDING'] },
  { label: 'Confirmed', statuses: ['CONFIRMED', 'PROCESSING'] },
  { label: 'Ready', statuses: ['READY_FOR_SHIPMENT'] },
  { label: 'Shipped', statuses: ['SHIPPED'] },
  { label: 'Delivered', statuses: ['DELIVERED'] },
];

const stepIndex = (status: OrderStatus): number =>
  STEPS.findIndex((step) => step.statuses.includes(status));

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function TrackOrderForm() {
  const searchParams = useSearchParams();
  // Prefilled when the shopper arrived from a "Track" link in their account.
  const [orderNumber, setOrderNumber] = useState(searchParams.get('order') ?? '');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  // A signed-in shopper can track their own orders by number alone.
  const signedIn = useSignedIn();
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const track = async (event: React.FormEvent) => {
    event.preventDefault();
    const reference = orderNumber.trim();
    if (!reference) {
      setError('Enter your order number.');
      return;
    }

    if (!email.trim() && !signedIn) {
      setError('Enter the email address you checked out with.');
      return;
    }

    setIsSearching(true);
    setError(null);
    setOrder(null);
    try {
      if (!email.trim()) {
        const own = await fetchOrderByReference(reference);
        if (!own) throw new Error('We could not find that order on your account.');
        setOrder({
          orderNumber: own.orderNumber,
          status: own.status,
          paymentStatus: own.paymentStatus,
          createdAt: own.createdAt,
          deliveredAt: own.deliveredAt,
          shipments: own.sellerOrders ?? [],
          items: own.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            thumbnail: item.thumbnail,
          })),
          timeline: (own.timeline ?? []).map((t) => ({ ...t, message: t.message ?? null })),
          totalPaise: own.totalPaise,
        });
      } else {
        const res = await apiClient.get('/track-order', {
          params: { orderNumber: reference, email: email.trim() },
        });
        setOrder((res.data?.data as TrackedOrder | undefined) ?? null);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not find that order.'));
    } finally {
      setIsSearching(false);
    }
  };

  const currentStep = order ? stepIndex(order.status) : -1;
  const isCancelled = order?.status === 'CANCELLED';
  const isReturned = order?.status === 'RETURNED';

  return (
    <main className="section-y">
      <div className="container-max">
        <div className="mx-auto" style={{ maxWidth: '680px' }}>
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Track order' }]} />

          <header className="mt-6 border-b border-line pb-8">
            <h1
              className="m-0 text-ink"
              style={{
                fontSize: 'clamp(28px, 4vw, 42px)',
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              Track your order
            </h1>
            <p className="mt-3 text-[15px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
              No account needed: the order number and the email you checked out with are enough.
            </p>
          </header>

          <form onSubmit={track} className="mt-8 flex flex-col gap-4">
            <Input
              label="Order number"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value.toUpperCase())}
              placeholder="TL-1234567890-ABCD"
              autoComplete="off"
            />
            <Input
              label={signedIn ? 'Email (optional when signed in)' : 'Email'}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="The address on the order"
              helperText="The address the order confirmation was sent to."
              autoComplete="email"
            />
            <Button type="submit" size="lg" loading={isSearching}>
              Track order
            </Button>
          </form>

          {error && (
            <p
              role="alert"
              className="mt-6 border px-4 py-3 text-[14px]"
              style={{ borderColor: 'var(--sale)', color: 'var(--sale)' }}
            >
              {error}
            </p>
          )}

          {order && (
            <section className="mt-8 border border-line">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
                <div>
                  <p
                    className="m-0 text-caption font-bold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    Order
                  </p>
                  <p className="m-0 mt-1 text-[16px] font-semibold text-ink">{order.orderNumber}</p>
                </div>
                <div className="text-right">
                  <p
                    className="m-0 text-caption font-bold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    Placed
                  </p>
                  <p className="m-0 mt-1 text-[14px] text-ink">{formatDate(order.createdAt)}</p>
                </div>
              </header>

              <div className="p-5">
                {isCancelled ? (
                  <div className="px-4 py-4 text-center" style={{ background: '#fef2f2' }}>
                    <p
                      className="m-0 text-caption font-bold uppercase tracking-[0.12em]"
                      style={{ color: 'var(--sale)' }}
                    >
                      Order cancelled
                    </p>
                    <p className="m-0 mt-1.5 text-meta" style={{ color: 'var(--ink-2)' }}>
                      This order was cancelled and will not be delivered. Any payment made is
                      refunded to the original method.
                    </p>
                  </div>
                ) : isReturned ? (
                  <div className="px-4 py-4 text-center" style={{ background: '#fff7ed' }}>
                    <p
                      className="m-0 text-caption font-bold uppercase tracking-[0.12em]"
                      style={{ color: '#c2410c' }}
                    >
                      Order returned
                    </p>
                    <p className="m-0 mt-1.5 text-meta" style={{ color: 'var(--ink-2)' }}>
                      This order came back to us. Get in touch about the refund if you have not
                      heard from us.
                    </p>
                  </div>
                ) : (
                  <ol className="m-0 flex list-none justify-between p-0">
                    {STEPS.map((step, index) => {
                      const reached = currentStep >= 0 && index <= currentStep;
                      return (
                        <li key={step.label} className="relative flex flex-1 flex-col items-center">
                          {index > 0 && (
                            <span
                              aria-hidden="true"
                              className="absolute right-1/2 top-3 h-0.5 w-full"
                              style={{
                                background: reached ? 'var(--brand)' : 'var(--border)',
                              }}
                            />
                          )}
                          <span
                            aria-hidden="true"
                            className="relative z-10 h-6 w-6 rounded-full"
                            style={{
                              background: reached ? 'var(--brand)' : 'var(--surface)',
                              border: `1px solid ${reached ? 'var(--brand)' : 'var(--border-strong)'}`,
                            }}
                          />
                          <span
                            className="mt-2 text-micro font-bold uppercase tracking-[0.08em]"
                            style={{ color: reached ? 'var(--ink)' : 'var(--ink-3)' }}
                          >
                            {step.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {(order.shipments ?? [])
                  .filter((shipment) => shipment.trackingNumber)
                  .map((shipment, index) => (
                    <p key={index} className="m-0 mt-6 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                      <span className="font-semibold text-ink">
                        {shipment.carrier ? `${shipment.carrier} · ` : ''}
                        {shipment.trackingNumber}
                      </span>
                    </p>
                  ))}

                {order.deliveredAt && (
                  <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                    Delivered {formatDate(order.deliveredAt)}
                  </p>
                )}
              </div>

              {order.items && order.items.length > 0 && (
                <div className="border-t border-line p-5">
                  <p
                    className="m-0 text-caption font-bold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    Items
                  </p>
                  <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                    {order.items.map((item, index) => (
                      <li
                        key={index}
                        className="flex items-baseline justify-between gap-4 text-[14px]"
                      >
                        <span style={{ color: 'var(--ink-2)' }}>
                          {item.name}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {typeof order.totalPaise === 'number' && (
                    <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                      <span
                        className="text-caption font-bold uppercase tracking-[0.1em]"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        Total
                      </span>
                      <span className="text-[17px] font-bold text-ink">
                        {formatPaise(order.totalPaise)}
                      </span>
                    </div>
                  )}
                </div>
              )}

            </section>
          )}

          <p className="mt-8 text-meta" style={{ color: 'var(--ink-3)' }}>
            Signed in? Every order, invoice and return sits under{' '}
            <Link href="/dashboard" className="underline underline-offset-2 hover:text-ink">
              My Account
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * `useSearchParams` opts the tree into client rendering, so the form sits
 * behind a Suspense boundary and the page shell itself still prerenders.
 */
export default function TrackOrderPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-[50vh]" size="lg" />}>
      <TrackOrderForm />
    </Suspense>
  );
}
