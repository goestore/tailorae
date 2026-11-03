'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LEDGER_TYPE_LABEL,
  downloadStatementCsv,
  getPayoutOrders,
  getPayouts,
  getStatement,
  getWithdrawals,
  postLedgerAdjustment,
  rejectWithdrawal,
  settlePayout,
  type LedgerStatement,
  type PayoutOrderRow,
  type PayoutRow,
  type WithdrawalRow,
} from '@/lib/admin-payouts';
import { formatCurrency } from '@/utils/helpers';
import { Wallet } from '@/components/admin/icons';

/**
 * A table inside a zero-padding index card. The global rule that pulls a
 * table out to a padded card's edges (-16px margins) must not apply here.
 */
const flush: React.CSSProperties = { width: '100%', margin: 0 };

/**
 * Seller payouts.
 *
 * Settling is the one irreversible action in the console — it records a
 * transfer in the shop's ledger and stamps the sub-orders it covered as paid —
 * so the flow is deliberately two steps, and the amount is only ever the
 * server's ledger balance, never one typed here. A return reversed after a
 * payout makes the balance negative, and the next settle nets it off.
 */

const day = (value: string | null) =>
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

const Kpi: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="admin-card">
    <p className="admin-kpi-label">{label}</p>
    <p className="admin-kpi-value">{value}</p>
    {sub && <p className="admin-kpi-sub">{sub}</p>}
  </div>
);

