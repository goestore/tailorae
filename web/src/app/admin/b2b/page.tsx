'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BULK_ORDER_STATUSES,
  decideRfq,
  getAdminB2BProfiles,
  getAdminBulkOrders,
  getAdminRfqs,
  setB2BProfileVerified,
  setBulkOrderStatus,
  type AdminB2BProfile,
  type AdminBulkOrder,
  type AdminRfq,
  type RfqCounts,
} from '@/lib/admin-b2b';
import type { RfqStatus } from '@/lib/b2b-api';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/helpers';
import { Boxes, Ticket, Users } from '@/components/admin/icons';

/**
 * A table inside a zero-padding index card. The global rule that pulls a
 * table out to a padded card's edges (-16px margins) must not apply here.
 */
const flush: React.CSSProperties = { width: '100%', margin: 0 };

/**
 * Wholesale desk.
 *
 * Quote requests arrive from the public B2B page. An admin prices each one by
 * hand (a unit price, how long it holds, a note); the buyer accepts or
 * declines from their business account, and an accepted quote becomes a bulk
 * order. Profiles are self-made and start unverified — verifying one is what
 * grants the B2B_BUYER role and wholesale pricing.
 */

type View = 'rfqs' | 'profiles' | 'bulk';

const RFQ_TABS: Array<{ key: RfqStatus; label: string }> = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'QUOTED', label: 'Quoted' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'EXPIRED', label: 'Expired' },
];

const EMPTY_COUNTS: RfqCounts = { PENDING: 0, QUOTED: 0, ACCEPTED: 0, REJECTED: 0, EXPIRED: 0 };

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--a-text-dim)',
  fontSize: 13,
  letterSpacing: '-0.005em',
};

/** Badge colours exist for the order vocabulary; map RFQ states onto it. */
const badgeStatus = (status: string): string =>
  ({ QUOTED: 'PROCESSING', ACCEPTED: 'COMPLETED', EXPIRED: 'CANCELLED' })[status] ?? status;

const isoDateIn = (days: number): string => {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const personName = (user: AdminRfq['b2bProfile']['user']): string =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const sentence = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, ' ');

const dim: React.CSSProperties = { display: 'block', color: 'var(--a-text-dim)', fontSize: 12 };

/** Empty state shared by the three views. */
const Empty: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({
  icon,
  title,
  text,
}) => (
  <div className="admin-empty">
    <div className="admin-empty-icon">{icon}</div>
    <p className="admin-empty-title">{title}</p>
    <p className="admin-empty-text">{text}</p>
  </div>
);

const Loading: React.FC = () => (
  <div className="admin-empty">
    <p className="admin-empty-text">Loading…</p>
  </div>
);

