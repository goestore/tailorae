'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BUSINESS_TYPE_LABELS,
  SELLER_STATUS_LABEL,
  getSellers,
  setApplicationsOpen,
  setSellerCommission,
  type AdminShop,
  type SellerStatus,
} from '@/lib/admin-sellers';
import { getPlatformSettings } from '@/lib/admin-settings';
import { announceQueuesChanged } from '@/lib/admin-moderation';
import { useCan } from '@/components/admin/StaffContext';
import { formatDateTime } from '@/utils/helpers';
import { Store } from '@/components/admin/icons';
import { ApplicationPanel, SellerStatusBadge } from './ApplicationPanel';

/**
 * Seller businesses.
 *
 * Sellers register and submit their own applications; this screen is where
 * staff review them (KYC_REVIEW) — business details, KYC documents, the
 * masked bank account and the decision — and where FINANCE sets a shop's own
 * commission. SUPPORT and FINANCE see the list without the review panel.
 * Approval is the gate that matters: until then nothing of the shop's reaches
 * shoppers, and suspending takes it all down again.
 */

/**
 * A table inside a zero-padding index card. The global rule that pulls a
 * table out to a padded card's edges (-16px margins) must not apply here.
 */
const flush: React.CSSProperties = { width: '100%', margin: 0 };

/** One line, cut with an ellipsis: table cells never wrap. */
const truncate: React.CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const dimLine: React.CSSProperties = { ...truncate, color: 'var(--a-text-dim)', fontSize: 12 };

/** The order staff work in: what is waiting on a decision first. */
const FILTERS: Array<{ key: SellerStatus | ''; label: string }> = [
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_REVIEW', label: 'Under review' },
  { key: 'NEEDS_INFO', label: 'Needs info' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'DRAFT', label: 'Draft' },
  { key: '', label: 'All' },
];

const PAGE_SIZE = 25;

const rateLabel = (rateBp: number | null) =>
  rateBp === null ? 'Category default' : `${rateBp / 100}% (custom)`;