/** The sub-orders behind one shop's figures, loaded on demand. */
const ShopDetail: React.FC<{ vendorId: string }> = ({ vendorId }) => {
  const [orders, setOrders] = useState<PayoutOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPayoutOrders(vendorId)
      .then((rows) => !cancelled && setOrders(rows))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (error) return <p style={{ color: 'var(--a-bad)', fontSize: 12, margin: '8px 0' }}>{error}</p>;
  if (!orders)
    return (
      <p className="admin-kpi-sub" style={{ margin: '8px 0' }}>
        Loading orders…
      </p>
    );
  if (orders.length === 0) {
    return (
      <p className="admin-kpi-sub" style={{ margin: '8px 0' }}>
        Nothing outstanding for this shop.
      </p>
    );
  }

  return (
    <div className="admin-table-wrap" style={{ margin: '8px 0 4px' }}>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Delivered</th>
            <th style={num}>Sale</th>
            <th style={num}>Commission</th>
            <th style={num}>Payout</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.orderNumber}</td>
              <td>{day(order.deliveredAt)}</td>
              <td style={num}>{formatCurrency(order.total)}</td>
              <td style={num}>
                −{formatCurrency(order.commissionAmount)}
                <span style={count}> · {order.commissionRate}%</span>
              </td>
              <td style={{ ...num, fontWeight: 650 }}>{formatCurrency(order.payoutAmount)}</td>
              <td>
                {order.hold === null ? (
                  <span className="admin-status-badge" data-status="PAID">
                    Payable
                  </span>
                ) : (
                  order.hold
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** A shop's ledger with a running balance, a date range and a CSV export. */
const ShopStatement: React.FC<{ vendorId: string; shopSlug: string; refreshKey: number }> = ({
  vendorId,
  shopSlug,
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
    getStatement(vendorId, range)
      .then((data) => {
        if (cancelled) return;
        setStatement(data);
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [vendorId, range, refreshKey]);

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      await downloadStatementCsv(vendorId, shopSlug, range);
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
      {error && <p style={{ color: 'var(--a-bad)', fontSize: 12, margin: '8px 0' }}>{error}</p>}
      {!statement ? (
        <p className="admin-kpi-sub">Loading statement…</p>
      ) : statement.entries.length === 0 ? (
        <p className="admin-kpi-sub">
          No ledger entries{from || to ? ' in this range' : ' yet'}. Balance{' '}
          {formatCurrency(statement.closingBalance)}.
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
                <td style={num}>{formatCurrency(statement.openingBalance)}</td>
              </tr>
              {statement.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{day(entry.createdAt)}</td>
                  <td>
                    {LEDGER_TYPE_LABEL[entry.type]}
                    {entry.note && entry.type === 'ADJUSTMENT' && (
                      <span style={count}> · {entry.note}</span>
                    )}
                  </td>
                  <td>{entry.orderNumber ?? entry.reference ?? '—'}</td>
                  <td style={{ ...num, color: entry.amount < 0 ? 'var(--a-bad)' : undefined }}>
                    {entry.amount < 0 ? '−' : '+'}
                    {formatCurrency(Math.abs(entry.amount))}
                  </td>
                  <td style={{ ...num, fontWeight: 650 }}>{formatCurrency(entry.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Which panel the expanded row shows: its open sub-orders or its ledger.
  const [panel, setPanel] = useState<'orders' | 'statement'>('orders');
  // Bumped after every reload so an open statement reloads with it.
  const [refreshKey, setRefreshKey] = useState(0);
  // The shop an adjustment is being entered for.
  const [adjusting, setAdjusting] = useState<PayoutRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  // The shop a settlement is being confirmed for, and the reference being typed.
  const [confirming, setConfirming] = useState<PayoutRow | null>(null);
  const [reference, setReference] = useState('');
  const [isSettling, setIsSettling] = useState(false);
  // The request being declined, and the reason the seller will be shown.
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([getPayouts(), getWithdrawals()])
        .then(([rows, history]) => {
          setPayouts(rows);
          setWithdrawals(history);
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
      payouts.reduce(
        (acc, row) => ({
          due: acc.due + row.payoutDue,
          held: acc.held + row.payoutHeld,
          settled: acc.settled + row.payoutSettled,
          commission: acc.commission + row.commissionEarned,
          shops: acc.shops + (row.payoutDue > 0 ? 1 : 0),
        }),
        { due: 0, held: 0, settled: 0, commission: 0, shops: 0 }
      ),
    [payouts]
  );

  const pending = withdrawals.filter((row) => row.status === 'PENDING');

  const decline = async (id: string) => {
    if (!declineReason.trim()) return;
    setIsDeclining(true);
    try {
      setNotice(await rejectWithdrawal(id, declineReason.trim()));
      setDecliningId(null);
      setDeclineReason('');
      void load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsDeclining(false);
    }
  };

  const adjust = async () => {
    if (!adjusting) return;
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount) || amount === 0 || !adjustNote.trim()) return;
    setIsAdjusting(true);
    try {
      setNotice(await postLedgerAdjustment(adjusting.id, { amount, note: adjustNote.trim() }));
      setAdjusting(null);
      setAdjustAmount('');
      setAdjustNote('');
      void load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsAdjusting(false);
    }
  };

  const toggle = (id: string, next: 'orders' | 'statement') => {
    if (expanded === id && panel === next) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    setPanel(next);
  };

  const settle = async () => {
    if (!confirming) return;
    setIsSettling(true);
    try {
      const message = await settlePayout(confirming.id, reference.trim() || undefined);
      setNotice(message);
      setConfirming(null);
      setReference('');
      load();
    } catch (err) {
      setError((err as Error).message);
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
          value={formatCurrency(totals.due)}
          sub={`${totals.shops} shop${totals.shops === 1 ? '' : 's'} awaiting payment`}
        />
        <Kpi label="Held" value={formatCurrency(totals.held)} sub="In transit or returnable" />
        <Kpi label="Paid to date" value={formatCurrency(totals.settled)} sub="Across all shops" />
        <Kpi
          label="Commission"
          value={formatCurrency(totals.commission)}
          sub="Ours, on what is due"
        />
      </div>

      {pending.length > 0 && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <p className="admin-kpi-label">Payout requests</p>
          {pending.map((row) => (
            <div key={row.id} style={{ padding: '6px 0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <p className="admin-kpi-sub" style={{ margin: 0 }}>
                  {row.vendor?.shopName ?? 'Unknown shop'} asked for {formatCurrency(row.amount)} on{' '}
                  {day(row.createdAt)}
                </p>
                {decliningId !== row.id && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setDecliningId(row.id);
                      setDeclineReason('');
                    }}
                  >
                    Decline
                  </button>
                )}
              </div>

              {decliningId === row.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    autoFocus
                    aria-label="Reason for declining"
                    value={declineReason}
                    onChange={(event) => setDeclineReason(event.target.value)}
                    placeholder="Why? The seller will see this."
                    maxLength={500}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setDecliningId(null)}
                    disabled={isDeclining}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => decline(row.id)}
                    disabled={isDeclining || !declineReason.trim()}
                  >
                    {isDeclining ? 'Declining…' : 'Decline request'}
                  </button>
                </div>
              )}
            </div>
          ))}
          <p style={{ margin: '8px 0 0', color: 'var(--a-text-dim)', fontSize: 12 }}>
            Settling a shop below pays its open request. Declining leaves the money payable.
          </p>
        </div>
      )}

      <div className="admin-card admin-index">
        {isLoading ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading…</p>
          </div>
        ) : payouts.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">
              <Wallet size={22} />
            </div>
            <p className="admin-empty-title">No seller shops yet</p>
            <p className="admin-empty-text">
              Payouts appear here once a seller shop has delivered orders.
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
                      ? `${formatCurrency(totals.held)} is held until deliveries clear the return window.`
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
                    <th>Bank</th>
                    <th style={num}>Due</th>
                    <th style={num}>Held</th>
                    <th style={num}>Paid</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span className="admin-row-title">{row.shopName}</span>
                            {!row.isActive && (
                              <span className="admin-status-badge" data-status="SUSPENDED">
                                Suspended
                              </span>
                            )}
                            {!row.isVerified && (
                              <span className="admin-status-badge" data-status="PENDING">
                                Unverified
                              </span>
                            )}
                            {row.kycStatus !== 'APPROVED' && (
                              <span className="admin-status-badge" data-status="PENDING">
                                KYC {row.kycStatus.replace('_', ' ').toLowerCase()}
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {row.canBePaid ? (
                            `${row.bankName ?? 'Bank'} ····${row.bankAccountLast4}`
                          ) : (
                            <span style={{ color: 'var(--a-text-dim)' }}>No bank details</span>
                          )}
                        </td>
                        <td style={{ ...num, fontWeight: row.payoutDue > 0 ? 650 : undefined }}>
                          {formatCurrency(row.payoutDue)}
                          {row.ordersDue > 0 && <span style={count}> · {row.ordersDue}</span>}
                          {row.ledgerBalance < 0 && (
                            <span
                              style={{ display: 'block', color: 'var(--a-bad)', fontSize: 12 }}
                              title="Returns reversed after a payout; deducted from future sales"
                            >
                              Owes {formatCurrency(-row.ledgerBalance)}
                            </span>
                          )}
                        </td>
                        <td style={num}>
                          {formatCurrency(row.payoutHeld)}
                          {row.ordersHeld > 0 && <span style={count}> · {row.ordersHeld}</span>}
                        </td>
                        <td style={num}>{formatCurrency(row.payoutSettled)}</td>
                        <td>
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="btn btn-sm"
                              aria-expanded={expanded === row.id && panel === 'orders'}
                              onClick={() => toggle(row.id, 'orders')}
                            >
                              {expanded === row.id && panel === 'orders' ? 'Hide orders' : 'Orders'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              aria-expanded={expanded === row.id && panel === 'statement'}
                              onClick={() => toggle(row.id, 'statement')}
                            >
                              {expanded === row.id && panel === 'statement'
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
                              }}
                            >
                              Adjust
                            </button>
                            {row.payoutDue > 0 && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={!row.canBePaid}
                                title={
                                  row.canBePaid ? undefined : 'This shop has not given bank details'
                                }
                                onClick={() => {
                                  setConfirming(row);
                                  setReference('');
                                }}
                              >
                                Settle
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded === row.id && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--a-surface-2)' }}>
                            {panel === 'orders' ? (
                              <ShopDetail vendorId={row.id} />
                            ) : (
                              <ShopStatement
                                vendorId={row.id}
                                shopSlug={row.shopSlug}
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

      {withdrawals.length > 0 && (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <p className="admin-kpi-label">Payout history</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Shop</th>
                  <th style={num}>Amount</th>
                  <th>Status</th>
                  <th>Reference</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((row) => (
                  <tr key={row.id}>
                    <td>{row.vendor?.shopName ?? '—'}</td>
                    <td style={num}>{formatCurrency(row.amount)}</td>
                    <td>
                      <span className="admin-status-badge" data-status={row.status}>
                        {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td>{row.transactionId ?? '—'}</td>
                    <td>{day(row.completedAt ?? row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adjusting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Adjust ledger for ${adjusting.shopName}`}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div className="admin-card" style={{ maxWidth: 460, width: '100%' }}>
            <p className="admin-kpi-label">Ledger adjustment</p>
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              {adjusting.shopName} · balance {formatCurrency(adjusting.ledgerBalance)}. A positive
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
              aria-label="Adjustment amount"
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
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div className="admin-card" style={{ maxWidth: 460, width: '100%' }}>
            <p className="admin-kpi-label">Settle payout</p>
            <p className="admin-kpi-value" style={{ fontSize: 24 }}>
              {formatCurrency(confirming.payoutDue)}
            </p>
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              {confirming.shopName} · {confirming.ordersDue} order
              {confirming.ordersDue === 1 ? '' : 's'} · {confirming.bankName ?? 'Bank'} ····
              {confirming.bankAccountLast4}
            </p>
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              The shop&rsquo;s ledger balance, net of any returns reversed since the last payout.
              This records the payment. Make the bank transfer first — it cannot be undone here.
            </p>

            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Bank reference (optional)"
              maxLength={120}
              aria-label="Bank reference"
              style={{ width: '100%' }}
            />

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
                disabled={isSettling}
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