const RfqCard: React.FC<{
  rfq: AdminRfq;
  onDecide: (rfq: AdminRfq, input: Parameters<typeof decideRfq>[1]) => Promise<boolean>;
  divided?: boolean;
}> = ({ rfq, onDecide, divided = false }) => {
  const answerable =
    rfq.status === 'PENDING' || rfq.status === 'QUOTED' || rfq.status === 'EXPIRED';
  const [mode, setMode] = useState<'idle' | 'quote' | 'reject'>('idle');
  const [price, setPrice] = useState(
    rfq.quotedPrice !== null
      ? String(rfq.quotedPrice)
      : rfq.desiredPrice !== null
        ? String(rfq.desiredPrice)
        : ''
  );
  const [expiry, setExpiry] = useState(isoDateIn(14));
  const [notes, setNotes] = useState(rfq.notes ?? '');
  const [busy, setBusy] = useState(false);
  const headingId = `rfq-title-${rfq.id}`;
  const profile = rfq.b2bProfile;
  const unit = Number(price);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const ok = await onDecide(
      rfq,
      mode === 'quote'
        ? {
            status: 'QUOTED',
            quotedPrice: unit,
            expiryDate: expiry,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }
        : { status: 'REJECTED', notes: notes.trim() }
    );
    setBusy(false);
    if (ok) setMode('idle');
  };

  return (
    <li style={divided ? { borderTop: '1px solid var(--a-edge)' } : undefined}>
      <article aria-labelledby={headingId} style={{ padding: 16 }}>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id={headingId}
              style={{
                margin: '0 0 2px',
                fontSize: 14,
                fontWeight: 650,
                color: 'var(--a-text)',
                overflowWrap: 'anywhere',
              }}
            >
              {rfq.product?.name ?? 'Product no longer listed'}
            </h2>
            <p style={{ margin: 0, color: 'var(--a-text-dim)', fontSize: 12 }}>
              {rfq.rfqNumber} · received {formatDateTime(rfq.createdAt)}
            </p>
          </div>
          <span
            className="admin-status-badge"
            data-status={badgeStatus(rfq.status)}
            style={{ alignSelf: 'flex-start' }}
          >
            {sentence(rfq.status)}
          </span>
        </div>

        <dl className="admin-dl" style={{ margin: '12px 0' }}>
          <Fact label="Company">
            {profile.companyName}{' '}
            <span
              className="admin-status-badge"
              data-status={profile.isVerified ? 'COMPLETED' : 'PENDING'}
              style={{ marginLeft: 4 }}
            >
              {profile.isVerified ? 'Verified' : 'Unverified'}
            </span>
          </Fact>
          <Fact label="Contact">
            {personName(profile.user)}
            <br />
            <a href={`mailto:${profile.user.email}`} style={{ color: 'var(--a-text-dim)' }}>
              {profile.user.email}
            </a>
            {profile.user.phone ? (
              <>
                <br />
                {profile.user.phone}
              </>
            ) : null}
          </Fact>
          <Fact label="GSTIN">{profile.gstNumber ?? '—'}</Fact>
          <Fact label="Quantity">{rfq.quantity.toLocaleString('en-IN')}</Fact>
          <Fact label="List price">
            {rfq.product ? `${formatCurrency(rfq.product.price)}/pc` : '—'}
          </Fact>
          <Fact label="Target price">
            {rfq.desiredPrice !== null ? `${formatCurrency(rfq.desiredPrice)}/pc` : '—'}
          </Fact>
          <Fact label="Needed by">{rfq.deliveryDate ? formatDate(rfq.deliveryDate) : '—'}</Fact>
          {rfq.quotedPrice !== null && (
            <Fact label="Quoted">
              {formatCurrency(rfq.quotedPrice)}/pc ·{' '}
              {formatCurrency(rfq.quotedPrice * rfq.quantity)} total
              {rfq.expiryDate ? ` · until ${formatDate(rfq.expiryDate)}` : ''}
            </Fact>
          )}
        </dl>

        {rfq.specialRequirements && (
          <p
            style={{
              maxWidth: '72ch',
              margin: '0 0 12px',
              color: 'var(--a-text-dim)',
              fontSize: 13,
              overflowWrap: 'anywhere',
            }}
          >
            {rfq.specialRequirements}
          </p>
        )}
        {rfq.notes && mode === 'idle' && (
          <div className="admin-alert" style={{ marginBottom: 12 }}>
            <span>
              <strong>Note to buyer:</strong> {rfq.notes}
            </span>
          </div>
        )}

        {answerable && mode === 'idle' && (
          <div className="admin-actions">
            <button type="button" className="btn" onClick={() => setMode('reject')}>
              Decline
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setMode('quote')}>
              {rfq.status === 'PENDING' ? 'Send quote' : 'Re-quote'}
            </button>
          </div>
        )}

        {mode !== 'idle' && (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            {mode === 'quote' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <label htmlFor={`rfq-price-${rfq.id}`} style={labelStyle}>
                    Unit price (₹) *
                  </label>
                  <input
                    id={`rfq-price-${rfq.id}`}
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    autoFocus
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label htmlFor={`rfq-expiry-${rfq.id}`} style={labelStyle}>
                    Valid until *
                  </label>
                  <input
                    id={`rfq-expiry-${rfq.id}`}
                    type="date"
                    required
                    min={isoDateIn(1)}
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ alignSelf: 'end' }}>
                  <p className="admin-kpi-sub">Total</p>
                  <p style={{ margin: 0, color: 'var(--a-text)', fontWeight: 600 }}>
                    {Number.isFinite(unit) && unit > 0 ? formatCurrency(unit * rfq.quantity) : '—'}
                  </p>
                </div>
              </div>
            )}
            <div>
              <label htmlFor={`rfq-notes-${rfq.id}`} style={labelStyle}>
                {mode === 'quote'
                  ? 'Note to buyer (terms, lead time)'
                  : 'Why is this declined? * (the buyer sees this)'}
              </label>
              <textarea
                id={`rfq-notes-${rfq.id}`}
                rows={3}
                maxLength={2000}
                required={mode === 'reject'}
                autoFocus={mode === 'reject'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div className="admin-actions">
              <button type="button" className="btn" onClick={() => setMode('idle')} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className={mode === 'quote' ? 'btn btn-primary' : 'btn btn-danger'}
                disabled={busy || (mode === 'quote' ? !(unit > 0) : !notes.trim())}
              >
                {busy ? 'Saving…' : mode === 'quote' ? 'Send quote' : 'Decline request'}
              </button>
            </div>
          </form>
        )}
      </article>
    </li>
  );
};

