'use client';

import React, { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { statusLabel } from '@/lib/admin-orders';
import { deleteBrand, type AdminBrand } from '@/lib/admin-brands';
import { deleteCoupon, type AdminCoupon } from '@/lib/admin-coupons';
import { Search as SearchIcon } from '@/components/admin/icons';
import { BrandEditor, ConfirmDialog, CouponEditor, StockCell } from './editors';
import {
  ATTENTION_KEYS,
  ATTENTION_LINKS,
  SECTIONS,
  kpiLabel,
  kpiValue,
  text,
  type Column,
  type Row,
  type RowAction,
  type Section,
} from './sections';

/**
 * The operations tables — one screen, one config per module.
 *
 * The important correction here is that two of these endpoints have always
 * been paged. The screen used to fetch them with no parameters, take the
 * twenty rows the server chose to send, and print "12 of 20 records" under
 * them — which reads as the whole database. An order placed last month simply
 * was not on the screen, the search box could not find it, and the honest
 * conclusion from what was displayed was that it did not exist.
 *
 * So paged modules now own a page, a page size and a server-side search, and
 * report the server's total rather than the size of their own slice. The
 * unpaged ones keep filtering in the browser, which is correct there because
 * the browser genuinely holds every row.
 */

const PAGE_SIZES = [25, 50, 100];

/** Short columns hug their content; the one marked `grow` takes the slack. */
const cellStyle = (column: Column): React.CSSProperties => ({
  textAlign: column.align ?? 'left',
  whiteSpace: column.grow ? 'normal' : 'nowrap',
  width: column.grow ? undefined : '1%',
});
const actionCellStyle: React.CSSProperties = { width: '1%', whiteSpace: 'nowrap', textAlign: 'right' };
/** Selects in a toolbar size to their options rather than to the row. */
const toolbarSelect: React.CSSProperties = { width: 'auto', flex: '0 0 auto' };
/**
 * The shared "table in a padded card" rule bleeds the table 16px past each
 * edge; an index card has no padding, so the table sits flush instead, and
 * the toolbar's bottom rule already separates it from the search row.
 */
const indexTableWrap: React.CSSProperties = { width: '100%', margin: 0, borderTop: 0 };
const dangerText: React.CSSProperties = { color: 'var(--a-bad)' };

const kpiGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 12,
  marginBottom: 16,
};

const KpiCard: React.FC<{ name: string; value: unknown; href?: string }> = ({ name, value, href }) => {
  const card = (
    <div className="admin-card">
      <p
        className="admin-kpi-label"
        title={kpiLabel(name)}
        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {kpiLabel(name)}
      </p>
      <p className="admin-kpi-value">{kpiValue(name, value)}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="admin-kpi-link">
      {card}
    </Link>
  ) : (
    card
  );
};

interface Request {
  page: number;
  limit: number;
  search: string;
  status: string;
}

interface Loaded {
  /** The request this data answers. Anything else on screen is stale. */
  key: string;
  payload: Record<string, unknown>;
  rows: Row[];
  total: number;
  totalPages: number;
}

async function fetchSection(config: Section, request: Request) {
  const response = await apiClient.get(config.endpoint, {
    params: config.paginated
      ? {
          page: request.page,
          limit: request.limit,
          ...(request.search ? { search: request.search } : {}),
          ...(request.status && config.statusParam ? { [config.statusParam]: request.status } : {}),
        }
      : undefined,
  });
  const payload = (response.data?.data ?? {}) as Record<string, unknown>;
  const rows =
    config.collection && Array.isArray(payload[config.collection])
      ? (payload[config.collection] as Row[])
      : [];
  const pagination = payload.pagination as { total?: number; totalPages?: number } | undefined;
  return {
    payload,
    rows,
    total: pagination?.total ?? rows.length,
    totalPages: pagination?.totalPages ?? 1,
  };
}

/** The status a row is filtered on, whether it keeps one or only a flag. */
const rowStatus = (row: Row): string =>
  row.status === undefined
    ? row.isActive === undefined
      ? ''
      : row.isActive
        ? 'ACTIVE'
        : 'INACTIVE'
    : text(row.status);

/**
 * Remounted per section by its key, so switching modules cannot carry a page
 * number or a half-typed search across to a table it means nothing in.
 */
