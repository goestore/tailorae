'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Breadcrumbs, Button, Input, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';
import { OrderStatus } from '@/types';

interface TrackedItem {
  id: string;
  name: string;
  slug: string | null;
  quantity: number;
  price: number;
  sku: string | null;
}

interface TrackedOrder {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  createdAt: string;
  verified: boolean;
  total?: number;
  trackingNumber?: string | null;
  carrier?: string | null;
  estimatedDelivery?: string | null;
  actualDelivery?: string | null;
  destination?: string | null;
  items?: TrackedItem[];
  timeline?: Array<{ status: string; message: string | null; createdAt: string }>;
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
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const track = async (event: React.FormEvent) => {
    event.preventDefault();
    const reference = orderNumber.trim();
    if (!reference) {
      setError('Enter your order number.');
      return;
    }

    setIsSearching(true);
    setError(null);
    setOrder(null);
    try {
      const res = await apiClient.get('/track-order', {
        params: { orderNumber: reference, email: email.trim() || undefined },
      });
      setOrder(res.data?.data?.order ?? null);
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
              No account needed. Add the email you checked out with to see the items and the total
              as well as the status.
            </p>
          </header>

          <form onSubmit={track} className="mt-8 flex flex-col gap-4">
            <Input
              label="Order number"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value.toUpperCase())}
              placeholder="CI-1234567890-ABCD"
              autoComplete="off"
            />
            <Input
              label="Email (optional)"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="The address on the order"
              helperText="Without it we can only show the status, never your items or address."
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
                    className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    Order
                  </p>
                  <p className="m-0 mt-1 text-[16px] font-semibold text-ink">{order.orderNumber}</p>
                </div>
                <div className="text-right">
                  <p
                    className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
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
                      className="m-0 text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: 'var(--sale)' }}
                    >
                      Order cancelled
                    </p>
                    <p className="m-0 mt-1.5 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                      This order was cancelled and will not be delivered. Any payment made is
                      refunded to the original method.
                    </p>
                  </div>
                ) : isReturned ? (
                  <div className="px-4 py-4 text-center" style={{ background: '#fff7ed' }}>
                    <p
                      className="m-0 text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: '#c2410c' }}
                    >
                      Order returned
                    </p>
                    <p className="m-0 mt-1.5 text-[13px]" style={{ color: 'var(--ink-2)' }}>
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
                            className="mt-2 text-[10px] font-bold uppercase tracking-[0.08em]"
                            style={{ color: reached ? 'var(--ink)' : 'var(--ink-3)' }}
                          >
                            {step.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {order.trackingNumber && (
                  <p className="m-0 mt-6 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                    <span className="font-semibold text-ink">
                      {order.carrier ? `${order.carrier} · ` : ''}
                      {order.trackingNumber}
                    </span>
                    {order.destination ? ` · to ${order.destination}` : ''}
                  </p>
                )}

                {order.estimatedDelivery && !order.actualDelivery && (
                  <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                    Estimated delivery {formatDate(order.estimatedDelivery)}
                  </p>
                )}
                {order.actualDelivery && (
                  <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                    Delivered {formatDate(order.actualDelivery)}
                  </p>
                )}
              </div>

              {order.verified && order.items && order.items.length > 0 && (
                <div className="border-t border-line p-5">
                  <p
                    className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    Items
                  </p>
                  <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-baseline justify-between gap-4 text-[14px]"
                      >
                        <span style={{ color: 'var(--ink-2)' }}>
                          {item.slug ? (
                            <Link href={`/products/${item.slug}`} className="hover:text-ink">
                              {item.name}
                            </Link>
                          ) : (
                            item.name
                          )}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                        </span>
                        <span className="font-semibold text-ink">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {typeof order.total === 'number' && (
                    <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                      <span
                        className="text-[11px] font-bold uppercase tracking-[0.1em]"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        Total
                      </span>
                      <span className="text-[17px] font-bold text-ink">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!order.verified && (
                <p
                  className="m-0 border-t border-line px-5 py-4 text-[13px]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  Add the email used at checkout above to see the items, the address and the total.
                </p>
              )}
            </section>
          )}

          <p className="mt-8 text-[13px]" style={{ color: 'var(--ink-3)' }}>
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
