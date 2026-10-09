'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { Button, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';
import { RootState } from '@/store';
import { Order } from '@/types';

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * A printable invoice for one order.
 *
 * It reads the same owner-guarded `GET /orders/:id` the account page uses, so
 * there is no second authorisation path to keep in step, and prints through
 * the browser rather than a server-rendered PDF — the numbers are identical
 * and there is nothing to keep in sync.
 */
export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace(`/auth/login?redirect=/invoice/${id}`);
    }
  }, [isInitialized, user, router, id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiClient
      .get(`/orders/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!cancelled) setOrder(res.data?.data?.order ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Could not load that invoice.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  if (error || !order) {
    return (
      <main className="section-y">
        <div className="container-max mx-auto" style={{ maxWidth: '720px' }}>
          <p className="text-lg text-ink">{error ?? 'Invoice not found.'}</p>
          <Link href="/dashboard?tab=orders" className="btn btn-outline mt-5">
            Back to my orders
          </Link>
        </div>
      </main>
    );
  }

  const address = order.billingAddress ?? order.shippingAddress ?? null;

  return (
    <main className="section-y">
      <div className="container-max">
        <div className="mx-auto" style={{ maxWidth: '820px' }}>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Link href="/dashboard?tab=orders" className="text-[13px] hover:text-ink" style={{ color: 'var(--ink-3)' }}>
              &larr; Back to my orders
            </Link>
            <Button variant="outline" onClick={() => window.print()}>
              Print / save as PDF
            </Button>
          </div>

          <article className="border border-line bg-white p-6 md:p-10">
            <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
              <div>
                <h1 className="m-0 text-ink" style={{ fontSize: '24px', letterSpacing: '-0.02em' }}>
                  Tax invoice
                </h1>
                <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  Creative Impression
                </p>
              </div>
              <dl className="m-0 text-right text-[13px]">
                <div>
                  <dt className="inline" style={{ color: 'var(--ink-3)' }}>
                    Invoice for order{' '}
                  </dt>
                  <dd className="m-0 inline font-semibold text-ink">{order.orderNumber}</dd>
                </div>
                <div className="mt-1">
                  <dt className="inline" style={{ color: 'var(--ink-3)' }}>
                    Dated{' '}
                  </dt>
                  <dd className="m-0 inline text-ink">{formatDate(order.createdAt)}</dd>
                </div>
                <div className="mt-1">
                  <dt className="inline" style={{ color: 'var(--ink-3)' }}>
                    Payment{' '}
                  </dt>
                  <dd className="m-0 inline text-ink">
                    {order.paymentMethod ?? 'COD'} · {order.paymentStatus}
                  </dd>
                </div>
              </dl>
            </header>

            {address && (
              <section className="border-b border-line py-6">
                <p
                  className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  Billed to
                </p>
                <address className="m-0 mt-2 text-[14px] not-italic" style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}>
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
                  {order.gstNumber ? (
                    <>
                      <br />
                      GSTIN {order.gstNumber}
                    </>
                  ) : null}
                </address>
              </section>
            )}

            <section className="py-6">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
                    <th
                      scope="col"
                      className="py-2 pr-3 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="py-2 pr-3 text-right text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      Qty
                    </th>
                    <th
                      scope="col"
                      className="py-2 pr-3 text-right text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      Rate
                    </th>
                    <th
                      scope="col"
                      className="py-2 text-right text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 pr-3 text-[14px] text-ink">
                        {item.product?.name ?? 'Item'}
                        {item.sku && (
                          <span className="block text-[12px]" style={{ color: 'var(--ink-3)' }}>
                            SKU {item.sku}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-right text-[14px]" style={{ color: 'var(--ink-2)' }}>
                        {item.quantity}
                      </td>
                      <td className="py-3 pr-3 text-right text-[14px]" style={{ color: 'var(--ink-2)' }}>
                        {formatCurrency(item.price)}
                      </td>
                      <td className="py-3 text-right text-[14px] font-semibold text-ink">
                        {formatCurrency(item.price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="ml-auto mt-6 max-w-[320px] text-[14px]">
                <div className="flex justify-between py-1">
                  <dt style={{ color: 'var(--ink-3)' }}>Subtotal</dt>
                  <dd className="m-0 text-ink">{formatCurrency(order.subtotal)}</dd>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between py-1">
                    <dt style={{ color: 'var(--ink-3)' }}>
                      Discount{order.discountCode ? ` (${order.discountCode})` : ''}
                    </dt>
                    <dd className="m-0" style={{ color: 'var(--success, #1B7F4B)' }}>
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

            <footer className="border-t border-line pt-5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              <p className="m-0">
                Prices are inclusive of GST where applicable. This is a computer-generated invoice
                and does not require a signature.
              </p>
              <p className="m-0 mt-1">
                Questions about this invoice? Quote order {order.orderNumber} when you get in touch.
              </p>
            </footer>
          </article>
        </div>
      </div>
    </main>
  );
}
