'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  listCustomWearQuotes,
  updateCustomWearQuote,
  type AdminCustomWearQuote,
  type AdminQuoteStatus,
  type QuoteCounts,
} from '@/lib/admin-custom-wear';
import { formatCurrency, formatDateTime } from '@/utils/helpers';
import { FileEdit } from '@/components/admin/icons';

/**
 * A table inside a zero-padding index card. The global rule that pulls a
 * table out to a padded card's edges (-16px margins) must not apply here.
 */
const flush: React.CSSProperties = { width: '100%', margin: 0 };

/**
 * Custom Wear quote requests.
 *
 * Every request for a custom printed or embroidered garment lands here, from
 * the product page or from the cart's custom-wear section. The team works each
 * one from New to Won or Lost, recording the price they quoted. Changes are
 * audit-logged on the server.
 */

type Tab = AdminQuoteStatus | 'ALL';

/** The admin status pill is keyed by order statuses; map ours onto its colours. */
const BADGE_STATUS: Record<AdminQuoteStatus, string> = {
  NEW: 'PENDING',
  CONTACTED: 'PROCESSING',
  QUOTED: 'CONFIRMED',
  WON: 'COMPLETED',
  LOST: 'CANCELLED',
};

const StatusBadge: React.FC<{ status: AdminQuoteStatus }> = ({ status }) => (
  <span className="admin-status-badge" data-status={BADGE_STATUS[status] ?? 'PENDING'}>
    {QUOTE_STATUS_LABELS[status] ?? status}
  </span>
);

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

const sectionHeading: React.CSSProperties = {
  margin: '20px 0 8px',
  fontSize: 13,
  fontWeight: 650,
  color: 'var(--a-text)',
};

const dlNarrow: React.CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
};

const fileLabel = (url: string, index: number): string => {
  const ext = url.split('.').pop()?.toUpperCase() ?? 'FILE';
  return `Artwork ${index + 1} (${ext})`;
};

