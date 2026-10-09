'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, LoadingSpinner } from '@/components/common';
import {
  getMyShop,
  getSellerEarnings,
  requestWithdrawal,
  type MyShop,
  type SellerEarningRow,
  type SellerLedgerEntry,
  type SellerWithdrawal,
} from '@/lib/seller-api';
import { formatCurrency } from '@/utils/helpers';
import { RootState } from '@/store';

/**
 * A seller's money, itemised.
 *
 * The dashboard shows two totals; this is what sits behind them. Every held
 * order carries the reason it is held, and every line its commission rate and
 * amount, because "your payout is lower than you expected" is otherwise a
 * support email rather than something a seller can answer for themselves.
 *
 * "Ready to pay" is the ledger balance: sales credited once they clear the
 * return window, less payouts, returns reversed after a payout, and any
 * adjustment. The statement at the bottom is that ledger, line by line.
 */

const day = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const ENTRY_LABEL: Record<SellerLedgerEntry['type'], string> = {
  SALE: 'Sale credited',
  PAYOUT: 'Paid to your bank',
  RETURN_REVERSAL: 'Return deducted',
  ADJUSTMENT: 'Adjustment',
};

const STATUS_LABEL: Record<SellerWithdrawal['status'], string> = {
  PENDING: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  COMPLETED: 'Paid',
};

