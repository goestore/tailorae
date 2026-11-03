'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LEDGER_TYPE_LABEL,
  decideWithdrawal,
  downloadStatementCsv,
  getBalances,
  getSellerEarnings,
  getStatement,
  getWithdrawals,
  postLedgerAdjustment,
  settlePayout,
  type LedgerStatement,
  type SellerBalance,
  type SellerEarnings,
  type Withdrawal,
  type WithdrawalStatus,
} from '@/lib/admin-payouts';
import { announceQueuesChanged } from '@/lib/admin-moderation';
import { formatPaise, paiseToRupees, rupeesToPaise } from '@/lib/money';
import { Wallet } from '@/components/admin/icons';

/**
 * A table inside a zero-padding index card. The global rule that pulls a
 * table out to a padded card's edges (-16px margins) must not apply here.
 */
const flush: React.CSSProperties = { width: '100%', margin: 0 };

/**
 * Seller payouts (FINANCE).
 *
 * Settling is the one irreversible action in the console — it records a bank
 * transfer in the shop's ledger — so it is two steps and needs the transfer's
 * UTR reference. The amount defaults to the ledger balance; a smaller part
 * payment can be typed, never more. A return reversed after a payout makes the
 * balance negative, and the next settle nets it off.
 */

const day = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

/** Money reads down a column: right-aligned, tabular figures. */
const num: React.CSSProperties = {
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

const count: React.CSSProperties = { color: 'var(--a-text-dim)', fontSize: 12 };
const errorLine: React.CSSProperties = { color: 'var(--a-bad)', fontSize: 12, margin: '8px 0' };

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  background: 'rgba(0,0,0,0.6)',
};

const Kpi: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="admin-card">
    <p className="admin-kpi-label">{label}</p>
    <p className="admin-kpi-value">{value}</p>
    {sub && <p className="admin-kpi-sub">{sub}</p>}
  </div>
);

