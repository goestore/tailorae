'use client';

import React, { Suspense, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import { Breadcrumbs, LoadingSpinner } from '@/components/common';
import { ProductThumb } from '@/components/product/ProductThumb';
import { getApiErrorMessage } from '@/lib/api-utils';
import { fetchOrderByReference } from '@/lib/orders-api';
import { RootState } from '@/store';
import { Order, OrderStatus } from '@/types';
import { formatCurrency } from '@/utils/helpers';

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/** Plain English for a status enum. The customer never sees READY_FOR_SHIPMENT. */
const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'In production',
  READY_FOR_SHIPMENT: 'Ready to ship',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

/**
 * Three readings, not eight: in flight, arrived, or stopped. A pill that
 * changes colour on every step teaches the eye nothing.
 */
const statusTone = (status: OrderStatus): { color: string; background: string } => {
  if (status === 'CANCELLED' || status === 'RETURNED') {
    return { color: 'var(--sale)', background: '#fef2f2' };
  }
  if (status === 'DELIVERED') {
    return { color: '#1b7f4b', background: '#f0fdf4' };
  }
  return { color: 'var(--brand-700)', background: 'var(--brand-soft)' };
};

const PAYMENT_LABEL: Record<string, string> = {
  COD: 'Cash on delivery',
  RAZORPAY: 'Razorpay',
  STRIPE: 'Card (Stripe)',
  UPI: 'UPI',
  CREDIT_CARD: 'Credit card',
  DEBIT_CARD: 'Debit card',
  NETBANKING: 'Netbanking',
  WALLET: 'Wallet',
  PAYPAL: 'PayPal',
};

function OrderConfirmation({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // `?placed=1` is set by checkout on the redirect, and changes the greeting
  // only. Everything below is read back from the server, which is what makes a
  // refresh, a back button and a link from an email all land on the same page.
  const justPlaced = searchParams.get('placed') === '1';

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace(`/auth/login?redirect=/orders/${encodeURIComponent(orderNumber)}`);
    }
  }, [isInitialized, user, router, orderNumber]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      fetchOrderByReference(orderNumber)
        .then((found) => {
          setOrder(found);
          if (!found) setError('We could not find that order on your account.');
        })
        .catch((err) => setError(getApiErrorMessage(err, 'Could not load that order.')))
        .finally(() => setIsLoading(false)),
    [orderNumber]
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  if (error || !order) {
    return (
      <main className="section-y">
        <div className="container-max">
          <div className="mx-auto" style={{ maxWidth: '620px' }}>
            <div className="border border-line bg-surface-2 px-6 py-14 text-center">
              <p className="m-0 text-lg text-ink">{error ?? 'Order not found.'}</p>
              <p className="mx-auto mt-2 max-w-[46ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
                Check the reference, or look it up with the email you checked out with.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/dashboard?tab=orders" className="btn btn-primary">
                  My orders
                </Link>
                <Link
                  href={`/track-order?order=${encodeURIComponent(orderNumber)}`}
                  className="btn btn-outline"
                >
                  Track an order
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const tone = statusTone(order.status);
  const address = order.shippingAddress ?? order.billingAddress ?? null;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const payment = order.paymentMethod
    ? PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod
    : 'Cash on delivery';

  return (
    <main className="section-y">
      <div className="container-max">
        <div className="mx-auto" style={{ maxWidth: '820px' }}>
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'My orders', href: '/dashboard?tab=orders' },
              { label: order.orderNumber },
            ]}
          />

          {justPlaced && (
            <div
              className="mt-6 flex items-start gap-4 border p-5"
              style={{ borderColor: 'var(--brand)', background: 'var(--brand-soft)' }}
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[14px]"
                style={{ background: 'var(--brand)', color: 'var(--ink)' }}
              >
                &#10003;
              </span>
              <div>
                <p className="m-0 text-[15px] text-ink">Thank you &mdash; your order is confirmed.</p>
                <p className="m-0 mt-1 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
                  Keep this page: the address bar holds your order number, so it survives a refresh
                  and works as a link.
                </p>
              </div>
            </div>
          )}

          <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
            <div>
              <p
                className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--ink-3)' }}
              >
                Order
              </p>
              <h1
                className="m-0 mt-1 text-ink"
                style={{
                  fontSize: 'clamp(24px, 3.4vw, 36px)',
                  lineHeight: 1.05,
                  letterSpacing: '-0.03em',
                }}
              >
                {order.orderNumber}
              </h1>
              <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                Placed {formatDate(order.createdAt)} &middot; {itemCount} item
                {itemCount === 1 ? '' : 's'}
              </p>
            </div>
            <span
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{ color: tone.color, background: tone.background }}
            >
              {STATUS_LABEL[order.status]}
            </span>
          </header>

          {(order.estimatedDelivery || order.actualDelivery || order.trackingNumber) && (
            <section className="mt-6 border border-line p-5">
              {order.actualDelivery ? (
                <p className="m-0 text-[14px] text-ink">
                  Delivered {formatDate(order.actualDelivery)}
                </p>
              ) : order.estimatedDelivery ? (
                <p className="m-0 text-[14px] text-ink">
                  Estimated delivery {formatDate(order.estimatedDelivery)}
                </p>
              ) : null}
              {order.trackingNumber && (
                <p className="m-0 mt-1 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
                  {order.carrier ? `${order.carrier} · ` : ''}
                  {order.trackingNumber}
                </p>
              )}
            </section>
          )}

          <section className="mt-6 border border-line">
            <h2
              className="m-0 border-b border-line px-5 py-4 text-[10.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              What you ordered
            </h2>
            <ul className="m-0 list-none p-0">
              {order.items.map((item) => {
                const name = item.product?.name ?? 'Item';
                const image =
                  item.mockupImage ?? item.product?.thumbnail ?? item.product?.images?.[0];
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-4 border-b border-line p-5 last:border-b-0"
                  >
                    <div className="relative h-20 w-16 flex-shrink-0 overflow-hidden bg-surface-2">
                      <ProductThumb
                        src={image}
                        alt={name}
                        fill
                        sizes="64px"
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      {item.product?.slug ? (
                        <Link
                          href={`/products/${item.product.slug}`}
                          className="text-[14.5px] text-ink hover:text-[var(--brand-700)]"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="text-[14.5px] text-ink">{name}</span>
                      )}
                      <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                        Quantity {item.quantity}
                        {item.sku ? ` · SKU ${item.sku}` : ''}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-[14px] font-semibold text-ink">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className="border border-line p-5">
              <h2
                className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--ink-3)' }}
              >
                Delivering to
              </h2>
              {address ? (
                <address
                  className="m-0 mt-3 text-[14px] not-italic"
                  style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}
                >
                  <span className="font-semibold text-ink">{address.fullName}</span>
                  <br />
                  {address.addressLine1}
                  {address.addressLine2 ? (
                    <>
                      <br />
                      {address.addressLine2}
                    </>
                  ) : null}
                  <br />
                  {address.city}, {address.state} {address.postalCode}
                  <br />
                  {address.country}
                  <br />
                  {address.phoneNumber}
                </address>
              ) : (
                <p className="m-0 mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                  No delivery address is recorded against this order.
                </p>
              )}
              {order.notes && (
                <p className="m-0 mt-4 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  Your note: {order.notes}
                </p>
              )}
            </section>

            <section className="border border-line p-5">
              <h2
                className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--ink-3)' }}
              >
                Payment
              </h2>
              <p className="m-0 mt-3 text-[14px] text-ink">
                {payment}
                <span className="ml-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  {order.paymentStatus === 'PAID' ? 'Paid' : 'Due on delivery'}
                </span>
              </p>

              <dl className="m-0 mt-4 text-[14px]">
                <div className="flex justify-between py-1">
                  <dt style={{ color: 'var(--ink-3)' }}>Subtotal</dt>
                  <dd className="m-0 text-ink">{formatCurrency(order.subtotal)}</dd>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between py-1">
                    <dt style={{ color: 'var(--ink-3)' }}>
                      Discount{order.discountCode ? ` (${order.discountCode})` : ''}
                    </dt>
                    <dd className="m-0" style={{ color: '#1b7f4b' }}>
                      -{formatCurrency(order.discount)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <dt style={{ color: 'var(--ink-3)' }}>Shipping</dt>
                  <dd className="m-0 text-ink">
                    {order.shippingCost === 0 ? 'Free' : formatCurrency(order.shippingCost)}
                  </dd>
                </div>
                {order.tax > 0 && (
                  <div className="flex justify-between py-1">
                    <dt style={{ color: 'var(--ink-3)' }}>Tax</dt>
                    <dd className="m-0 text-ink">{formatCurrency(order.tax)}</dd>
                  </div>
                )}
                <div
                  className="mt-2 flex justify-between pt-3 text-[17px] font-bold"
                  style={{ borderTop: '1px solid var(--border-strong)' }}
                >
                  <dt>Total</dt>
                  <dd className="m-0">{formatCurrency(order.total)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/track-order?order=${encodeURIComponent(order.orderNumber)}`}
              className="btn btn-primary"
            >
              Track order
            </Link>
            <Link href={`/invoice/${order.id}`} className="btn btn-outline">
              Invoice
            </Link>
            <Link href="/products" className="btn btn-ghost">
              Continue shopping
            </Link>
          </div>

          <p className="mt-8 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            Every order, invoice and return sits under{' '}
            <Link
              href="/dashboard?tab=orders"
              className="underline underline-offset-2 hover:text-ink"
            >
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
 * The order confirmation, addressed by order number rather than held in
 * checkout's component state — so a refresh, a back button, a bookmark and a
 * link in a confirmation email all resolve to the same page.
 *
 * `useSearchParams` opts the tree into client rendering, so the body sits
 * behind a Suspense boundary and the shell still prerenders.
 */
export default function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = use(params);

  return (
    <Suspense fallback={<LoadingSpinner className="min-h-[50vh]" size="lg" />}>
      <OrderConfirmation orderNumber={orderNumber} />
    </Suspense>
  );
}
