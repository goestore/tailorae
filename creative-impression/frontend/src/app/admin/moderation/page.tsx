'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  announceQueuesChanged,
  decideListing,
  getModerationQueue,
  type ModerationProduct,
  type ModerationStatus,
} from '@/lib/admin-moderation';
import { formatCurrency, formatDateTime } from '@/utils/helpers';
import { ShieldCheck } from '@/components/admin/icons';

/**
 * Listing moderation.
 *
 * Every new or edited seller listing lands here before shoppers can see it.
 * Oldest first, so the seller who has waited longest is next. A decision takes
 * the card off the screen immediately and puts it back only if the server
 * refuses — reviewing a queue should not stall on a round trip per item.
 */

const previewable = (value: string): boolean => value !== '' && /^[^"'()\s]+$/.test(value);

/** Photos are relative `/uploads/...` paths the storefront rewrites to the API. */
const Photo: React.FC<{ url: string; size: number; label?: string }> = ({ url, size, label }) => (
  <span
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    style={{
      display: 'block',
      flexShrink: 0,
      width: size,
      height: size,
      borderRadius: 'var(--a-radius-sm)',
      boxShadow: 'inset 0 0 0 1px var(--a-edge)',
      background: 'var(--a-surface-2)',
      backgroundImage: previewable(url) ? `url("${url}")` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}
  />
);

const excerpt = (product: ModerationProduct): string => {
  const text = (product.shortDescription || product.description || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--a-text-dim)',
  fontSize: 13,
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const COVER = 100;

/** A listing with no photo: a solid well with an image glyph, not a dashed box. */
const NoPhoto: React.FC = () => (
  <span
    role="img"
    aria-label="No photo"
    style={{
      display: 'grid',
      placeItems: 'center',
      width: COVER,
      height: COVER,
      borderRadius: 'var(--a-radius-sm)',
      background: '#f7f7f7',
      boxShadow: 'inset 0 0 0 1px var(--a-edge)',
      color: 'var(--a-text-faint)',
    }}
  >
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  </span>
);

const ListingCard: React.FC<{
  product: ModerationProduct;
  onDecide: (product: ModerationProduct, decision: 'approve' | 'reject', note?: string) => void;
  divided?: boolean;
}> = ({ product, onDecide, divided = false }) => {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const photos = Array.from(
    new Set([product.thumbnail, ...(product.images ?? [])].filter((url): url is string => !!url))
  );
  const [cover, ...rest] = photos;
  const text = excerpt(product);
  const noteId = `moderation-note-${product.id}`;
  const headingId = `moderation-title-${product.id}`;
  const vendor = product.vendor;

  return (
    <li style={divided ? { borderTop: '1px solid var(--a-edge)' } : undefined}>
      <article aria-labelledby={headingId} style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: '0 0 auto' }}>
            {cover ? (
              <Photo url={cover} size={COVER} label={`${product.name}, main photo`} />
            ) : (
              <NoPhoto />
            )}
            {rest.length > 0 && (
              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, maxWidth: COVER }}
              >
                {rest.slice(0, 6).map((url, index) => (
                  <Photo
                    key={url}
                    url={url}
                    size={30}
                    label={`${product.name}, photo ${index + 2}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h2
              id={headingId}
              style={{
                margin: '0 0 4px',
                fontSize: 14,
                fontWeight: 650,
                color: 'var(--a-text)',
                overflowWrap: 'anywhere',
              }}
            >
              {product.name}
            </h2>
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              {vendor ? vendor.shopName : 'House listing'}{' '}
              {vendor && (
                <span
                  className="admin-status-badge"
                  data-status={vendor.isVerified ? 'COMPLETED' : 'PENDING'}
                  style={{ marginLeft: 4 }}
                >
                  {vendor.isVerified ? 'Verified shop' : 'Shop not verified'}
                </span>
              )}
            </p>

            <dl
              className="admin-dl"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                maxWidth: 720,
                marginBottom: 12,
              }}
            >
              <Fact label="Price">
                {formatCurrency(Number(product.price) || 0)}
                {product.originalPrice && Number(product.originalPrice) > Number(product.price) && (
                  <span
                    style={{
                      marginLeft: 6,
                      color: 'var(--a-text-dim)',
                      textDecoration: 'line-through',
                    }}
                  >
                    {formatCurrency(Number(product.originalPrice))}
                  </span>
                )}
              </Fact>
              <Fact label="Category">
                {product.category?.name ?? '—'}
                {product.brand?.name ? ` · ${product.brand.name}` : ''}
                {/* Approving the listing does not approve its brand: the
                    brand stays off the shop's filters until it is. */}
                {product.brand && product.brand.isActive === false && (
                  <span
                    className="admin-status-badge"
                    data-status="PENDING"
                    style={{ display: 'inline-flex', marginTop: 4 }}
                  >
                    Brand not approved
                  </span>
                )}
              </Fact>
              <Fact label="SKU">
                <code>{product.sku ?? '—'}</code>
              </Fact>
              <Fact label="Stock">{product.quantity}</Fact>
              <Fact label="Updated">{formatDateTime(product.updatedAt)}</Fact>
            </dl>

            {text && (
              <p
                style={{
                  maxWidth: '72ch',
                  margin: '0 0 12px',
                  color: 'var(--a-text-dim)',
                  fontSize: 13,
                }}
              >
                {text}
              </p>
            )}

            {product.moderationStatus === 'REJECTED' && product.moderationNote && (
              <div className="admin-alert" style={{ marginBottom: 12 }}>
                <span>
                  <strong>Sent back:</strong> {product.moderationNote}
                </span>
              </div>
            )}

            {rejecting ? (
              <div>
                <label htmlFor={noteId} style={labelStyle}>
                  What should the seller fix? * (they will see this)
                </label>
                <textarea
                  id={noteId}
                  autoFocus
                  required
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. Photos show a different colour from the one listed."
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <div className="admin-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="btn" onClick={() => setRejecting(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={!note.trim()}
                    onClick={() => onDecide(product, 'reject', note.trim())}
                  >
                    Send back to seller
                  </button>
                </div>
              </div>
            ) : (
              <div className="admin-actions" style={{ flexWrap: 'wrap' }}>
                <Link
                  href={`/admin/products/${encodeURIComponent(product.id)}`}
                  className="btn btn-ghost"
                >
                  Preview<span className="sr-only"> full listing: {product.name}</span>
                </Link>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setRejecting(true);
                    setNote(product.moderationNote ?? '');
                  }}
                >
                  {product.moderationStatus === 'REJECTED' ? 'Edit note…' : 'Reject…'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onDecide(product, 'approve')}
                >
                  Approve
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    </li>
  );
};

export default function AdminModerationPage() {
  const [tab, setTab] = useState<ModerationStatus>('PENDING');
  const [products, setProducts] = useState<ModerationProduct[]>([]);
  const [counts, setCounts] = useState({ pending: 0, rejected: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    (status: ModerationStatus) =>
      getModerationQueue(status)
        .then((queue) => {
          setProducts(queue.products);
          setCounts(queue.counts);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  const decide = async (
    product: ModerationProduct,
    decision: 'approve' | 'reject',
    note?: string
  ) => {
    const fromTab = tab;
    // Optimistic: off the list and out of the count now, back in on failure.
    setProducts((rows) => rows.filter((row) => row.id !== product.id));
    setCounts((previous) => {
      const next = { ...previous };
      if (fromTab === 'PENDING') next.pending = Math.max(0, next.pending - 1);
      else next.rejected = Math.max(0, next.rejected - 1);
      if (decision === 'reject' && fromTab === 'PENDING') next.rejected += 1;
      return next;
    });
    setNotice(null);
    setError(null);
    try {
      const message = await decideListing(product.id, decision, note);
      setNotice(`${product.name}: ${message}`);
      announceQueuesChanged();
      // A re-rejection from the Rejected tab keeps it in that queue.
      if (decision === 'reject' && fromTab === 'REJECTED') void load(fromTab);
    } catch (err) {
      setError(`${product.name}: ${(err as Error).message}`);
      void load(fromTab);
    }
  };

  const tabs: Array<{ key: ModerationStatus; label: string; count: number }> = [
    { key: 'PENDING', label: 'Pending', count: counts.pending },
    { key: 'REJECTED', label: 'Rejected', count: counts.rejected },
  ];

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Moderation</h1>
          <p className="admin-page-sub">
            Seller listings waiting for review. Nothing here is visible to shoppers until it is
            approved; a rejected listing goes back to the seller with your note.
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

      <div className="admin-card admin-index">
        <div className="admin-toolbar" role="group" aria-label="Review queue">
          {tabs.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={tab === option.key}
              onClick={() => {
                if (tab === option.key) return;
                setNotice(null);
                // Loading is raised here rather than in the effect, so the
                // effect only subscribes to the server and never sets state
                // synchronously.
                setIsLoading(true);
                setProducts([]);
                setTab(option.key);
              }}
              className={`filter-pill${tab === option.key ? ' filter-pill--active' : ''}`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>

        {isLoading && products.length === 0 ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading…</p>
          </div>
        ) : products.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">
              <ShieldCheck size={22} />
            </div>
            <p className="admin-empty-title">
              {tab === 'PENDING' ? 'The queue is clear' : 'Nothing rejected'}
            </p>
            <p className="admin-empty-text">
              {tab === 'PENDING'
                ? 'Every seller listing has been reviewed. New submissions will appear here.'
                : 'No listings are waiting on a seller to fix them.'}
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {products.map((product, index) => (
              <ListingCard
                key={product.id}
                product={product}
                onDecide={decide}
                divided={index > 0}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