/** What a shop has earned, and each held order with the reason it is not payable yet. */
const ShopEarnings: React.FC<{ sellerId: string; refreshKey: number }> = ({
  sellerId,
  refreshKey,
}) => {
  const [earnings, setEarnings] = useState<SellerEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSellerEarnings(sellerId)
      .then((data) => !cancelled && setEarnings(data))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [sellerId, refreshKey]);

  if (error) return <p style={errorLine}>{error}</p>;
  if (!earnings)
    return (
      <p className="admin-kpi-sub" style={{ margin: '8px 0' }}>
        Loading earnings…
      </p>
    );

  return (
    <div style={{ margin: '8px 0 4px' }}>
      <p className="admin-kpi-sub" style={{ margin: '0 0 8px' }}>
        Lifetime sales {formatPaise(earnings.lifetimeSalesPaise)} · paid out{' '}
        {formatPaise(earnings.lifetimePayoutsPaise)}
        {earnings.openWithdrawal &&
          ` · open request for ${formatPaise(earnings.openWithdrawal.amountPaise)} (${earnings.openWithdrawal.status.toLowerCase()})`}
      </p>
      {earnings.held.length === 0 ? (
        <p className="admin-kpi-sub" style={{ margin: 0 }}>
          Nothing held for this shop.
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Held order</th>
                <th>Why it is held</th>
                <th style={num}>Payout</th>
              </tr>
            </thead>
            <tbody>
              {earnings.held.map((row) => (
                <tr key={row.sellerOrderId}>
                  <td style={{ whiteSpace: 'nowrap' }}>{row.orderNumber}</td>
                  <td>{row.reason}</td>
                  <td style={{ ...num, fontWeight: 650 }}>{formatPaise(row.payoutPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/** A shop's ledger with a running balance, a date range and a CSV export. */
const ShopStatement: React.FC<{ sellerId: string; shopName: string; refreshKey: number }> = ({
  sellerId,
  shopName,
  refreshKey,
}) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statement, setStatement] = useState<LedgerStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const range = useMemo(() => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }), [from, to]);

  useEffect(() => {
    let cancelled = false;
    getStatement(sellerId, range)
      .then((data) => {
        if (cancelled) return;
        setStatement(data);
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [sellerId, range, refreshKey]);

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      await downloadStatementCsv(sellerId, shopName, range);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const field: React.CSSProperties = { display: 'inline-flex', gap: 6, alignItems: 'center' };

  return (
    <div style={{ margin: '8px 0 4px' }}>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}
      >
        <label className="admin-kpi-sub" style={field}>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="admin-kpi-sub" style={field}>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="button" className="btn btn-sm" onClick={exportCsv} disabled={isExporting}>
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      {error && <p style={errorLine}>{error}</p>}
      {!statement ? (
        <p className="admin-kpi-sub">Loading statement…</p>
      ) : statement.lines.length === 0 ? (
        <p className="admin-kpi-sub">
          No ledger entries{from || to ? ' in this range' : ' yet'}. Balance{' '}
          {formatPaise(statement.closingPaise)}.
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th>Order / reference</th>
                <th style={num}>Amount</th>
                <th style={num}>Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} style={{ color: 'var(--a-text-dim)' }}>
                  Opening balance
                </td>
                <td style={num}>{formatPaise(statement.openingPaise)}</td>
              </tr>
              {statement.lines.map(({ entry, balanceAfterPaise }) => (
                <tr key={entry.id}>
                  <td>{day(entry.createdAt)}</td>
                  <td>
                    {LEDGER_TYPE_LABEL[entry.type] ?? entry.type}
                    {entry.note && <span style={count}> · {entry.note}</span>}
                  </td>
                  <td>{entry.orderNumber ?? entry.reference ?? '—'}</td>
                  <td style={{ ...num, color: entry.amountPaise < 0 ? 'var(--a-bad)' : undefined }}>
                    {entry.amountPaise < 0 ? '−' : '+'}
                    {formatPaise(Math.abs(entry.amountPaise))}
                  </td>
                  <td style={{ ...num, fontWeight: 650 }}>{formatPaise(balanceAfterPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const WITHDRAWAL_FILTERS: Array<{ value: WithdrawalStatus | ''; label: string }> = [
  { value: '', label: 'All requests' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'COMPLETED', label: 'Paid' },
  { value: 'REJECTED', label: 'Declined' },
];

/** Sellers' payout requests: approve, record the transfer, or decline with a reason. */
const WithdrawalRequests: React.FC<{
  refreshKey: number;
  onChanged: (message: string) => void;
}> = ({ refreshKey, onChanged }) => {
  const [status, setStatus] = useState<WithdrawalStatus | ''>('PENDING');
  const [rows, setRows] = useState<Withdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ id: string; kind: 'pay' | 'decline' } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getWithdrawals(status, 1, 100)
      .then((page) => {
        if (cancelled) return;
        setRows(page?.items ?? []);
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, refreshKey, reload]);

  const decide = async (
    row: Withdrawal,
    next: 'APPROVED' | 'REJECTED' | 'COMPLETED',
    value?: string
  ) => {
    setBusy(true);
    setError(null);
    try {
      const message = await decideWithdrawal(row.id, {
        status: next,
        ...(next === 'COMPLETED' ? { transactionRef: value } : {}),
        ...(next === 'REJECTED' ? { rejectionReason: value } : {}),
      });
      setActing(null);
      setText('');
      setReload((key) => key + 1);
      announceQueuesChanged();
      onChanged(message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-card" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <p className="admin-kpi-label" style={{ margin: 0 }}>
          Payout requests
        </p>
        <select
          aria-label="Filter payout requests"
          value={status}
          onChange={(event) => setStatus(event.target.value as WithdrawalStatus | '')}
          style={{ width: 'auto' }}
        >
          {WITHDRAWAL_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p style={errorLine}>{error}</p>}
      {!rows ? (
        <p className="admin-kpi-sub">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="admin-kpi-sub" style={{ margin: 0 }}>
          No {status ? WITHDRAWAL_FILTERS.find((f) => f.value === status)?.label.toLowerCase() : ''}{' '}
          requests.
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th style={num}>Amount</th>
                <th>Status</th>
                <th>Reference / reason</th>
                <th>Asked</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = row.status === 'PENDING' || row.status === 'APPROVED';
                const kind = acting && acting.id === row.id ? acting.kind : null;
                const isActing = kind !== null;
                return (
                  <React.Fragment key={row.id}>
                    <tr>
                      <td>{row.shopName ?? '—'}</td>
                      <td style={{ ...num, fontWeight: 650 }}>{formatPaise(row.amountPaise)}</td>
                      <td>
                        <span className="admin-status-badge" data-status={row.status}>
                          {row.status === 'COMPLETED'
                            ? 'Paid'
                            : row.status.charAt(0) + row.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td>{row.transactionRef ?? row.rejectionReason ?? '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{day(row.createdAt)}</td>
                      <td>
                        {open && !isActing && (
                          <div className="admin-actions">
                            {row.status === 'PENDING' && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                disabled={busy}
                                onClick={() => void decide(row, 'APPROVED')}
                              >
                                Approve
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() => {
                                setActing({ id: row.id, kind: 'pay' });
                                setText('');
                              }}
                            >
                              Record transfer
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() => {
                                setActing({ id: row.id, kind: 'decline' });
                                setText('');
                              }}
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isActing && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--a-surface-2)' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <input
                              autoFocus
                              value={text}
                              maxLength={kind === 'pay' ? 120 : 500}
                              onChange={(event) => setText(event.target.value)}
                              placeholder={
                                kind === 'pay'
                                  ? 'Bank transfer reference (UTR)'
                                  : 'Why? The seller will see this.'
                              }
                              aria-label={
                                kind === 'pay' ? 'Transfer reference' : 'Reason for declining'
                              }
                              style={{ flex: '1 1 240px', minWidth: 0 }}
                            />
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => setActing(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={kind === 'pay' ? 'btn btn-primary' : 'btn btn-danger'}
                              disabled={busy || !text.trim()}
                              onClick={() =>
                                void decide(
                                  row,
                                  kind === 'pay' ? 'COMPLETED' : 'REJECTED',
                                  text.trim()
                                )
                              }
                            >
                              {busy
                                ? 'Saving…'
                                : kind === 'pay'
                                  ? `Mark ${formatPaise(row.amountPaise)} paid`
                                  : 'Decline request'}
                            </button>
                          </div>
                          {kind === 'pay' && (
                            <p style={{ ...count, margin: '6px 0 0' }}>
                              Make the bank transfer first. This settles the amount from the
                              shop&rsquo;s ledger.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default function AdminPayoutsPage() {
  const [balances, setBalances] = useState<SellerBalance[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Which panel the expanded row shows: what is held, or its ledger.
  const [panel, setPanel] = useState<'earnings' | 'statement'>('earnings');
  // Bumped after every reload so open panels reload with it.
  const [refreshKey, setRefreshKey] = useState(0);
  const [adjusting, setAdjusting] = useState<SellerBalance | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [confirming, setConfirming] = useState<SellerBalance | null>(null);
  const [reference, setReference] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [isSettling, setIsSettling] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getBalances(1, 200)
        .then((page) => {
          setBalances(page?.items ?? []);
          setRefreshKey((key) => key + 1);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () =>
      balances.reduce(
        (acc, row) => ({
          due: acc.due + Math.max(0, row.balancePaise),
          held: acc.held + row.heldPaise,
          owed: acc.owed + Math.min(0, row.balancePaise),
          shops: acc.shops + (row.balancePaise > 0 ? 1 : 0),
        }),
        { due: 0, held: 0, owed: 0, shops: 0 }
      ),
    [balances]
  );

  const adjust = async () => {
    if (!adjusting) return;
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount) || amount === 0 || !adjustNote.trim()) return;
    setIsAdjusting(true);
    setDialogError(null);
    try {
      setNotice(
        await postLedgerAdjustment(adjusting.sellerId, {
          amountPaise: rupeesToPaise(amount),
          note: adjustNote.trim(),
        })
      );
      setAdjusting(null);
      void load();
    } catch (err) {
      setDialogError((err as Error).message);
    } finally {
      setIsAdjusting(false);
    }
  };

  const toggle = (id: string, next: 'earnings' | 'statement') => {
    if (expanded === id && panel === next) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    setPanel(next);
  };

  const settle = async () => {
    if (!confirming || !reference.trim()) return;
    const amountPaise =
      settleAmount.trim() === '' ? undefined : rupeesToPaise(Number(settleAmount));
    if (
      amountPaise !== undefined &&
      (!Number.isFinite(amountPaise) || amountPaise <= 0 || amountPaise > confirming.balancePaise)
    ) {
      setDialogError(`Pay between ₹1 and ${formatPaise(confirming.balancePaise)}.`);
      return;
    }
    setIsSettling(true);
    setDialogError(null);
    try {
      const message = await settlePayout(confirming.sellerId, {
        reference: reference.trim(),
        ...(amountPaise !== undefined ? { amountPaise } : {}),
        ...(settleNote.trim() ? { note: settleNote.trim() } : {}),
      });
      setNotice(message);
      setConfirming(null);
      void load();
    } catch (err) {
      setDialogError((err as Error).message);
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Payouts</h1>
          <p className="admin-page-sub">
            What each shop is owed, from its ledger. A sale is credited once the delivery is past
            the buyer&rsquo;s return window; a return after a payout comes off the next one.
          </p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="admin-alert" role="status" style={{ marginBottom: 16 }}>
          <span>{notice}</span>
        </div>
      )}

      <div className="admin-grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi
          label="Due now"
          value={formatPaise(totals.due)}
          sub={`${totals.shops} shop${totals.shops === 1 ? '' : 's'} with a balance`}
        />
        <Kpi label="Held" value={formatPaise(totals.held)} sub="Undelivered or returnable" />
        <Kpi
          label="Owed back"
          value={formatPaise(Math.abs(totals.owed))}
          sub="Returns reversed after a payout"
        />
        <Kpi label="Shops" value={String(balances.length)} sub="Approved or suspended" />
      </div>

      <WithdrawalRequests
        refreshKey={refreshKey}
        onChanged={(message) => {
          setNotice(message);
          void load();
        }}
      />

      <div className="admin-card admin-index">
        {isLoading ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading…</p>
          </div>
        ) : balances.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">
              <Wallet size={22} />
            </div>
            <p className="admin-empty-title">No seller shops yet</p>
            <p className="admin-empty-text">
              Balances appear here once a marketplace shop is approved. The house shop is never paid
              out.
            </p>
          </div>
        ) : (
          <>
            {totals.due <= 0 && (
              <div
                className="admin-toolbar"
                role="status"
                style={{ background: 'var(--a-surface-2)', gap: 10, padding: '12px 16px' }}
              >
                <span className="admin-empty-icon" style={{ width: 32, height: 32, margin: 0 }}>
                  <Wallet size={16} />
                </span>
                <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: 13 }}>
                    Nothing is due right now
                  </strong>
                  <span style={{ color: 'var(--a-text-dim)', fontSize: 12 }}>
                    {totals.held > 0
                      ? `${formatPaise(totals.held)} is held until deliveries clear the return window.`
                      : 'Every shop is paid up. New deliveries become payable after the return window.'}
                  </span>
                </span>
              </div>
            )}
            <div className="admin-table-wrap" style={flush}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Shop</th>
                    <th style={num}>Balance</th>
                    <th style={num}>Held</th>
                    <th>Last payout</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((row) => (
                    <React.Fragment key={row.sellerId}>
                      <tr>
                        <td>
                          <span className="admin-row-title">{row.shopName}</span>
                        </td>
                        <td style={{ ...num, fontWeight: row.balancePaise > 0 ? 650 : undefined }}>
                          {row.balancePaise < 0 ? (
                            <span
                              style={{ color: 'var(--a-bad)' }}
                              title="Returns reversed after a payout; deducted from future sales"
                            >
                              Owes {formatPaise(-row.balancePaise)}
                            </span>
                          ) : (
                            formatPaise(row.balancePaise)
                          )}
                        </td>
                        <td style={num}>{formatPaise(row.heldPaise)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{day(row.lastPayoutAt)}</td>
                        <td>
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="btn btn-sm"
                              aria-expanded={expanded === row.sellerId && panel === 'earnings'}
                              onClick={() => toggle(row.sellerId, 'earnings')}
                            >
                              {expanded === row.sellerId && panel === 'earnings'
                                ? 'Hide held'
                                : 'Held'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              aria-expanded={expanded === row.sellerId && panel === 'statement'}
                              onClick={() => toggle(row.sellerId, 'statement')}
                            >
                              {expanded === row.sellerId && panel === 'statement'
                                ? 'Hide statement'
                                : 'Statement'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                setAdjusting(row);
                                setAdjustAmount('');
                                setAdjustNote('');
                                setDialogError(null);
                              }}
                            >
                              Adjust
                            </button>
                            {row.balancePaise > 0 && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  setConfirming(row);
                                  setReference('');
                                  setSettleAmount('');
                                  setSettleNote('');
                                  setDialogError(null);
                                }}
                              >
                                Settle
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded === row.sellerId && (
                        <tr>
                          <td colSpan={5} style={{ background: 'var(--a-surface-2)' }}>
                            {panel === 'earnings' ? (
                              <ShopEarnings sellerId={row.sellerId} refreshKey={refreshKey} />
                            ) : (
                              <ShopStatement
                                sellerId={row.sellerId}
                                shopName={row.shopName}
                                refreshKey={refreshKey}
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {adjusting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Adjust ledger for ${adjusting.shopName}`}
          style={overlay}
        >
          <div className="admin-card" style={{ maxWidth: 460, width: '100%' }}>
            <p className="admin-kpi-label">Ledger adjustment</p>
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              {adjusting.shopName} · balance {formatPaise(adjusting.balancePaise)}. A positive
              amount credits the shop, a negative one deducts. The seller sees the note on their
              statement.
            </p>
            <input
              type="number"
              step="0.01"
              autoFocus
              value={adjustAmount}
              onChange={(event) => setAdjustAmount(event.target.value)}
              placeholder="Amount in ₹, e.g. -250 or 120"
              aria-label="Adjustment amount in rupees"
              style={{ width: '100%', marginBottom: 8 }}
            />
            <input
              value={adjustNote}
              onChange={(event) => setAdjustNote(event.target.value)}
              placeholder="Reason (required)"
              maxLength={500}
              aria-label="Reason for the adjustment"
              style={{ width: '100%' }}
            />
            {dialogError && <p style={errorLine}>{dialogError}</p>}
            <div className="admin-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setAdjusting(null)}
                disabled={isAdjusting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={adjust}
                disabled={
                  isAdjusting ||
                  !adjustNote.trim() ||
                  !Number.isFinite(Number(adjustAmount)) ||
                  Number(adjustAmount) === 0
                }
              >
                {isAdjusting ? 'Recording…' : 'Record adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Settle payout for ${confirming.shopName}`}
          style={overlay}
        >
          <div className="admin-card" style={{ maxWidth: 460, width: '100%' }}>
            <p className="admin-kpi-label">Record a payout</p>
            <p className="admin-kpi-value" style={{ fontSize: 24 }}>
              {formatPaise(
                settleAmount.trim() === ''
                  ? confirming.balancePaise
                  : rupeesToPaise(Number(settleAmount) || 0)
              )}
            </p>
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              {confirming.shopName} · balance {formatPaise(confirming.balancePaise)}. This records
              the payment in the shop&rsquo;s ledger. Make the bank transfer first — it cannot be
              undone here.
            </p>

            <input
              autoFocus
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Bank transfer reference — UTR (required)"
              maxLength={120}
              aria-label="Bank transfer reference"
              style={{ width: '100%', marginBottom: 8 }}
            />
            <input
              type="number"
              step="0.01"
              min={1}
              max={paiseToRupees(confirming.balancePaise)}
              value={settleAmount}
              onChange={(event) => setSettleAmount(event.target.value)}
              placeholder={`Amount in ₹ — empty pays all ${formatPaise(confirming.balancePaise)}`}
              aria-label="Payout amount in rupees"
              style={{ width: '100%', marginBottom: 8 }}
            />
            <input
              value={settleNote}
              onChange={(event) => setSettleNote(event.target.value)}
              placeholder="Note (optional)"
              maxLength={500}
              aria-label="Payout note"
              style={{ width: '100%' }}
            />
            {dialogError && <p style={errorLine}>{dialogError}</p>}

            <div className="admin-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setConfirming(null)}
                disabled={isSettling}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={settle}
                disabled={isSettling || !reference.trim()}
              >
                {isSettling ? 'Recording…' : 'Mark as paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
