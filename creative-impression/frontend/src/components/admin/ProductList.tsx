'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  bulkUpdateProducts,
  exportCatalog,
  getCatalogSummary,
  listCategories,
  listProducts,
  listSellerOptions,
  setAllVariantStock,
  setFeatured,
  updateProduct,
  updateVariant,
  type AdminCategory,
  type BulkAction,
  type CatalogSummary,
  type ProductListRow,
  type ProductPage,
  type SellerOption,
  type StockBand,
} from '@/lib/admin-products';
import { ProductThumb } from '@/components/product/ProductThumb';
import { exportMyntra, listExportArticleTypes, myntraExportCounts } from '@/lib/catalog-import';
import {
  ArrowRight,
  Boxes,
  ExternalLink,
  FileEdit,
  Package,
  ShieldCheck,
  Tags,
} from '@/components/admin/icons';
import { ToneDot, ToneIcon, type Tone } from '@/components/admin/tone';

/**
 * The catalogue, laid out on 9 Impression's product listing and taken a step
 * further.
 *
 * 9 Impression splits this across two screens: a hub of four links, then the
 * listing table. Here the hub is a strip of shortcuts above the table, so the
 * catalogue is one click closer. Above the table sit the figures and the
 * stock-health chart, read from the whole catalogue so they do not change
 * shape while paging. Every figure, chart segment and chip is also a filter.
 *
 * Filters live in the URL, so a link such as `/admin/products?stock=low`
 * lands on exactly that view and survives a refresh.
 */

const PAGE_SIZES = [20, 50, 100];

const SORTS: Array<{ value: string; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'updated', label: 'Recently edited' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'price-asc', label: 'Price, low to high' },
  { value: 'price-desc', label: 'Price, high to low' },
  { value: 'stock-asc', label: 'Stock, lowest first' },
];

