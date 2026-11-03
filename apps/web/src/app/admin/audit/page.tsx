'use client';

import React, { useEffect, useState } from 'react';
import { getAuditLog, type AuditEntry } from '@/lib/admin-staff';
import { ShieldCheck } from '@/components/admin/icons';

/**
 * The audit log (`/admin/audit`, SUPER_ADMIN only): every change staff,
 * sellers and the system made to data — who, what, which record, when, and the
 * record before and after. Filtered by entity type and id on the server.
 */

const PAGE_SIZE = 50;

/** The stored JSON, indented; anything that is not JSON is shown as it is. */
const pretty = (raw: unknown): string => {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (typeof raw !== 'string') return JSON.stringify(raw, null, 2);
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 10,
  maxHeight: 320,
  overflow: 'auto',
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  background: 'var(--a-surface-2)',
  borderRadius: 8,
};

const label = (value: string) =>
  value.replace(/[_.]/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

interface Query {
  entity: string;
  entityId: string;
  page: number;
}

export default function AdminAuditPage() {
  const [query, setQuery] = useState<Query>({ entity: '', entityId: '', page: 1 });
  const [entityInput, setEntityInput] = useState('');
  const [idInput, setIdInput] = useState('');
  const [loaded, setLoaded] = useState<{
    key: string;
    items: AuditEntry[];
    total: number;
    pages: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const key = `${query.entity}|${query.entityId}|${query.page}`;
  const isStale = loaded?.key !== key;

  useEffect(() => {
    let cancelled = false;
    const requestKey = `${query.entity}|${query.entityId}|${query.page}`;
    getAuditLog({
      entity: query.entity || undefined,
      entityId: query.entityId || undefined,
      page: query.page,
      limit: PAGE_SIZE,
    })
      .then((page) => {
        if (cancelled) return;
        setError(null);
        setLoaded({
          key: requestKey,
          items: page.items ?? [],
          total: page.total ?? 0,
          pages: Math.max(1, page.pages ?? 1),
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery({ entity: entityInput.trim(), entityId: idInput.trim(), page: 1 });
  };

  const items = loaded?.items ?? [];
  const hasFilters = query.entity !== '' || query.entityId !== '';

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Audit log</h1>
          <p className="admin-page-sub">
            Every change made to data, by whom and when, with the record before and after.
          </p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      <div className="admin-card admin-index">
        <form className="admin-toolbar" onSubmit={apply}>
          <input
            type="search"
            aria-label="Entity type"
            placeholder="Entity, e.g. product, order, coupon"
            value={entityInput}
            onChange={(event) => setEntityInput(event.target.value)}
          />
          <input
            type="search"
            aria-label="Record id"
            placeholder="Record id"
            value={idInput}
            onChange={(event) => setIdInput(event.target.value)}
          />
          <button type="submit" className="btn">
            Filter
          </button>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEntityInput('');
                setIdInput('');
                setQuery({ entity: '', entityId: '', page: 1 });
              }}
            >
              Clear
            </button>
          )}
          {loaded && !isStale && loaded.total > 0 && (
            <span className="admin-toolbar-meta" style={{ marginLeft: 'auto' }}>
              {(query.page - 1) * PAGE_SIZE + 1}–{(query.page - 1) * PAGE_SIZE + items.length} of{' '}
              {loaded.total}
            </span>
          )}
        </form>

        {isStale && !error ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">
              <ShieldCheck size={22} />
            </span>
            <p className="admin-empty-title">{hasFilters ? 'No matches' : 'Nothing recorded yet'}</p>
            <p className="admin-empty-text">
              {hasFilters
                ? 'Entity names are exact, e.g. product, product_variant, coupon, admin_user.'
                : 'Changes to data are recorded here as they happen.'}
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap" style={{ width: '100%', margin: 0, borderTop: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '1%', whiteSpace: 'nowrap' }}>When</th>
                  <th style={{ width: '1%' }}>Who</th>
                  <th style={{ width: '1%' }}>Action</th>
                  <th style={{ width: '1%' }}>Entity</th>
                  <th>Record</th>
                  <th style={{ width: '1%' }}>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => {
                  const isOpen = open === entry.id;
                  const hasDetail = Boolean(entry.before || entry.after);
                  return (
                    <React.Fragment key={entry.id}>
                      <tr>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(entry.createdAt).toLocaleString('en-IN')}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="admin-row-title">
                            {entry.actorEmail ?? entry.actorId ?? 'System'}
                          </span>
                          <span className="admin-kpi-sub" style={{ display: 'block' }}>
                            {label(entry.actorRealm || 'system')}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="admin-status-badge" data-status="NEUTRAL">
                            {label(entry.action)}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="admin-link"
                            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                            title="Show only this entity"
                            onClick={() => {
                              setEntityInput(entry.entity);
                              setQuery({ entity: entry.entity, entityId: '', page: 1 });
                            }}
                          >
                            {entry.entity}
                          </button>
                        </td>
                        <td style={{ wordBreak: 'break-all' }}>
                          {entry.entityId ? (
                            <button
                              type="button"
                              className="admin-link"
                              style={{
                                background: 'none',
                                border: 0,
                                padding: 0,
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                              title="Show this record's history"
                              onClick={() => {
                                setEntityInput(entry.entity);
                                setIdInput(entry.entityId ?? '');
                                setQuery({
                                  entity: entry.entity,
                                  entityId: entry.entityId ?? '',
                                  page: 1,
                                });
                              }}
                            >
                              {entry.entityId}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {hasDetail && (
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              aria-expanded={isOpen}
                              onClick={() => setOpen(isOpen ? null : entry.id)}
                            >
                              {isOpen ? 'Hide' : 'Changes'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6}>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                gap: 12,
                              }}
                            >
                              <div>
                                <p className="admin-kpi-label" style={{ marginBottom: 6 }}>
                                  Before
                                </p>
                                <pre style={preStyle}>{pretty(entry.before)}</pre>
                              </div>
                              <div>
                                <p className="admin-kpi-label" style={{ marginBottom: 6 }}>
                                  After
                                </p>
                                <pre style={preStyle}>{pretty(entry.after)}</pre>
                              </div>
                            </div>
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

        {loaded && loaded.pages > 1 && (
          <div className="admin-index-footer">
            <span className="admin-toolbar-meta">
              Page {query.page} of {loaded.pages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn"
                disabled={query.page <= 1 || isStale}
                onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn"
                disabled={query.page >= loaded.pages || isStale}
                onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