const QuoteDetail: React.FC<{
  quote: AdminCustomWearQuote;
  onSaved: (quote: AdminCustomWearQuote) => void;
  onClose: () => void;
}> = ({ quote, onSaved, onClose }) => {
  const [status, setStatus] = useState<AdminQuoteStatus>(quote.status);
  const [price, setPrice] = useState(quote.quotedPrice != null ? String(quote.quotedPrice) : '');
  const [notes, setNotes] = useState(quote.adminNotes ?? '');
  const [isSaving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const dirty =
    status !== quote.status ||
    price.trim() !== (quote.quotedPrice != null ? String(quote.quotedPrice) : '') ||
    notes.trim() !== (quote.adminNotes ?? '');

  const save = async () => {
    const trimmed = price.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setMessage({ tone: 'error', text: 'Quoted price must be a positive number.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateCustomWearQuote(quote.id, {
        status,
        quotedPrice: parsed,
        adminNotes: notes.trim() || null,
      });
      onSaved(updated);
      setMessage({ tone: 'ok', text: 'Saved.' });
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const headingId = `cwq-detail-${quote.id}`;

  return (
    <article className="admin-card" aria-labelledby={headingId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2
            id={headingId}
            style={{ margin: 0, fontSize: 15, fontWeight: 650, color: 'var(--a-text)' }}
          >
            {quote.reference}
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--a-text-dim)', fontSize: 12 }}>
            Received {formatDateTime(quote.createdAt)}
            {quote.userId ? ' · signed-in customer' : ' · guest'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge status={quote.status} />
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <h3 style={sectionHeading}>Customer</h3>
      <dl className="admin-dl" style={dlNarrow}>
        <Fact label="Name">{quote.customerName}</Fact>
        <Fact label="Company">{quote.company || '—'}</Fact>
        <Fact label="Email">
          <a
            href={`mailto:${quote.email}?subject=${encodeURIComponent(`Your quote ${quote.reference}`)}`}
            style={{ color: 'var(--a-accent)' }}
          >
            {quote.email}
          </a>
        </Fact>
        <Fact label="Phone">{quote.phone || '—'}</Fact>
        <Fact label="Country / postcode">
          {quote.country}
          {quote.postcode ? ` · ${quote.postcode}` : ''}
        </Fact>
        <Fact label="Needed by">{quote.requiredBy || '—'}</Fact>
      </dl>

      <h3 style={sectionHeading}>Garment</h3>
      <dl className="admin-dl" style={dlNarrow}>
        <Fact label="Product">
          <a
            href={`/custom-wear/product/${quote.productSlug}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--a-accent)' }}
          >
            {quote.productName}
          </a>
        </Fact>
        <Fact label="SKU">
          <code>{quote.sku}</code>
        </Fact>
        <Fact label="Colour">{quote.colorName || '—'}</Fact>
        <Fact label="Sizes">{quote.sizes.length ? quote.sizes.join(', ') : '—'}</Fact>
        <Fact label="Quantity">{quote.quantity}</Fact>
        <Fact label="Method">{quote.method || '—'}</Fact>
        <Fact label="Locations">{quote.locations.length ? quote.locations.join(', ') : '—'}</Fact>
      </dl>

      <h3 style={sectionHeading}>Artwork ({quote.designFiles.length})</h3>
      {quote.designFiles.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--a-text-dim)', fontSize: 13 }}>No files attached.</p>
      ) : (
        <ul
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {quote.designFiles.map((url, index) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm">
                {fileLabel(url, index)}
              </a>
            </li>
          ))}
        </ul>
      )}

      {quote.notes && (
        <>
          <h3 style={sectionHeading}>Customer notes</h3>
          <p
            style={{
              maxWidth: '72ch',
              margin: 0,
              whiteSpace: 'pre-wrap',
              color: 'var(--a-text-dim)',
              fontSize: 13,
              lineHeight: 1.55,
              overflowWrap: 'anywhere',
            }}
          >
            {quote.notes}
          </p>
        </>
      )}

      <h3
        style={{
          ...sectionHeading,
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid var(--a-edge)',
        }}
      >
        Work this request
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <div>
          <label htmlFor="cwq-status" style={labelStyle}>
            Status
          </label>
          <select
            id="cwq-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as AdminQuoteStatus)}
            style={{ width: '100%' }}
          >
            {QUOTE_STATUSES.map((option) => (
              <option key={option} value={option}>
                {QUOTE_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cwq-price" style={labelStyle}>
            Quoted price (₹, total)
          </label>
          <input
            id="cwq-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="e.g. 18500"
            style={{ width: '100%' }}
          />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="cwq-notes" style={labelStyle}>
          Internal notes (never shown to the customer)
        </label>
        <textarea
          id="cwq-notes"
          rows={4}
          maxLength={5000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>
      <div className="admin-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {message && (
          <span
            role={message.tone === 'error' ? 'alert' : 'status'}
            style={{
              fontSize: 13,
              color: message.tone === 'error' ? 'var(--a-bad)' : 'var(--a-good)',
            }}
          >
            {message.text}
          </span>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || isSaving}
          onClick={save}
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </article>
  );
};

const EMPTY_COUNTS: QuoteCounts = { ALL: 0, NEW: 0, CONTACTED: 0, QUOTED: 0, WON: 0, LOST: 0 };

export default function AdminCustomWearPage() {
  const [tab, setTab] = useState<Tab>('NEW');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [quotes, setQuotes] = useState<AdminCustomWearQuote[]>([]);
  const [counts, setCounts] = useState<QuoteCounts>(EMPTY_COUNTS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminCustomWearQuote | null>(null);

  const load = useCallback(
    (status: Tab, query: string) =>
      listCustomWearQuotes({ status, search: query })
        .then((result) => {
          setQuotes(result.quotes);
          setCounts({ ...EMPTY_COUNTS, ...result.counts });
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    void load(tab, search);
  }, [load, tab, search]);

  // Debounce typing into the search box.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchInput.trim() !== search) {
        setIsLoading(true);
        setSearch(searchInput.trim());
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput, search]);

  const onSaved = (updated: AdminCustomWearQuote) => {
    setSelected(updated);
    // Refresh the list and counts: the quote may have left this tab.
    void load(tab, search);
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    ...QUOTE_STATUSES.map((key) => ({ key, label: QUOTE_STATUS_LABELS[key] })),
    { key: 'ALL', label: 'All' },
  ];

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Custom wear quotes</h1>
          <p className="admin-page-sub">
            Requests for custom printed and embroidered garments. These are priced by the team,
            never paid at checkout: contact the customer, send a price, then mark the request won or
            lost.
          </p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: selected ? 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' : '1fr',
          alignItems: 'start',
        }}
      >
        <div className="admin-card admin-index">
          <div className="admin-toolbar">
            <div
              role="group"
              aria-label="Status"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
            >
              {tabs.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={tab === option.key}
                  className={`filter-pill${tab === option.key ? ' filter-pill--active' : ''}`}
                  onClick={() => {
                    if (tab === option.key) return;
                    setIsLoading(true);
                    setTab(option.key);
                  }}
                >
                  {option.label} ({counts[option.key] ?? 0})
                </button>
              ))}
            </div>
            <input
              type="search"
              aria-label="Search quotes"
              placeholder="Search reference, email or company"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          {isLoading && quotes.length === 0 ? (
            <div className="admin-empty">
              <p className="admin-empty-text">Loading…</p>
            </div>
          ) : quotes.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon">
                <FileEdit size={22} />
              </div>
              <p className="admin-empty-title">
                {search ? 'No matching requests' : 'No requests here'}
              </p>
              <p className="admin-empty-text">
                {search
                  ? 'Nothing matches that search. Try a reference, email or company.'
                  : 'New quote requests will appear here.'}
              </p>
            </div>
          ) : (
            <div className="admin-table-wrap" style={flush}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Garment</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Qty
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr
                      key={quote.id}
                      aria-selected={selected?.id === quote.id}
                      style={{
                        cursor: 'pointer',
                        background: selected?.id === quote.id ? 'var(--a-surface-2)' : undefined,
                      }}
                      onClick={() => setSelected(quote)}
                    >
                      <td>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(quote);
                          }}
                          style={{
                            background: 'none',
                            border: 0,
                            padding: 0,
                            color: 'var(--a-accent)',
                            font: 'inherit',
                            fontWeight: 650,
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                        >
                          {quote.reference}
                        </button>
                      </td>
                      <td>
                        <span style={{ color: 'var(--a-text)' }}>{quote.customerName}</span>
                        <span
                          style={{ display: 'block', color: 'var(--a-text-dim)', fontSize: 12 }}
                        >
                          {quote.company || quote.email}
                        </span>
                      </td>
                      <td>{quote.productName}</td>
                      <td style={{ textAlign: 'right' }}>{quote.quantity}</td>
                      <td>
                        <StatusBadge status={quote.status} />
                        {quote.quotedPrice != null && (
                          <span
                            style={{
                              display: 'block',
                              color: 'var(--a-text-dim)',
                              fontSize: 12,
                              marginTop: 2,
                            }}
                          >
                            {formatCurrency(quote.quotedPrice)}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(quote.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected && (
          <QuoteDetail
            key={`${selected.id}-${selected.updatedAt}`}
            quote={selected}
            onSaved={onSaved}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