export default function SellerEarningsPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [shop, setShop] = useState<MyShop | null>(null);
  const [orders, setOrders] = useState<SellerEarningRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<SellerWithdrawal[]>([]);
  const [ledger, setLedger] = useState<{ balance: number; entries: SellerLedgerEntry[] }>({
    balance: 0,
    entries: [],
  });
  const [returnWindowDays, setReturnWindowDays] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/seller/earnings');
  }, [isInitialized, user, router]);

  const load = useCallback(
    () =>
      Promise.all([getMyShop(), getSellerEarnings()])
        .then(([myShop, earnings]) => {
          setShop(myShop);
          setOrders(earnings.orders);
          setWithdrawals(earnings.withdrawals);
          setLedger(earnings.ledger);
          setReturnWindowDays(earnings.returnWindowDays);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  // Held is the absence of a clearance — the same rule the server applies. Due
  // is the ledger balance, which a return after a payout can take below zero.
  const { held, dueCount } = useMemo(() => {
    let heldTotal = 0;
    let count = 0;
    for (const order of orders) {
      if (order.hold === null) count += 1;
      else heldTotal += order.payoutAmount;
    }
    return { held: heldTotal, dueCount: count };
  }, [orders]);
  const due = Math.max(0, ledger.balance);
  const kycApproved = shop?.kycStatus === 'APPROVED';

  const openRequest = withdrawals.find((row) => row.status === 'PENDING');

  const request = async () => {
    setIsRequesting(true);
    try {
      toast.success(await requestWithdrawal());
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsRequesting(false);
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  if (!shop) {
    return (
      <main className="section-y">
        <div className="container-max">
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            You do not have a seller account yet.{' '}
            <Link href="/seller" className="underline underline-offset-2">
              Set one up
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Sell', href: '/seller' },
            { label: 'Earnings' },
          ]}
        />

        <header className="mt-6 border-b border-line pb-6">
          <h1
            className="m-0 text-ink"
            style={{
              fontSize: 'clamp(24px, 3.2vw, 34px)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            Earnings &amp; payouts
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
            Money is released {returnWindowDays} days after delivery, once the buyer&rsquo;s return
            window has closed.
          </p>
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="border border-line p-5" style={{ background: 'var(--surface-2)' }}>
            <p
              className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              Ready to pay
            </p>
            <p className="m-0 mt-2 text-[30px] font-semibold leading-none text-ink">
              {formatCurrency(due)}
            </p>
            <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              {ledger.balance < 0
                ? `${formatCurrency(-ledger.balance)} of returns will come off your next sales`
                : dueCount > 0
                  ? `${dueCount} order${dueCount === 1 ? '' : 's'} cleared`
                  : due > 0
                    ? 'Your account balance'
                    : 'Nothing has cleared the return window yet'}
            </p>

            <div className="mt-4">
              {openRequest ? (
                <p className="m-0 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                  Payout of {formatCurrency(openRequest.amount)} requested on{' '}
                  {day(openRequest.createdAt)} — we are processing it.
                </p>
              ) : !kycApproved ? (
                <div>
                  <p className="m-0 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                    Payouts start once your identity check (KYC) is approved.
                  </p>
                  <Link href="/seller/verification" className="btn btn-primary btn-sm mt-3">
                    Complete verification
                  </Link>
                </div>
              ) : !shop.hasBankDetails ? (
                <div>
                  <p className="m-0 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                    We have nowhere to send this yet — add the account you want to be paid into.
                  </p>
                  <Link href="/seller/settings" className="btn btn-primary btn-sm mt-3">
                    Add bank details
                  </Link>
                </div>
              ) : (
                <Button onClick={request} loading={isRequesting} disabled={due <= 0}>
                  Request payout
                </Button>
              )}
            </div>
          </div>

          <div className="border border-line p-5">
            <p
              className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              Held
            </p>
            <p className="m-0 mt-2 text-[30px] font-semibold leading-none text-ink">
              {formatCurrency(held)}
            </p>
            <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              Earned, but still in transit or inside a buyer&rsquo;s return window. It moves across
              on its own.
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2
            className="m-0 text-ink"
            style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Unsettled orders
          </h2>
          {orders.length === 0 ? (
            <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Nothing outstanding. Orders appear here until they have been paid out.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr>
                    {['Order', 'Delivered', 'Sale', 'Commission', 'Your payout', 'Status'].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="border-b border-line pb-2 pr-4 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <React.Fragment key={order.id}>
                      <tr>
                        <td className="border-b border-line py-3 pr-4 font-mono text-[12.5px] text-ink">
                          {order.orderNumber}
                        </td>
                        <td
                          className="border-b border-line py-3 pr-4 text-[13px]"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          {day(order.deliveredAt)}
                        </td>
                        <td
                          className="border-b border-line py-3 pr-4 text-[13px]"
                          style={{ color: 'var(--ink-2)' }}
                        >
                          {formatCurrency(order.total)}
                        </td>
                        <td
                          className="border-b border-line py-3 pr-4 text-[13px]"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          −{formatCurrency(order.commissionAmount)}
                          <span className="ml-1 text-[11.5px]">({order.commissionRate}%)</span>
                        </td>
                        <td className="border-b border-line py-3 pr-4 text-[13px] font-semibold text-ink">
                          {formatCurrency(order.payoutAmount)}
                        </td>
                        <td className="border-b border-line py-3 pr-4 text-[12.5px]">
                          {order.hold === null ? (
                            <span
                              style={{ color: 'var(--brand-ink, var(--ink))', fontWeight: 600 }}
                            >
                              Ready to pay
                            </span>
                          ) : (
                            <span style={{ color: 'var(--ink-3)' }}>{order.hold}</span>
                          )}
                        </td>
                      </tr>
                      {/* Commission per line: one order can span categories, each at its own rate. */}
                      {order.items.length > 0 && (
                        <tr>
                          <td colSpan={6} className="border-b border-line pb-3 pr-4">
                            <ul className="m-0 flex list-none flex-col gap-1 p-0">
                              {order.items.map((item) => (
                                <li
                                  key={item.id}
                                  className="flex flex-wrap justify-between gap-x-4 text-[12px]"
                                  style={{ color: 'var(--ink-3)' }}
                                >
                                  <span>
                                    {item.name} × {item.quantity} ·{' '}
                                    {formatCurrency(item.price * item.quantity)}
                                  </span>
                                  <span>
                                    Commission {item.commissionRate}% · −
                                    {formatCurrency(item.commissionAmount)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              className="m-0 text-ink"
              style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              Statement
            </h2>
            <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              Balance{' '}
              <strong className="text-ink">
                {ledger.balance < 0 ? '−' : ''}
                {formatCurrency(Math.abs(ledger.balance))}
              </strong>
            </span>
          </div>
          {ledger.entries.length === 0 ? (
            <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              No entries yet. A sale is credited here once it clears the return window.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr>
                    {['Date', 'Entry', 'Order / reference', 'Amount', 'Balance'].map((heading) => (
                      <th
                        key={heading}
                        className="border-b border-line pb-2 pr-4 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td
                        className="border-b border-line py-2.5 pr-4 text-[13px]"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        {day(entry.createdAt)}
                      </td>
                      <td className="border-b border-line py-2.5 pr-4 text-[13px] text-ink">
                        {ENTRY_LABEL[entry.type]}
                        {entry.type === 'ADJUSTMENT' && entry.note && (
                          <span className="block text-[12px]" style={{ color: 'var(--ink-3)' }}>
                            {entry.note}
                          </span>
                        )}
                      </td>
                      <td
                        className="border-b border-line py-2.5 pr-4 font-mono text-[12px]"
                        style={{ color: 'var(--ink-2)' }}
                      >
                        {entry.orderNumber ?? entry.reference ?? '—'}
                      </td>
                      <td
                        className="border-b border-line py-2.5 pr-4 text-[13px] font-semibold"
                        style={{ color: entry.amount < 0 ? 'var(--ink-2)' : 'var(--ink)' }}
                      >
                        {entry.amount < 0 ? '−' : '+'}
                        {formatCurrency(Math.abs(entry.amount))}
                      </td>
                      <td className="border-b border-line py-2.5 pr-4 text-[13px] text-ink">
                        {entry.balanceAfter < 0 ? '−' : ''}
                        {formatCurrency(Math.abs(entry.balanceAfter))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2
            className="m-0 text-ink"
            style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Payout history
          </h2>
          {withdrawals.length === 0 ? (
            <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              No payouts yet.
            </p>
          ) : (
            <ul
              className="m-0 mt-4 flex list-none flex-col gap-px p-0"
              style={{ background: 'var(--border)' }}
            >
              {withdrawals.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5"
                  style={{ background: 'var(--surface)' }}
                >
                  <span className="text-[14px] font-semibold text-ink">
                    {formatCurrency(row.amount)}
                  </span>
                  <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                    {STATUS_LABEL[row.status]} · {day(row.completedAt ?? row.createdAt)}
                  </span>
                  <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                    {row.rejectionReason ?? row.transactionId ?? ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