const FILTER_KEYS = [
  'search',
  'status',
  'categoryId',
  'stock',
  'moderation',
  'vendorId',
  'featured',
  'images',
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Record<FilterKey, string>;

const EMPTY_FILTERS: Filters = {
  search: '',
  status: '',
  categoryId: '',
  stock: '',
  moderation: '',
  vendorId: '',
  featured: '',
  images: '',
};

const STOCK_TONE: Record<StockBand, { color: string; fill: string; label: string }> = {
  healthy: { color: 'var(--a-good)', fill: 'var(--a-good-fill)', label: 'In stock' },
  low: { color: 'var(--a-warn)', fill: 'var(--a-warn-fill)', label: 'Low' },
  out: { color: 'var(--a-bad)', fill: 'var(--a-bad-fill)', label: 'Sold out' },
};

const HEALTH_SERIES: Array<{ key: StockBand; label: string; color: string }> = [
  { key: 'healthy', label: 'Healthy (11+)', color: 'var(--a-good-fill)' },
  { key: 'low', label: 'Low (1–10)', color: 'var(--a-warn-fill)' },
  { key: 'out', label: 'Sold out', color: 'var(--a-bad-fill)' },
];

const inr = (value: number | null | undefined): string =>
  `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

const discountPct = (price: number, mrp: number | null): number =>
  mrp && mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;

/** Storefront CSS makes selects full width; toolbar pickers size to content. */
const TOOLBAR_SELECT: React.CSSProperties = { width: 'auto', flex: '0 1 auto', maxWidth: '100%' };
/** Filters sit in an equal-width grid. */
const FILTER_SELECT: React.CSSProperties = { width: '100%', minWidth: 0 };

const micro: React.CSSProperties = {
  color: 'var(--a-text-faint)',
  fontSize: 12,
  letterSpacing: '-0.005em',
};

/* ── Export to Myntra ─────────────────────────────────────────────────── */

/**
 * Picks an article type and downloads Myntra's own template, filled — one row
 * per size. Scope is the ticked rows when there are any, otherwise the seller
 * filter. Types with nothing to export are shown but disabled, with the count
 * in the label, so it is clear why.
 */
function MyntraExport({
  ids,
  vendorId,
  notify,
}: {
  ids: string[];
  vendorId: string;
  notify: (message: string, ok: boolean) => void;
}) {
  const [types, setTypes] = useState<Array<{ articleType: string; slug: string }>>([]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const scopeKey = `${vendorId}|${ids.join(',')}`;

  useEffect(() => {
    listExportArticleTypes()
      .then(setTypes)
      .catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const [scopeVendor, scopeIds] = scopeKey.split('|');
    myntraExportCounts({
      ids: scopeIds ? scopeIds.split(',') : undefined,
      vendorId: scopeIds ? undefined : scopeVendor || undefined,
    })
      .then((next) => {
        if (!cancelled) setCounts(next);
      })
      .catch(() => {
        if (!cancelled) setCounts({});
      });
    return () => {
      cancelled = true;
    };
  }, [scopeKey]);

  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;
  const scopeLabel =
    ids.length > 0 ? `${ids.length} selected` : vendorId ? 'this seller' : 'all sellers';

  const run = async (articleType: string) => {
    if (!articleType) return;
    setBusy(true);
    try {
      const { filename, rows, skipped } = await exportMyntra({
        articleType,
        ids: ids.length > 0 ? ids : undefined,
        vendorId: ids.length > 0 ? undefined : vendorId || undefined,
      });
      notify(
        `${filename}: ${rows} size row${rows === 1 ? '' : 's'}` +
          (skipped.length
            ? `. Left out ${skipped.join(', ')}: several colours in one listing — Myntra needs one listing per colour (use “Add another colour”).`
            : ''),
        skipped.length === 0
      );
    } catch (err) {
      notify((err as Error).message, false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      style={TOOLBAR_SELECT}
      aria-label="Export to Myntra"
      value=""
      disabled={busy || counts === null || total === 0}
      title={
        counts !== null && total === 0
          ? `Nothing to export for ${scopeLabel}: no products have a Myntra article type yet`
          : `Download a filled Myntra SKU template for ${scopeLabel}`
      }
      onChange={(event) => run(event.target.value)}
    >
      <option value="">{busy ? 'Building sheet…' : 'Export to Myntra'}</option>
      {types.map((type) => {
        const count = counts?.[type.articleType] ?? 0;
        return (
          <option key={type.slug} value={type.articleType} disabled={count === 0}>
            {type.articleType} ({count === 0 ? 'none' : count})
          </option>
        );
      })}
    </select>
  );
}

/* ── Shortcuts (9 Impression's product hub, as a strip) ───────────────── */

const SHORTCUTS = [
  {
    href: '/admin/products/new',
    title: 'Create product',
    tone: 'blue' as Tone,
    body: 'One product by hand, with sizes, photos and SEO.',
    icon: Package,
  },
  {
    href: '/admin/products/listing',
    title: 'List from a sheet',
    tone: 'violet' as Tone,
    body: 'Upload a marketplace sheet; review before publishing.',
    icon: Tags,
  },
  {
    href: '/admin/products/import',
    title: 'CSV import & export',
    tone: 'teal' as Tone,
    body: 'Round-trip the catalogue for bulk edits.',
    icon: FileEdit,
  },
  {
    href: '/admin/moderation',
    title: 'Review queue',
    tone: 'amber' as Tone,
    body: 'Seller listings waiting for approval.',
    icon: ShieldCheck,
  },
  {
    href: '/admin/operations/inventory',
    title: 'Inventory',
    tone: 'green' as Tone,
    body: 'Stock across every size, in one table.',
    icon: Boxes,
  },
];

function Shortcuts({ pendingReview }: { pendingReview: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
        gridAutoRows: '1fr',
        gap: 10,
        marginBottom: 24,
      }}
    >
      {SHORTCUTS.map((item) => {
        const Icon = item.icon;
        const badge = item.href === '/admin/moderation' && pendingReview > 0 ? pendingReview : 0;
        return (
          <Link key={item.href} href={item.href} className="admin-kpi-link">
            <div
              className="admin-card"
              style={{ display: 'flex', gap: 12, padding: '14px 16px', height: '100%' }}
            >
              <ToneIcon icon={Icon} tone={item.tone} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      color: 'var(--a-text)',
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {item.title}
                  </span>
                  {badge > 0 && (
                    <span className="admin-nav-badge" style={{ marginLeft: 0 }}>
                      {badge}
                    </span>
                  )}
                  <ArrowRight
                    size={14}
                    style={{ marginLeft: 'auto', color: 'var(--a-text-faint)', flexShrink: 0 }}
                  />
                </span>
                <span
                  className="admin-kpi-sub"
                  style={{ display: 'block', marginTop: 4, fontSize: 12.5 }}
                >
                  {item.body}
                </span>
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ── Figures and the health chart ─────────────────────────────────────── */

function SummaryStrip({
  summary,
  filters,
  apply,
}: {
  summary: CatalogSummary;
  filters: Filters;
  apply: (patch: Partial<Filters>) => void;
}) {
  const figures: Array<{
    label: string;
    value: number;
    patch: Partial<Filters>;
    active: boolean;
    tone?: string;
    /** The dot before the label: what the figure is about. */
    dot: Tone;
  }> = [
    {
      label: 'All products',
      dot: 'blue',
      value: summary.total,
      patch: { ...EMPTY_FILTERS, search: filters.search },
      active: false,
    },
    {
      label: 'Live',
      dot: 'green',
      value: summary.statuses.ACTIVE ?? 0,
      patch: { status: 'ACTIVE' },
      active: filters.status === 'ACTIVE',
    },
    {
      label: 'Draft',
      dot: 'neutral',
      value: summary.statuses.DRAFT ?? 0,
      patch: { status: 'DRAFT' },
      active: filters.status === 'DRAFT',
    },
    {
      label: 'Low stock',
      dot: 'amber',
      value: summary.stock.low,
      patch: { stock: 'low' },
      active: filters.stock === 'low',
      tone: summary.stock.low ? 'var(--a-warn)' : undefined,
    },
    {
      label: 'Sold out',
      dot: 'rose',
      value: summary.stock.out,
      patch: { stock: 'out' },
      active: filters.stock === 'out',
      tone: summary.stock.out ? 'var(--a-bad)' : undefined,
    },
    {
      label: 'In review',
      dot: 'amber',
      value: summary.pendingReview,
      patch: { moderation: 'PENDING' },
      active: filters.moderation === 'PENDING',
      tone: summary.pendingReview ? 'var(--a-warn)' : undefined,
    },
    {
      label: 'Featured',
      dot: 'violet',
      value: summary.featured,
      patch: { featured: 'true' },
      active: filters.featured === 'true',
    },
  ];

  return (
    <div
      className="admin-card a-stat-group"
      style={{
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        marginBottom: 14,
        overflow: 'hidden',
      }}
    >
      {figures.map((figure) => (
        <button
          key={figure.label}
          type="button"
          onClick={() => apply(figure.patch)}
          aria-pressed={figure.active}
          style={{
            padding: '13px 17px',
            minWidth: 0,
            border: 0,
            textAlign: 'left',
            cursor: 'pointer',
            background: figure.active ? 'var(--a-surface-2)' : 'transparent',
            fontFamily: 'inherit',
          }}
        >
          <span className="admin-kpi-label a-stat-label">
            <ToneDot tone={figure.dot} />
            {figure.label}
          </span>
          <span
            className="admin-kpi-value"
            style={{ display: 'block', fontSize: 23, margin: 0, color: figure.tone }}
          >
            {figure.value.toLocaleString('en-IN')}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Stock health by category: one stacked bar per category, in the status
 * colours the row chips use, so "sold out" is the same red in both places.
 * Clicking a category filters the table to it.
 */
function HealthChart({
  summary,
  activeCategory,
  onPick,
}: {
  summary: CatalogSummary;
  activeCategory: string;
  onPick: (categoryId: string) => void;
}) {
  const rows = summary.categories.filter((c) => c.categoryId !== 'none').slice(0, 8);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.healthy + r.low + r.out));

  return (
    <div className="admin-card" style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <p className="admin-kpi-label" style={{ margin: 0 }}>
          Stock health by category · products
        </p>
        <div className="a-legend" style={{ marginTop: 0 }}>
          {HEALTH_SERIES.map((series) => (
            <span key={series.key} className="a-legend-item">
              <span className="a-legend-swatch" style={{ background: series.color }} />
              {series.label}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row) => {
          const total = row.healthy + row.low + row.out;
          const active = activeCategory === row.categoryId;
          return (
            <button
              key={row.categoryId}
              type="button"
              onClick={() => onPick(active ? '' : row.categoryId)}
              aria-pressed={active}
              aria-label={`${row.category}: ${row.healthy} healthy, ${row.low} low, ${row.out} sold out. Filter to this category.`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(90px, 160px) 1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: '4px 6px',
                margin: '0 -6px',
                border: 0,
                borderRadius: 8,
                background: active ? 'var(--a-surface-2)' : 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  color: active ? 'var(--a-text)' : 'var(--a-text-dim)',
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.category}
              </span>
              <span
                style={{
                  display: 'flex',
                  height: 10,
                  borderRadius: 3,
                  overflow: 'hidden',
                  background: 'var(--a-surface-2)',
                  width: `${Math.max((total / max) * 100, 3)}%`,
                  gap: 2,
                }}
              >
                {HEALTH_SERIES.map((series) =>
                  row[series.key] > 0 ? (
                    <span
                      key={series.key}
                      style={{ flex: row[series.key], background: series.color }}
                    />
                  ) : null
                )}
              </span>
              <span
                style={{
                  color: 'var(--a-text)',
                  fontSize: 13,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Expanded row: sizes, stock and price ─────────────────────────────── */

function VariantStockRow({
  productId,
  variant,
  onSaved,
}: {
  productId: string;
  variant: ProductListRow['variants'][number];
  onSaved: (message: string, ok: boolean) => void;
}) {
  const [stock, setStock] = useState(String(variant.quantity));
  const [saving, setSaving] = useState(false);
  const dirty = stock !== String(variant.quantity);

  const save = async () => {
    const quantity = Math.max(0, parseInt(stock, 10) || 0);
    setSaving(true);
    try {
      await updateVariant(productId, variant.id, { sku: variant.sku, quantity });
      onSaved(`${variant.name}: stock set to ${quantity}`, true);
    } catch (error) {
      onSaved((error as Error).message, false);
    } finally {
      setSaving(false);
    }
  };

  const band: StockBand =
    variant.quantity <= 0 ? 'out' : variant.quantity <= 10 ? 'low' : 'healthy';

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', flexWrap: 'wrap' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: STOCK_TONE[band].fill,
          flexShrink: 0,
        }}
      />
      <span style={{ minWidth: 120, color: 'var(--a-text)', fontSize: 13 }}>
        {[variant.color, variant.size].filter(Boolean).join(' / ') || variant.name}
      </span>
      <span
        style={{
          ...micro,
          flex: 1,
          minWidth: 120,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {variant.sku}
      </span>
      <input
        type="number"
        min={0}
        value={stock}
        aria-label={`Stock for ${variant.name}`}
        onChange={(event) => setStock(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && dirty) void save();
        }}
        style={{ width: 90 }}
      />
      <button
        type="button"
        className={`btn btn-sm${dirty ? ' btn-primary' : ''}`}
        disabled={!dirty || saving}
        onClick={save}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function ExpandedRow({
  product,
  onChanged,
  notify,
}: {
  product: ProductListRow;
  onChanged: () => void;
  notify: (message: string, ok: boolean) => void;
}) {
  const [all, setAll] = useState('');
  const [price, setPrice] = useState(String(product.price ?? ''));
  const [mrp, setMrp] = useState(String(product.originalPrice ?? ''));
  const [busy, setBusy] = useState<string | null>(null);
  const priceDirty =
    price !== String(product.price ?? '') || mrp !== String(product.originalPrice ?? '');

  const applyAll = async () => {
    const quantity = Math.max(0, parseInt(all, 10) || 0);
    setBusy('stock');
    try {
      await setAllVariantStock(product.id, quantity);
      notify(
        product.variants.length
          ? `Every size of ${product.name} set to ${quantity}`
          : `${product.name} stock set to ${quantity}`,
        true
      );
      setAll('');
      onChanged();
    } catch (error) {
      notify((error as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  const savePrice = async () => {
    const nextPrice = Number(price);
    const nextMrp = mrp.trim() === '' ? null : Number(mrp);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      notify('Enter a selling price above zero.', false);
      return;
    }
    if (nextMrp !== null && (!Number.isFinite(nextMrp) || nextMrp < nextPrice)) {
      notify('MRP must be at least the selling price, or left empty.', false);
      return;
    }
    setBusy('price');
    try {
      await updateProduct(product.id, { price: nextPrice, originalPrice: nextMrp });
      notify(`${product.name}: price saved`, true);
      onChanged();
    } catch (error) {
      notify((error as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        padding: '14px 16px 16px',
        background: 'var(--a-sunken)',
        borderRadius: 'var(--a-radius-sm)',
        margin: '0 0 10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px 28px',
          paddingBottom: 12,
          marginBottom: 6,
          borderBottom: '1px solid var(--a-edge)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={micro}>
            {product.variants.length ? 'Set every size to' : 'Set stock to'}
          </span>
          <input
            type="number"
            min={0}
            value={all}
            placeholder="qty"
            aria-label="Stock quantity for every size"
            onChange={(event) => setAll(event.target.value)}
            style={{ width: 84 }}
          />
          <button
            type="button"
            className={`btn btn-sm${all !== '' ? ' btn-primary' : ''}`}
            disabled={all === '' || busy !== null}
            onClick={applyAll}
          >
            {busy === 'stock' ? 'Applying…' : 'Apply'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={micro}>Price ₹</span>
          <input
            type="number"
            min={0}
            value={price}
            aria-label="Selling price"
            onChange={(event) => setPrice(event.target.value)}
            style={{ width: 100 }}
          />
          <span style={micro}>MRP ₹</span>
          <input
            type="number"
            min={0}
            value={mrp}
            placeholder="none"
            aria-label="MRP"
            onChange={(event) => setMrp(event.target.value)}
            style={{ width: 100 }}
          />
          {discountPct(Number(price), mrp ? Number(mrp) : null) > 0 && (
            <span style={{ color: 'var(--a-good)', fontSize: 12 }}>
              {discountPct(Number(price), Number(mrp))}% off
            </span>
          )}
          <button
            type="button"
            className={`btn btn-sm${priceDirty ? ' btn-primary' : ''}`}
            disabled={!priceDirty || busy !== null}
            onClick={savePrice}
          >
            {busy === 'price' ? 'Saving…' : 'Save price'}
          </button>
        </div>
      </div>

      {product.variants.length === 0 ? (
        <p className="admin-kpi-sub" style={{ marginTop: 8 }}>
          No sizes. Stock is held on the product itself ({product.totalStock}).{' '}
          <Link href={`/admin/products/${product.id}`} className="admin-link">
            Add sizes
          </Link>
        </p>
      ) : (
        product.variants.map((variant) => (
          <VariantStockRow
            key={variant.id}
            productId={product.id}
            variant={variant}
            onSaved={(message, ok) => {
              notify(message, ok);
              if (ok) onChanged();
            }}
          />
        ))
      )}
    </div>
  );
}

/* ── The page body ────────────────────────────────────────────────────── */

export function ProductList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: Filters = useMemo(() => {
    const next = { ...EMPTY_FILTERS };
    for (const key of FILTER_KEYS) next[key] = searchParams.get(key) ?? '';
    return next;
  }, [searchParams]);
  const sort = searchParams.get('sort') ?? 'newest';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = PAGE_SIZES.includes(Number(searchParams.get('limit')))
    ? Number(searchParams.get('limit'))
    : 20;

  const [data, setData] = useState<ProductPage | null>(null);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [draftFor, setDraftFor] = useState(filters.search);
  // Keep the box in step when the URL's search changes (a chip, Back, Clear),
  // without an effect: adjust during render, React's documented pattern.
  if (draftFor !== filters.search) {
    setDraftFor(filters.search);
    setSearchDraft(filters.search);
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDiscontinue, setConfirmDiscontinue] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const notify = useCallback((message: string, ok: boolean) => {
    setToast({ message, ok });
    window.setTimeout(
      () => setToast((current) => (current?.message === message ? null : current)),
      4000
    );
  }, []);

  /** Write filters to the URL; any filter change goes back to page 1. */
  const setQuery = useCallback(
    (patch: Record<string, string | number>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === '' || value === undefined) next.delete(key);
        else next.set(key, String(value));
      }
      if (!('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const apply = useCallback(
    (patch: Partial<Filters>) => setQuery(patch as Record<string, string>),
    [setQuery]
  );

  // Reference data for the filter pickers. A failure only empties a picker.
  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => {});
    listSellerOptions()
      .then(setSellers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCatalogSummary()
      .then((result) => !cancelled && setSummary(result))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const queryKey = JSON.stringify([filters, sort, page, limit, reloadTick]);
  const loading = loadedKey !== queryKey;

  useEffect(() => {
    let cancelled = false;
    listProducts({
      ...filters,
      stock: filters.stock as StockBand | '',
      featured: filters.featured as 'true' | '',
      images: filters.images as 'missing' | '',
      sort,
      page,
      limit,
    })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        // Selection only means something for rows on screen.
        setSelected(
          (current) =>
            new Set([...current].filter((id) => result.products.some((p) => p.id === id)))
        );
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoadedKey(queryKey));
    return () => {
      cancelled = true;
    };
  }, [filters, sort, page, limit, reloadTick, queryKey]);

  const reload = () => setReloadTick((tick) => tick + 1);
  const products = data?.products ?? [];
  const pagination = data?.pagination;
  const activeFilterCount = FILTER_KEYS.filter((key) => filters[key]).length;
  const allOnPageSelected = products.length > 0 && products.every((p) => selected.has(p.id));

  const toggleAll = () =>
    setSelected(allOnPageSelected ? new Set() : new Set(products.map((p) => p.id)));
  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = async (action: BulkAction) => {
    if (action === 'discontinue' && !confirmDiscontinue) {
      setConfirmDiscontinue(true);
      return;
    }
    setConfirmDiscontinue(false);
    setBusy(`bulk:${action}`);
    try {
      notify(await bulkUpdateProducts([...selected], action), true);
      setSelected(new Set());
      reload();
    } catch (err) {
      notify((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  const toggleLive = async (product: ProductListRow) => {
    const next = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setBusy(product.id);
    try {
      await updateProduct(product.id, { status: next });
      notify(next === 'ACTIVE' ? `${product.name} is live` : `${product.name} is hidden`, true);
      reload();
    } catch (err) {
      notify((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  const toggleFeatured = async (product: ProductListRow) => {
    setBusy(product.id);
    try {
      await setFeatured(product.id, !product.isFeatured);
      reload();
    } catch (err) {
      notify((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy('export');
    try {
      const csv = await exportCatalog(
        filters.vendorId && filters.vendorId !== 'house' ? filters.vendorId : undefined
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'catalogue.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify((err as Error).message, false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Products</h1>
          <p className="admin-page-sub">
            Every listing, house stock and sellers&apos;. Only live, approved products appear in the
            shop.
          </p>
        </div>
        <div className="admin-page-actions">
          <button type="button" className="btn" onClick={download} disabled={busy === 'export'}>
            {busy === 'export' ? 'Exporting…' : 'Export CSV'}
          </button>
          <MyntraExport ids={[...selected]} vendorId={filters.vendorId} notify={notify} />
          <Link href="/admin/products/new" className="btn btn-primary">
            Add product
          </Link>
        </div>
      </div>

      <Shortcuts pendingReview={summary?.pendingReview ?? 0} />

      {summary && (
        <>
          <SummaryStrip summary={summary} filters={filters} apply={apply} />
          <HealthChart
            summary={summary}
            activeCategory={filters.categoryId}
            onPick={(categoryId) => apply({ categoryId })}
          />
        </>
      )}

      <div className="admin-card" style={{ padding: '16px 18px' }}>
        {/* Toolbar */}
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ search: searchDraft.trim() });
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}
        >
          {/* Row 1: search, sort, clear. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search name, SKU, size SKU or slug"
              aria-label="Search products"
              style={{ flex: '1 1 240px', minWidth: 0 }}
            />
            <button type="submit" className="btn btn-sm">
              Search
            </button>
            <select
              style={{ ...TOOLBAR_SELECT, minWidth: 180 }}
              aria-label="Sort"
              value={sort}
              onChange={(event) =>
                setQuery({ sort: event.target.value === 'newest' ? '' : event.target.value })
              }
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {activeFilterCount > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSearchDraft('');
                  router.replace(pathname, { scroll: false });
                }}
              >
                Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
          {/* Row 2: the five filters, equal width. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 8,
            }}
          >
            <select
              style={FILTER_SELECT}
              aria-label="Status"
              value={filters.status}
              onChange={(event) => apply({ status: event.target.value })}
            >
              <option value="">Any status</option>
              <option value="ACTIVE">Live</option>
              <option value="DRAFT">Draft</option>
              <option value="INACTIVE">Hidden</option>
              <option value="DISCONTINUED">Discontinued</option>
            </select>
            <select
              style={FILTER_SELECT}
              aria-label="Category"
              value={filters.categoryId}
              onChange={(event) => apply({ categoryId: event.target.value })}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              style={FILTER_SELECT}
              aria-label="Stock"
              value={filters.stock}
              onChange={(event) => apply({ stock: event.target.value })}
            >
              <option value="">Any stock</option>
              <option value="healthy">In stock (11+)</option>
              <option value="low">Low (1–10)</option>
              <option value="out">Sold out</option>
            </select>
            <select
              style={FILTER_SELECT}
              aria-label="Seller"
              value={filters.vendorId}
              onChange={(event) => apply({ vendorId: event.target.value })}
            >
              <option value="">All sellers</option>
              <option value="house">House stock</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.shopName}
                </option>
              ))}
            </select>
            <select
              style={FILTER_SELECT}
              aria-label="Review"
              value={filters.moderation}
              onChange={(event) => apply({ moderation: event.target.value })}
            >
              <option value="">Any review state</option>
              <option value="PENDING">In review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Sent back</option>
            </select>
          </div>
        </form>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div
            role="region"
            aria-label="Bulk actions"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              marginBottom: 12,
              borderRadius: 'var(--a-radius-sm)',
              background: 'var(--a-surface-2)',
            }}
          >
            <span style={{ color: 'var(--a-text)', fontSize: 13, fontWeight: 600, marginRight: 4 }}>
              {selected.size} selected
            </span>
            {(
              [
                ['activate', 'Put live'],
                ['deactivate', 'Hide'],
                ['feature', 'Feature'],
                ['unfeature', 'Unfeature'],
                ['approve', 'Approve'],
              ] as Array<[BulkAction, string]>
            ).map(([action, label]) => (
              <button
                key={action}
                type="button"
                className="btn btn-sm"
                disabled={busy !== null}
                onClick={() => runBulk(action)}
              >
                {busy === `bulk:${action}` ? '…' : label}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy !== null}
              onClick={() => runBulk('discontinue')}
            >
              {confirmDiscontinue ? `Confirm: discontinue ${selected.size}` : 'Discontinue'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSelected(new Set());
                setConfirmDiscontinue(false);
              }}
              style={{ marginLeft: 'auto' }}
            >
              Clear selection
            </button>
          </div>
        )}

        {error && (
          <p className="alert alert-error" style={{ marginBottom: 12 }}>
            {error}
          </p>
        )}

        {/* Table */}
        <div
          className="admin-table-wrap"
          style={{ opacity: loading && data ? 0.6 : 1, transition: 'opacity 0.15s' }}
        >
          <table className="admin-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th scope="col" style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    aria-label="Select every product on this page"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th scope="col">Product</th>
                <th scope="col">Price</th>
                <th scope="col">Stock</th>
                <th scope="col">Status</th>
                <th scope="col" style={{ textAlign: 'center' }}>
                  Featured
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!data && loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7}>
                        <div
                          className="a-skel a-skel--text"
                          style={{ width: `${60 + ((i * 7) % 30)}%`, height: 14 }}
                        />
                      </td>
                    </tr>
                  ))
                : products.map((product) => {
                    const tone = STOCK_TONE[product.stockBand];
                    const off = discountPct(product.price, product.originalPrice);
                    const isOpen = expanded === product.id;
                    return (
                      <React.Fragment key={product.id}>
                        <tr style={isOpen ? { background: 'var(--a-surface-2)' } : undefined}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${product.name}`}
                              checked={selected.has(product.id)}
                              onChange={() => toggleOne(product.id)}
                            />
                          </td>
                          <td>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  width: 44,
                                  height: 44,
                                  flexShrink: 0,
                                  borderRadius: 8,
                                  overflow: 'hidden',
                                  background: 'var(--a-surface-2)',
                                }}
                              >
                                <ProductThumb
                                  src={product.thumbnail || product.images?.[0]}
                                  alt=""
                                  className="h-11 w-11"
                                />
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <Link
                                  href={`/admin/products/${product.id}`}
                                  style={{
                                    display: 'block',
                                    color: 'var(--a-text)',
                                    fontWeight: 500,
                                    textDecoration: 'none',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 320,
                                  }}
                                >
                                  {product.name}
                                </Link>
                                <span style={{ ...micro, display: 'block' }}>
                                  <span
                                    style={{
                                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                    }}
                                  >
                                    {product.sku}
                                  </span>
                                  {product.category?.name ? ` · ${product.category.name}` : ''}
                                  {product.brand?.name ? ` · ${product.brand.name}` : ''}
                                </span>
                                <span style={{ ...micro, display: 'block' }}>
                                  {product.vendor ? product.vendor.shopName : 'House stock'}
                                  {product.variants.length > 0 &&
                                    ` · ${product.variants.length} size${product.variants.length === 1 ? '' : 's'}`}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ color: 'var(--a-text)', fontWeight: 500 }}>
                              {inr(product.price)}
                            </span>
                            {off > 0 && (
                              <span style={{ display: 'block', ...micro }}>
                                <s>{inr(product.originalPrice)}</s>{' '}
                                <span style={{ color: 'var(--a-good)' }}>{off}% off</span>
                              </span>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span
                              className="admin-status-badge"
                              style={
                                {
                                  '--pill': tone.fill,
                                  '--pill-text': tone.color,
                                } as React.CSSProperties
                              }
                            >
                              {tone.label} · {product.totalStock}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {/* One badge per row: review state outranks
                                visibility, because an unreviewed listing is
                                not live whatever its status says. */}
                            {product.moderationStatus === 'PENDING' ? (
                              <span className="admin-status-badge" data-status="PENDING">
                                In review
                              </span>
                            ) : product.moderationStatus === 'REJECTED' ? (
                              <span className="admin-status-badge" data-status="REJECTED">
                                Sent back
                              </span>
                            ) : (
                              <span className="admin-status-badge" data-status={product.status}>
                                {product.status === 'ACTIVE'
                                  ? 'Live'
                                  : product.status === 'INACTIVE'
                                    ? 'Hidden'
                                    : product.status.charAt(0) +
                                      product.status.slice(1).toLowerCase()}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => toggleFeatured(product)}
                              disabled={busy === product.id}
                              aria-pressed={product.isFeatured}
                              aria-label={
                                product.isFeatured
                                  ? `Unfeature ${product.name}`
                                  : `Feature ${product.name}`
                              }
                              title={
                                product.isFeatured ? 'Featured on the storefront' : 'Not featured'
                              }
                              style={{
                                border: 0,
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: 18,
                                lineHeight: 1,
                                color: product.isFeatured
                                  ? 'var(--admin-highlight)'
                                  : 'var(--a-text-faint)',
                              }}
                            >
                              {product.isFeatured ? '★' : '☆'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div className="admin-actions">
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{ minWidth: 104 }}
                                aria-expanded={isOpen}
                                onClick={() => setExpanded(isOpen ? null : product.id)}
                              >
                                {isOpen ? 'Close' : 'Stock & price'}
                              </button>
                              {product.status !== 'DISCONTINUED' ? (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ minWidth: 76 }}
                                  disabled={busy === product.id}
                                  onClick={() => toggleLive(product)}
                                >
                                  {product.status === 'ACTIVE' ? 'Hide' : 'Put live'}
                                </button>
                              ) : (
                                <span style={{ width: 76 }} aria-hidden="true" />
                              )}
                              <Link href={`/admin/products/${product.id}`} className="btn btn-sm">
                                Edit
                              </Link>
                              {/* Reserved slot, so every row lines up. */}
                              <span className="admin-actions-slot">
                                {product.status === 'ACTIVE' &&
                                  product.moderationStatus === 'APPROVED' && (
                                    <a
                                      href={`/products/${product.slug}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn btn-ghost btn-sm"
                                      style={{ padding: 0, width: 28 }}
                                      aria-label={`View ${product.name} in the shop`}
                                      title="View in shop"
                                    >
                                      <ExternalLink size={14} />
                                    </a>
                                  )}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={7} style={{ borderTop: 0, padding: '0 0 0 44px' }}>
                              <ExpandedRow product={product} onChanged={reload} notify={notify} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {data && products.length === 0 && (
          <p className="admin-kpi-sub" style={{ padding: '28px 0', textAlign: 'center' }}>
            {activeFilterCount > 0
              ? 'Nothing matches these filters.'
              : 'No products yet. Add one or import a sheet.'}
          </p>
        )}

        {/* Paging */}
        {pagination && pagination.total > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 14,
            }}
          >
            <span className="admin-kpi-sub">
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total.toLocaleString('en-IN')}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                style={TOOLBAR_SELECT}
                aria-label="Products per page"
                value={limit}
                onChange={(event) =>
                  setQuery({ limit: Number(event.target.value) === 20 ? '' : event.target.value })
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
                className="btn btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => setQuery({ page: pagination.page - 1 })}
              >
                Previous
              </button>
              <span className="admin-kpi-sub">
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setQuery({ page: pagination.page + 1 })}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            right: 20,
            bottom: 20,
            zIndex: 60,
            maxWidth: 'min(420px, calc(100vw - 40px))',
            padding: '10px 14px',
            borderRadius: 'var(--a-radius-sm)',
            background: 'color-mix(in srgb, var(--a-overlay) 88%, transparent)',
            backdropFilter: 'saturate(180%) blur(20px)',
            boxShadow: 'var(--a-lift-3)',
            color: toast.ok ? 'var(--a-text)' : 'var(--a-bad)',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