export default function AdminSellersPage() {
  const can = useCan();
  const canReview = can('KYC_REVIEW');
  const canFinance = can('FINANCE');
  const canSeeSettings = can('KYC_REVIEW', 'FINANCE');

  const [status, setStatus] = useState<SellerStatus | ''>('SUBMITTED');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminShop[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The shop whose commission is being edited, and the value being typed.
  const [editing, setEditing] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [customRate, setCustomRate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [applicationsOpen, setOpen] = useState<boolean | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const load = useCallback(
    () =>
      getSellers({ status, q, page, limit: PAGE_SIZE })
        .then((result) => {
          setRows(result?.items ?? []);
          setTotal(result?.total ?? 0);
          setPages(Math.max(1, result?.pages ?? 1));
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    [status, q, page]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Server-side search: one request per pause in typing, not per keystroke.
  useEffect(() => {
    const needle = searchInput.trim();
    if (needle === q) return;
    const timer = setTimeout(() => {
      setQ(needle);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, q]);

  useEffect(() => {
    if (!canSeeSettings) return;
    let cancelled = false;
    getPlatformSettings()
      .then((settings) => !cancelled && setOpen(Boolean(settings['seller.applications_open'])))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSeeSettings]);

  const toggleApplications = async () => {
    if (applicationsOpen === null) return;
    setIsToggling(true);
    setError(null);
    try {
      setNotice(await setApplicationsOpen(!applicationsOpen));
      setOpen(!applicationsOpen);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsToggling(false);
    }
  };

  const saveCommission = async (shop: AdminShop) => {
    const value = Number(rate);
    if (customRate && (rate.trim() === '' || !Number.isFinite(value) || value < 0 || value > 100)) {
      setError('Commission must be a number from 0 to 100.');
      return;
    }
    setBusyId(shop.id);
    setError(null);
    try {
      const saved = await setSellerCommission(shop.id, customRate ? Math.round(value * 100) : null);
      setNotice(
        `${shop.shopName}: commission set to ${rateLabel(saved?.commissionRateBp ?? null).toLowerCase()}.`
      );
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const firstOnPage = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(total, (page - 1) * PAGE_SIZE + rows.length);
  const filterLabel = FILTERS.find((filter) => filter.key === status)?.label ?? 'All';

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Sellers</h1>
          <p className="admin-page-sub">
            Marketplace shops and their applications. A shop sells only once its application is
            approved; suspending one takes its listings down straight away.
          </p>
        </div>
        {canSeeSettings && applicationsOpen !== null && (
          <div className="admin-page-actions">
            <label
              className="admin-kpi-sub"
              style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}
              title={canReview ? undefined : 'Needs the KYC review permission'}
            >
              <input
                type="checkbox"
                role="switch"
                aria-checked={applicationsOpen}
                checked={applicationsOpen}
                disabled={isToggling || !canReview}
                onChange={() => void toggleApplications()}
              />
              {isToggling
                ? 'Saving…'
                : applicationsOpen
                  ? 'Seller sign-ups open'
                  : 'Seller sign-ups closed (by invitation)'}
            </label>
          </div>
        )}
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

      {openId && canReview && (
        <ApplicationPanel
          key={openId}
          sellerId={openId}
          onClose={() => setOpenId(null)}
          onDecided={(message) => {
            setNotice(message);
            announceQueuesChanged();
            void load();
          }}
        />
      )}

      <div className="admin-card admin-index">
        <div className="admin-toolbar" role="group" aria-label="Filter sellers">
          <input
            type="search"
            aria-label="Search sellers"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search shop, legal name or email"
          />
          {FILTERS.map((option) => (
            <button
              key={option.key || 'all'}
              type="button"
              aria-pressed={status === option.key}
              onClick={() => {
                setStatus(option.key);
                setPage(1);
              }}
              className={`filter-pill${status === option.key ? ' filter-pill--active' : ''}`}
            >
              {option.label}
            </button>
          ))}
          {rows.length > 0 && (
            <span className="admin-toolbar-meta" style={{ marginLeft: 'auto' }}>
              {firstOnPage}–{lastOnPage} of {total}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading sellers…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">
              <Store size={22} />
            </div>
            <p className="admin-empty-title">
              {q
                ? 'No matches'
                : status
                  ? `No ${filterLabel.toLowerCase()} sellers`
                  : 'No sellers yet'}
            </p>
            <p className="admin-empty-text">
              {q
                ? 'Try a different search.'
                : status === 'SUBMITTED'
                  ? 'Every submitted application has been picked up.'
                  : 'Sellers appear here once they register a business.'}
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap" style={flush}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Business</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Commission</th>
                  <th>Submitted</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((shop) => (
                  <tr key={shop.id}>
                    <td style={{ maxWidth: 220 }}>
                      <span className="admin-row-title" style={truncate} title={shop.shopName}>
                        {shop.shopName}
                      </span>
                      <span style={dimLine}>/sellers/{shop.shopSlug}</span>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <span style={truncate} title={shop.legalName ?? undefined}>
                        {shop.legalName ?? '—'}
                      </span>
                      <span style={dimLine}>
                        {shop.businessType
                          ? (BUSINESS_TYPE_LABELS[shop.businessType] ?? shop.businessType)
                          : ''}
                      </span>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <span style={truncate} title={shop.contactEmail ?? undefined}>
                        {shop.contactEmail ?? '—'}
                      </span>
                      <span style={dimLine}>{shop.contactPhone ?? ''}</span>
                    </td>
                    <td>
                      <SellerStatusBadge status={shop.status} />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {editing === shop.id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <select
                            value={customRate ? 'custom' : 'default'}
                            aria-label={`Commission source for ${shop.shopName}`}
                            onChange={(event) => setCustomRate(event.target.value === 'custom')}
                          >
                            <option value="default">Category default</option>
                            <option value="custom">Custom rate</option>
                          </select>
                          {customRate && (
                            <input
                              autoFocus
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              value={rate}
                              aria-label={`Commission % for ${shop.shopName}`}
                              onChange={(event) => setRate(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void saveCommission(shop);
                                if (event.key === 'Escape') setEditing(null);
                              }}
                              style={{ width: 72 }}
                            />
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={busyId === shop.id || (customRate && rate.trim() === '')}
                            onClick={() => void saveCommission(shop)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : canFinance ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          title="Edit commission"
                          aria-label={`Edit commission for ${shop.shopName}, currently ${rateLabel(shop.commissionRateBp)}`}
                          onClick={() => {
                            setEditing(shop.id);
                            setCustomRate(shop.commissionRateBp !== null);
                            setRate(
                              shop.commissionRateBp === null
                                ? ''
                                : String(shop.commissionRateBp / 100)
                            );
                          }}
                        >
                          {rateLabel(shop.commissionRateBp)}
                        </button>
                      ) : (
                        rateLabel(shop.commissionRateBp)
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {shop.submittedAt ? formatDateTime(shop.submittedAt) : '—'}
                    </td>
                    <td>
                      {canReview && (
                        <div className="admin-actions">
                          <button
                            type="button"
                            className={
                              shop.status === 'SUBMITTED' || shop.status === 'UNDER_REVIEW'
                                ? 'btn btn-sm btn-primary'
                                : 'btn btn-sm'
                            }
                            aria-expanded={openId === shop.id}
                            aria-label={`Application for ${shop.shopName}`}
                            onClick={() =>
                              setOpenId((current) => (current === shop.id ? null : shop.id))
                            }
                          >
                            {openId === shop.id
                              ? 'Close'
                              : shop.status === 'SUBMITTED' || shop.status === 'UNDER_REVIEW'
                                ? 'Review'
                                : 'Application'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-index-footer">
          <p style={{ margin: 0, color: 'var(--a-text-dim)', fontSize: 12 }}>
            A commission change applies to orders placed afterwards — every shop part keeps the rate
            it was charged. Statuses: {Object.values(SELLER_STATUS_LABEL).join(' · ')}.
          </p>
          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="admin-toolbar-meta">
                Page {page} of {pages}
              </span>
              <button
                type="button"
                className="btn"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn"
                disabled={page >= pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
