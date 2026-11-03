'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button, Input, LoadingSpinner } from '@/components/common';
import { useSeller } from '@/components/seller/SellerContext';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import {
  downloadStatementCsv,
  getEarnings,
  getStatement,
  getWithdrawals,
  requestWithdrawal,
  saveBlob,
  type EarningsSummary,
  type LedgerType,
  type Statement,
  type Withdrawal,
} from '@/lib/seller-api';
import { NoShopYet, NotForRole, Notice, PageHeader, SectionTitle, Stat, formatDate, prettyStatus } from '../_components/ui';

/**
 * The shop's money (`GET /seller/earnings`): what is payable now, what is
 * held and why, lifetime totals, the statement behind them (JSON on screen,
 * CSV to download) and withdrawals. Every figure is the API's, in paise;
 * nothing is recalculated here.
 */

const LEDGER_LABELS: Record<LedgerType, string> = {
  SALE: 'Sale',
  PAYOUT: 'Payout',
  RETURN_REVERSAL: 'Return',
  ADJUSTMENT: 'Adjustment',
};

/** `yyyy-mm-dd` from a date input → the instant that day starts (or ends) in local time. */
const dayStart = (day: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : undefined);
const dayEnd = (day: string) => (day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined);

export default function SellerEarningsPage() {
  const { me, can } = useSeller();
  const shop = me?.shop ?? null;
  const allowed = Boolean(shop) && can('FINANCE');

  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([getEarnings(), getWithdrawals()])
        .then(([e, w]) => {
          setEarnings(e);
          setWithdrawals(w.items);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!shop) return <NoShopYet />;
  if (!can('FINANCE')) return <NotForRole what="earnings and payouts" />;
  if (isLoading) return <LoadingSpinner className="min-h-[50vh]" size="lg" />;

  const balance = earnings?.balancePaise ?? 0;

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    let paise: number | undefined;
    if (amount.trim()) {
      const rupees = Number(amount);
      if (!Number.isFinite(rupees) || rupees <= 0) {
        toast.error('Enter an amount in rupees, or leave it empty to withdraw everything payable.');
        return;
      }
      paise = rupeesToPaise(rupees);
      if (paise > balance) {
        toast.error(`You can withdraw up to ${formatPaise(balance)}.`);
        return;
      }
    }
    setRequesting(true);
    try {
      const w = await requestWithdrawal(paise);
      toast.success(`Withdrawal of ${formatPaise(w.amountPaise)} requested.`);
      setAmount('');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <main className="section-y">
      <div className="container-max">
        <PageHeader
          title="Earnings"
          lead="What you have earned, what is held and why, and what has been paid out."
          actions={
            <Link href="/seller" className="btn btn-outline btn-sm">
              Back to overview
            </Link>
          }
        />
        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        {earnings && (
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Ready to pay" value={formatPaise(earnings.balancePaise)} note="Past the return window" />
            <Stat
              label="Held"
              value={formatPaise(earnings.heldPaise)}
              note={
                earnings.held.length
                  ? `${earnings.held.length} order${earnings.held.length === 1 ? '' : 's'} not payable yet`
                  : 'Nothing in the pipeline'
              }
            />
            <Stat label="Lifetime sales" value={formatPaise(earnings.lifetimeSalesPaise)} note="Your share, after commission" />
            <Stat label="Paid out" value={formatPaise(earnings.lifetimePayoutsPaise)} note="Settled to date" />
          </div>
        )}

        <section className="mt-10 max-w-[860px]">
          <SectionTitle>Withdraw</SectionTitle>
          {earnings?.openWithdrawal ? (
            <Notice title={`Withdrawal of ${formatPaise(earnings.openWithdrawal.amountPaise)} is ${earnings.openWithdrawal.status.toLowerCase()}`} className="mt-4">
              Requested {formatDate(earnings.openWithdrawal.createdAt)}. You can ask again once it is paid or decided.
            </Notice>
          ) : balance <= 0 ? (
            <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Nothing is payable yet. Money becomes payable once an order is delivered and its return window has
              passed.
            </p>
          ) : (
            <form onSubmit={request} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="w-[220px]">
                <Input
                  id="withdraw-amount"
                  label="Amount (₹)"
                  type="number"
                  min={1}
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={String(balance / 100)}
                  helperText={`Up to ${formatPaise(balance)}. Empty withdraws it all.`}
                />
              </div>
              <Button type="submit" loading={requesting}>
                Request withdrawal
              </Button>
            </form>
          )}
          <p className="m-0 mt-3 text-meta" style={{ color: 'var(--ink-3)' }}>
            Paid to the bank account in{' '}
            <Link href="/seller/settings#bank" className="underline underline-offset-2">
              Shop settings
            </Link>
            .
          </p>
        </section>

        {earnings && earnings.held.length > 0 && (
          <section className="mt-10 max-w-[860px]">
            <SectionTitle>Held</SectionTitle>
            <ul className="m-0 mt-4 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
              {earnings.held.map((row) => (
                <li
                  key={row.sellerOrderId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5"
                  style={{ background: 'var(--surface)' }}
                >
                  <span className="font-mono text-meta text-ink">{row.orderNumber}</span>
                  <span className="min-w-0 flex-1 text-meta" style={{ color: 'var(--ink-2)' }}>
                    {row.reason}
                  </span>
                  <span className="text-meta font-semibold text-ink">{formatPaise(row.payoutPaise)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <StatementSection />

        <section className="mt-10 max-w-[860px]">
          <SectionTitle>Withdrawals</SectionTitle>
          {withdrawals.length === 0 ? (
            <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              None yet.
            </p>
          ) : (
            <ul className="m-0 mt-4 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
              {withdrawals.map((w) => (
                <li
                  key={w.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5"
                  style={{ background: 'var(--surface)' }}
                >
                  <span className="text-meta text-ink">{formatDate(w.createdAt)}</span>
                  <span className="text-meta" style={{ color: w.status === 'REJECTED' ? 'var(--sale)' : 'var(--ink-2)' }}>
                    {prettyStatus(w.status)}
                    {w.rejectionReason ? ` — ${w.rejectionReason}` : ''}
                    {w.transactionRef ? ` · ref ${w.transactionRef}` : ''}
                  </span>
                  <span className="text-meta font-semibold text-ink">{formatPaise(w.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

const StatementSection: React.FC = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [busy, setBusy] = useState<null | 'view' | 'csv'>(null);

  const range = () => ({ from: dayStart(from), to: dayEnd(to) });

  const view = async () => {
    setBusy('view');
    try {
      setStatement(await getStatement(range()));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const csv = async () => {
    setBusy('csv');
    try {
      saveBlob(await downloadStatementCsv(range()), `tailorae-statement${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.csv`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10 max-w-[860px]">
      <SectionTitle>Statement</SectionTitle>
      <p className="m-0 mt-1 text-meta" style={{ color: 'var(--ink-3)' }}>
        Every sale, payout, return and adjustment, with the running balance. Leave the dates empty for everything.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-[180px]">
          <Input id="statement-from" label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="w-[180px]">
          <Input id="statement-to" label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <Button variant="outline" loading={busy === 'view'} onClick={view}>
          Show statement
        </Button>
        <Button variant="outline" loading={busy === 'csv'} onClick={csv}>
          Download CSV
        </Button>
      </div>

      {statement && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
                {['Date', 'Type', 'Order / reference', 'Amount', 'Balance'].map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="py-2.5 pr-4 text-caption font-bold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-2.5 pr-4" colSpan={4} style={{ color: 'var(--ink-3)' }}>
                  Opening balance
                </td>
                <td className="py-2.5 pr-4 text-ink">{formatPaise(statement.openingPaise)}</td>
              </tr>
              {statement.lines.map((line) => (
                <tr key={line.entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-2.5 pr-4 text-ink">{formatDate(line.entry.createdAt)}</td>
                  <td className="py-2.5 pr-4" style={{ color: 'var(--ink-2)' }}>
                    {LEDGER_LABELS[line.entry.type] ?? line.entry.type}
                  </td>
                  <td className="py-2.5 pr-4" style={{ color: 'var(--ink-2)' }}>
                    {[line.entry.orderNumber, line.entry.reference, line.entry.note].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td
                    className="py-2.5 pr-4 font-semibold"
                    style={{ color: line.entry.amountPaise < 0 ? 'var(--sale)' : 'var(--ink)' }}
                  >
                    {line.entry.amountPaise < 0 ? '−' : ''}
                    {formatPaise(Math.abs(line.entry.amountPaise))}
                  </td>
                  <td className="py-2.5 pr-4 text-ink">{formatPaise(line.balanceAfterPaise)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5 pr-4 font-semibold text-ink" colSpan={4}>
                  Closing balance
                </td>
                <td className="py-2.5 pr-4 font-semibold text-ink">{formatPaise(statement.closingPaise)}</td>
              </tr>
            </tbody>
          </table>
          {statement.lines.length === 0 && (
            <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              No movements in this period.
            </p>
          )}
        </div>
      )}
    </section>
  );
};