function OperationsSection({ section }: { section: string }) {
  const config = SECTIONS[section];

  const [request, setRequest] = useState<Request>({ page: 1, limit: 25, search: '', status: '' });
  const [searchInput, setSearchInput] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Brand and coupon authoring. `null` inside the flag means "a new one".
  const [brandEditor, setBrandEditor] = useState<{ brand: AdminBrand | null } | null>(null);
  const [couponEditor, setCouponEditor] = useState<{ coupon: AdminCoupon | null } | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const requestKey = config?.paginated
    ? `${section}:${request.page}:${request.limit}:${request.search}:${request.status}`
    : section;

  const load = useCallback(() => {
    if (!config) return Promise.resolve();
    const key = requestKey;
    return fetchSection(config, request)
      .then((result) => {
        setLoaded({ key, ...result });
        setError(null);
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Could not load this admin module.')));
  }, [config, request, requestKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Typing in a server-searched table should not fire a request per keystroke.
  // Unpaged tables filter locally and never reach this.
  useEffect(() => {
    if (!config?.paginated) return;
    const needle = searchInput.trim();
    const timer = setTimeout(() => {
      setRequest((current) =>
        current.search === needle ? current : { ...current, search: needle, page: 1 }
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [config, searchInput]);

  const rows = useMemo(() => loaded?.rows ?? [], [loaded]);
  const isStale = !loaded || loaded.key !== requestKey;

  /** What the table shows. Already narrowed by the server on paged modules. */
  const visibleRows = useMemo(() => {
    if (config?.paginated) return rows;
    const needle = searchInput.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (request.status === '' || rowStatus(row) === request.status) &&
        (needle === '' || JSON.stringify(row).toLowerCase().includes(needle))
    );
  }, [config, request.status, rows, searchInput]);

  const statusOptions = useMemo(() => {
    if (config?.statusOptions) return [...config.statusOptions];
    return [...new Set(rows.map(rowStatus).filter(Boolean))].sort();
  }, [config, rows]);

  const total = config?.paginated ? (loaded?.total ?? 0) : rows.length;
  const totalPages = Math.max(1, loaded?.totalPages ?? 1);
  const firstOnPage = total === 0 ? 0 : (request.page - 1) * request.limit + 1;
  const lastOnPage = Math.min(total, (request.page - 1) * request.limit + visibleRows.length);

  const patchRow = (id: unknown, changes: Row) =>
    setLoaded((current) =>
      current
        ? { ...current, rows: current.rows.map((row) => (row.id === id ? { ...row, ...changes } : row)) }
        : current
    );

  const runAction = async (row: Row, action: RowAction, index: number) => {
    const busyKey = `${text(row.id)}:${index}`;
    setBusyAction(busyKey);
    setError(null);
    setNotice(null);
    try {
      await apiClient[action.method ?? 'patch'](action.path(row), action.body(row));
      // Refetched rather than merged locally: on a paged, server-filtered table
      // the changed row may no longer belong on this page at all.
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not update this record.'));
    } finally {
      setBusyAction(null);
    }
  };

  /**
   * Every row the current filter matches, not merely the page on screen.
   * An export that quietly stopped at twenty-five rows would be the same bug
   * this screen was fixed for.
   */
  const collectExportRows = async (): Promise<Row[]> => {
    if (!config?.paginated) return visibleRows;
    const collected: Row[] = [];
    for (let page = 1; page <= 50; page += 1) {
      const result = await fetchSection(config, { ...request, page, limit: 100 });
      collected.push(...result.rows);
      if (result.rows.length === 0 || collected.length >= result.total) break;
    }
    return collected;
  };

  const exportRows = async () => {
    if (!config?.columns) return;
    setIsExporting(true);
    setError(null);
    try {
      const exportable = await collectExportRows();
      const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = [
        config.columns.map((column) => escape(column.label)).join(','),
        ...exportable.map((row) => config.columns!.map((column) => escape(column.value(row))).join(',')),
      ].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${section}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not export these records.'));
    } finally {
      setIsExporting(false);
    }
  };

  const confirmRemoval = async () => {
    if (!removing) return;
    setIsRemoving(true);
    setError(null);
    try {
      const message =
        section === 'brands'
          ? await deleteBrand(text(removing.id))
          : await deleteCoupon(text(removing.id));
      setNotice(message);
      setRemoving(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRemoving(false);
    }
  };

  if (!config) {
    return (
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Not found</h1>
          <p className="admin-page-sub">This admin module does not exist.</p>
        </div>
      </div>
    );
  }

  const hasFilters = searchInput !== '' || request.status !== '';
  const hasRows = visibleRows.length > 0;
  const hasRowActions = Boolean(
    config.actions || config.href || section === 'brands' || section === 'coupons'
  );
  const countLabel = config.paginated
    ? `${firstOnPage}–${lastOnPage} of ${total}`
    : `${visibleRows.length} of ${rows.length}`;
  const EmptyIcon = hasFilters ? SearchIcon : (config.empty?.icon ?? SearchIcon);

  const summaryEntries = Object.entries(loaded?.payload ?? {});
  const measures = summaryEntries.filter(([key]) => !ATTENTION_KEYS.has(key));
  const attention = summaryEntries.filter(([key]) => ATTENTION_KEYS.has(key));

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">{config.title}</h1>
          <p className="admin-page-sub">{config.description}</p>
        </div>
        <div className="admin-page-actions">
          {section === 'analytics' && (
            <Link href="/admin" className="btn">
              See full report on the Dashboard
            </Link>
          )}
          {config.collection && total > 0 && (
            <button
              type="button"
              className="btn"
              disabled={isExporting}
              onClick={() => void exportRows()}
            >
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
          {section === 'brands' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setBrandEditor({ brand: null })}
            >
              New brand
            </button>
          )}
          {section === 'coupons' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCouponEditor({ coupon: null })}
            >
              New coupon
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="admin-alert" style={{ marginBottom: 16 }}>
          <span>{notice}</span>
        </div>
      )}

      {!config.collection && (
        <>
          {isStale && !error && (
            <div className="admin-card">
              <p className="admin-kpi-sub">Loading…</p>
            </div>
          )}
          {!isStale && measures.length > 0 && (
            <div style={kpiGrid}>
              {measures.map(([key, value]) => (
                <KpiCard key={key} name={key} value={value} />
              ))}
            </div>
          )}
          {!isStale && attention.length > 0 && (
            <>
              <h2 className="admin-section-title" style={{ marginTop: 8 }}>
                Needs attention
              </h2>
              <div style={kpiGrid}>
                {attention.map(([key, value]) => (
                  <KpiCard key={key} name={key} value={value} href={ATTENTION_LINKS[key]} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {config.collection && (
        <div className="admin-card admin-index">
          {(rows.length > 0 || hasFilters || config.paginated) && (
            <div className="admin-toolbar">
              <input
                type="search"
                aria-label={`Search ${config.title.toLowerCase()}`}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search"
              />
              {statusOptions.length > 0 && (
                <select
                  aria-label="Filter by status"
                  style={toolbarSelect}
                  value={request.status}
                  onChange={(event) =>
                    setRequest((current) => ({ ...current, status: event.target.value, page: 1 }))
                  }
                >
                  <option value="">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              )}
              {hasFilters && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setSearchInput('');
                    setRequest((current) => ({ ...current, search: '', status: '', page: 1 }));
                  }}
                >
                  Clear
                </button>
              )}
              {hasRows && !isStale && (
                <span className="admin-toolbar-meta" style={{ marginLeft: 'auto' }}>
                  {countLabel}
                </span>
              )}
            </div>
          )}

          {isStale && !error ? (
            <div className="admin-empty">
              <p className="admin-empty-text">Loading…</p>
            </div>
          ) : !hasRows ? (
            <div className="admin-empty">
              <span className="admin-empty-icon">
                <EmptyIcon size={22} />
              </span>
              <p className="admin-empty-title">
                {hasFilters ? 'No matches' : (config.empty?.title ?? 'Nothing here yet')}
              </p>
              <p className="admin-empty-text">
                {hasFilters
                  ? 'Try a different search or clear the filters.'
                  : (config.empty?.text ?? 'Records will appear here as they come in.')}
              </p>
              {!hasFilters && section === 'coupons' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setCouponEditor({ coupon: null })}
                >
                  New coupon
                </button>
              )}
              {!hasFilters && section === 'brands' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setBrandEditor({ brand: null })}
                >
                  New brand
                </button>
              )}
            </div>
          ) : (
            <div className="admin-table-wrap" style={indexTableWrap}>
              <table className="admin-table">
                <thead>
                  <tr>
                    {config.columns?.map((column) => (
                      <th key={column.label} style={cellStyle(column)}>
                        {column.label}
                      </th>
                    ))}
                    {hasRowActions && (
                      <th style={actionCellStyle}>
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, rowIndex) => (
                    <tr key={text(row.id) || rowIndex}>
                      {config.columns?.map((column, columnIndex) => (
                        <td key={column.label} style={cellStyle(column)}>
                          {section === 'inventory' && column.label === 'Stock' ? (
                            <StockCell
                              productId={text(row.id)}
                              quantity={Number(row.quantity) || 0}
                              onSaved={(quantity) => {
                                patchRow(row.id, { quantity });
                                setNotice(`Stock for ${text(row.name)} set to ${quantity}.`);
                              }}
                              onError={setError}
                            />
                          ) : columnIndex === 0 && config.href ? (
                            <Link href={config.href(row)}>{column.value(row)}</Link>
                          ) : column.render ? (
                            column.render(row)
                          ) : (
                            column.value(row)
                          )}
                        </td>
                      ))}
                      {hasRowActions && (
                        <td style={actionCellStyle}>
                          <div className="admin-actions">
                            {config.actions?.map((action, index) =>
                              action.hidden?.(row) ? null : (
                                <button
                                  key={index}
                                  type="button"
                                  className="btn btn-sm"
                                  disabled={busyAction === `${text(row.id)}:${index}`}
                                  onClick={() => void runAction(row, action, index)}
                                >
                                  {busyAction === `${text(row.id)}:${index}`
                                    ? 'Saving…'
                                    : action.label(row)}
                                </button>
                              )
                            )}
                            {section === 'brands' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() =>
                                    setBrandEditor({ brand: row as unknown as AdminBrand })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  style={dangerText}
                                  onClick={() => setRemoving(row)}
                                >
                                  Remove
                                </button>
                              </>
                            )}
                            {section === 'coupons' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() =>
                                    setCouponEditor({ coupon: row as unknown as AdminCoupon })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  style={dangerText}
                                  onClick={() => setRemoving(row)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {config.href && (
                              <Link href={config.href(row)} className="btn btn-sm btn-ghost">
                                View
                              </Link>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {config.paginated && hasRows && (
            <div className="admin-index-footer">
              <span className="admin-toolbar-meta">
                Page {request.page} of {totalPages}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  aria-label="Records per page"
                  style={toolbarSelect}
                  value={request.limit}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      limit: Number(event.target.value),
                      page: 1,
                    }))
                  }
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} per page
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  disabled={request.page <= 1 || isStale}
                  onClick={() =>
                    setRequest((current) => ({ ...current, page: Math.max(1, current.page - 1) }))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={request.page >= totalPages || isStale}
                  onClick={() => setRequest((current) => ({ ...current, page: current.page + 1 }))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {brandEditor && (
        <BrandEditor
          brand={brandEditor.brand}
          onClose={() => setBrandEditor(null)}
          onSaved={(_brand, message) => {
            setBrandEditor(null);
            setNotice(message);
            void load();
          }}
        />
      )}

      {couponEditor && (
        <CouponEditor
          coupon={couponEditor.coupon}
          onClose={() => setCouponEditor(null)}
          onSaved={(_coupon, message) => {
            setCouponEditor(null);
            setNotice(message);
            void load();
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={section === 'brands' ? 'Remove brand' : 'Delete coupon'}
          subject={text(removing.name ?? removing.code)}
          detail={
            section === 'brands'
              ? Number((removing._count as Row)?.products ?? 0) > 0
                ? `${text((removing._count as Row)?.products)} product(s) still carry this brand, so it will be deactivated rather than deleted — deleting would strip the label off every one of them.`
                : 'Nothing carries this brand, so it will be deleted outright.'
              : Number(removing.usageCount ?? 0) > 0
                ? `This code has been redeemed ${text(removing.usageCount)} time(s). Past orders keep the discount they were placed with, but the code itself will be gone — deactivating instead keeps the record.`
                : 'This code has never been redeemed and will be deleted outright.'
          }
          confirmLabel={section === 'brands' ? 'Remove brand' : 'Delete coupon'}
          isBusy={isRemoving}
          onConfirm={() => void confirmRemoval()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

export default function AdminOperationsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  return <OperationsSection key={section} section={section} />;
}