const RfqsView: React.FC<{ onCounts: (counts: RfqCounts) => void }> = ({ onCounts }) => {
  const [tab, setTab] = useState<RfqStatus>('PENDING');
  const [rfqs, setRfqs] = useState<AdminRfq[]>([]);
  const [counts, setCounts] = useState<RfqCounts>(EMPTY_COUNTS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    (status: RfqStatus) =>
      getAdminRfqs(status)
        .then((data) => {
          setRfqs(data.rfqs);
          setCounts(data.counts);
          onCounts(data.counts);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    [onCounts]
  );

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  const decide = async (
    rfq: AdminRfq,
    input: Parameters<typeof decideRfq>[1]
  ): Promise<boolean> => {
    setNotice(null);
    setError(null);
    try {
      const { message } = await decideRfq(rfq.id, input);
      setNotice(message);
      void load(tab);
      return true;
    } catch (err) {
      setError(`${rfq.rfqNumber}: ${(err as Error).message}`);
      return false;
    }
  };

  return (
    <section aria-label="Quote requests">
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

      <div className="admin-card admin-index">
        <div className="admin-toolbar" role="group" aria-label="Status">
          {RFQ_TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={tab === option.key}
              className={`filter-pill${tab === option.key ? ' filter-pill--active' : ''}`}
              onClick={() => {
                if (tab === option.key) return;
                setNotice(null);
                setIsLoading(true);
                setRfqs([]);
                setTab(option.key);
              }}
            >
              {option.label} ({counts[option.key]})
            </button>
          ))}
        </div>

        {isLoading && rfqs.length === 0 ? (
          <Loading />
        ) : rfqs.length === 0 ? (
          <Empty
            icon={<Ticket size={22} />}
            title={tab === 'PENDING' ? 'No requests waiting' : `No ${tab.toLowerCase()} requests`}
            text={
              tab === 'PENDING'
                ? 'New quote requests from the B2B page will appear here.'
                : `Quote requests marked ${tab.toLowerCase()} will appear here.`
            }
          />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rfqs.map((rfq, index) => (
              <RfqCard
                key={`${rfq.id}-${rfq.status}`}
                rfq={rfq}
                onDecide={decide}
                divided={index > 0}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

const ProfilesView: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [filter, setFilter] = useState<'all' | 'unverified' | 'verified'>('unverified');
  const [profiles, setProfiles] = useState<AdminB2BProfile[]>([]);
  const [counts, setCounts] = useState({ verified: 0, unverified: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    (which: typeof filter) =>
      getAdminB2BProfiles({ verified: which === 'all' ? undefined : which === 'verified' })
        .then((data) => {
          setProfiles(data.profiles);
          setCounts(data.counts);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  const toggle = async (profile: AdminB2BProfile) => {
    setBusyId(profile.id);
    setNotice(null);
    setError(null);
    try {
      const { message } = await setB2BProfileVerified(profile.id, !profile.isVerified);
      setNotice(message);
      onChanged();
      void load(filter);
    } catch (err) {
      setError(`${profile.companyName}: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const pills: Array<{ key: typeof filter; label: string }> = [
    { key: 'unverified', label: `Unverified (${counts.unverified})` },
    { key: 'verified', label: `Verified (${counts.verified})` },
    { key: 'all', label: `All (${counts.verified + counts.unverified})` },
  ];

  return (
    <section aria-label="Business profiles">
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

      <div className="admin-card admin-index">
        <div className="admin-toolbar" role="group" aria-label="Verification">
          {pills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              aria-pressed={filter === pill.key}
              className={`filter-pill${filter === pill.key ? ' filter-pill--active' : ''}`}
              onClick={() => {
                if (filter === pill.key) return;
                setIsLoading(true);
                setProfiles([]);
                setFilter(pill.key);
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>
        {isLoading && profiles.length === 0 ? (
          <Loading />
        ) : profiles.length === 0 ? (
          <Empty
            icon={<Users size={22} />}
            title="No business profiles here"
            text={
              filter === 'unverified'
                ? 'Every business profile has been reviewed.'
                : 'Profiles appear when a buyer registers a company from the B2B page.'
            }
          />
        ) : (
          <div className="admin-table-wrap" style={flush}>
            <table className="admin-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>GSTIN / PAN</th>
                  <th>Activity</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <span className="admin-row-title">{profile.companyName}</span>
                      <span style={dim}>
                        {profile.businessType}
                        {profile.businessCategory ? ` · ${profile.businessCategory}` : ''} · since{' '}
                        {formatDate(profile.createdAt)}
                      </span>
                    </td>
                    <td>
                      {personName(profile.user)}
                      <span style={dim}>{profile.user.email}</span>
                    </td>
                    <td>
                      {profile.gstNumber ?? '—'}
                      <span style={dim}>{profile.panNumber ?? '—'}</span>
                    </td>
                    <td>
                      {profile._count.rfqs} RFQ{profile._count.rfqs === 1 ? '' : 's'}
                      <span style={dim}>
                        {profile._count.bulkOrders} bulk order
                        {profile._count.bulkOrders === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td>
                      <span
                        className="admin-status-badge"
                        data-status={profile.isVerified ? 'COMPLETED' : 'PENDING'}
                      >
                        {profile.isVerified ? 'Verified' : 'Unverified'}
                      </span>
                      <span style={dim}>{sentence(profile.user.role)}</span>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className={profile.isVerified ? 'btn btn-sm' : 'btn btn-sm btn-primary'}
                          style={{ minWidth: 76 }}
                          disabled={busyId === profile.id}
                          aria-pressed={profile.isVerified}
                          onClick={() => toggle(profile)}
                        >
                          {busyId === profile.id
                            ? 'Saving…'
                            : profile.isVerified
                              ? 'Unverify'
                              : 'Verify'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-index-footer">
          <p style={{ margin: 0, color: 'var(--a-text-dim)', fontSize: 12 }}>
            Verifying a retail customer&apos;s profile makes them a B2B buyer (wholesale tier
            pricing, trade coupons). Admin and seller accounts keep their role.
          </p>
        </div>
      </div>
    </section>
  );
};

const BulkOrdersView: React.FC = () => {
  const [orders, setOrders] = useState<AdminBulkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getAdminBulkOrders()
        .then((rows) => {
          setOrders(rows);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (order: AdminBulkOrder, status: string) => {
    setBusyId(order.id);
    setNotice(null);
    setError(null);
    try {
      const { message } = await setBulkOrderStatus(order.id, status);
      setNotice(message);
    } catch (err) {
      setError(`${order.orderNumber}: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
      void load();
    }
  };

  return (
    <section aria-label="Bulk orders">
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
      <div className="admin-card admin-index">
        <div className="admin-toolbar">
          <span className="admin-toolbar-meta" style={{ padding: '6px 0' }}>
            {isLoading
              ? 'Loading bulk orders…'
              : `${orders.length} bulk order${orders.length === 1 ? '' : 's'} · newest first`}
          </span>
        </div>
        {isLoading && orders.length === 0 ? (
          <Loading />
        ) : orders.length === 0 ? (
          <Empty
            icon={<Boxes size={22} />}
            title="No bulk orders yet"
            text="When a buyer accepts a quote it becomes a bulk order here."
          />
        ) : (
          <div className="admin-table-wrap" style={flush}>
            <table className="admin-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Company</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const closed = order.status === 'DELIVERED' || order.status === 'CANCELLED';
                  return (
                    <tr key={order.id}>
                      <td>
                        <span className="admin-row-title">{order.orderNumber}</span>
                        <span style={dim}>{formatDate(order.createdAt)}</span>
                      </td>
                      <td>{order.b2bProfile.companyName}</td>
                      <td>{order.product?.name ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {order.quantity.toLocaleString('en-IN')}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {formatCurrency(order.totalPrice)}
                        <span style={dim}>{formatCurrency(order.unitPrice)}/pc</span>
                      </td>
                      <td>
                        {closed ? (
                          <span className="admin-status-badge" data-status={order.status}>
                            {sentence(order.status)}
                          </span>
                        ) : (
                          <select
                            aria-label={`Status of ${order.orderNumber}`}
                            value={order.status}
                            disabled={busyId === order.id}
                            onChange={(e) => changeStatus(order, e.target.value)}
                          >
                            {BULK_ORDER_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.charAt(0) + s.slice(1).toLowerCase()}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default function AdminB2BPage() {
  const [view, setView] = useState<View>('rfqs');
  const [rfqCounts, setRfqCounts] = useState<RfqCounts>(EMPTY_COUNTS);
  const [unverified, setUnverified] = useState<number | null>(null);

  const refreshProfileCount = useCallback(
    () =>
      getAdminB2BProfiles({ verified: false })
        .then((data) => setUnverified(data.counts.unverified))
        .catch(() => undefined),
    []
  );

  useEffect(() => {
    void refreshProfileCount();
  }, [refreshProfileCount]);

  const views: Array<{ key: View; label: string }> = [
    { key: 'rfqs', label: 'Quote requests' },
    { key: 'profiles', label: 'Profiles' },
    { key: 'bulk', label: 'Bulk orders' },
  ];

  const kpis: Array<{ label: string; value: number | null; sub: string }> = [
    { label: 'Awaiting a quote', value: rfqCounts.PENDING, sub: 'Oldest first' },
    { label: 'Quoted', value: rfqCounts.QUOTED, sub: 'Waiting on the buyer' },
    { label: 'Accepted', value: rfqCounts.ACCEPTED, sub: 'Turned into bulk orders' },
    { label: 'Unverified profiles', value: unverified, sub: 'Not yet wholesale buyers' },
  ];

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">B2B &amp; wholesale</h1>
          <p className="admin-page-sub">
            Price quote requests from business buyers, verify their company profiles, and track the
            bulk orders accepted quotes become.
          </p>
        </div>
      </div>

      <div className="admin-grid-kpi" style={{ marginBottom: 16 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="admin-card">
            <p className="admin-kpi-label">{kpi.label}</p>
            <p className="admin-kpi-value">{kpi.value ?? '—'}</p>
            <p className="admin-kpi-sub">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div
        role="group"
        aria-label="Section"
        className="admin-segmented-control"
        style={{ marginBottom: 12, maxWidth: '100%', overflowX: 'auto' }}
      >
        {views.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={view === option.key}
            onClick={() => setView(option.key)}
            className={`admin-segmented-item${view === option.key ? ' admin-segmented-item--active' : ''}`}
            style={{
              border: 0,
              background: view === option.key ? undefined : 'transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === 'rfqs' && <RfqsView onCounts={setRfqCounts} />}
      {view === 'profiles' && <ProfilesView onChanged={refreshProfileCount} />}
      {view === 'bulk' && <BulkOrdersView />}
    </div>
  );
}
