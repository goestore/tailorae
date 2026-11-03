'use client';

import React, { useMemo, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import {
  commitImport,
  reviewSheets,
  type CommitResponse,
  type ImportProduct,
  type ReviewResponse,
} from '@/lib/catalog-import';
import { listSellerOptions, type SellerOption } from '@/lib/admin-products';
import { formatCurrency } from '@/utils/helpers';
import { Boxes } from '@/components/admin/icons';

/**
 * Listing.
 *
 * A seller does not have a catalogue in our format — they have the sheet they
 * already file with a marketplace. This reads that sheet, works out what it
 * describes, and shows every assumption it had to make before anything is
 * written. Nothing here demands the shop already have the category, the brand
 * or the colour: those are created from what the sheet says, and flagged.
 *
 * The list is editable in place. A category typed once can be applied to every
 * product missing one, a product can be dropped, and only then is any of it
 * committed.
 */

// Height, padding and border come from the console's field styles (32px).
const field: React.CSSProperties = {};

const helpText: React.CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--a-text-dim)',
  fontSize: 12,
};

/** `toFitBustIn` → "To fit bust", `fabric2` → "Fabric 2": catalogue keys made readable. */
const humanise = (key: string) =>
  key
    .replace(/In$/, '')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ ([A-Z])(?=[a-z])/g, (m) => m.toLowerCase());

const ANGLES = ['front', 'back', 'side', 'detail', 'lookShot', 'additional1', 'additional2'];

/** How many sizes carry at least one measurement. */
const measuredSizes = (product: ImportProduct) =>
  product.variants.filter((v) => v.measurementValues && Object.keys(v.measurementValues).length > 0)
    .length;

const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <div className="admin-card">
    <p className="admin-kpi-label">{label}</p>
    <p className="admin-kpi-value">{value}</p>
    {sub && <p className="admin-kpi-sub">{sub}</p>}
  </div>
);

export default function CatalogListingPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [products, setProducts] = useState<ImportProduct[]>([]);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState('');
  const [publish, setPublish] = useState(false);
  const [sellers, setSellers] = useState<SellerOption[] | null>(null);
  const [bulkCategory, setBulkCategory] = useState('');

  const chosen = products.filter((product) => !product.skip);

  const totals = useMemo(
    () => ({
      products: chosen.length,
      variants: chosen.reduce((sum, product) => sum + product.variants.length, 0),
      stock: chosen.reduce(
        (sum, product) => sum + product.variants.reduce((n, variant) => n + variant.stock, 0),
        0
      ),
      missingCategory: chosen.filter((product) => !product.category).length,
      incomplete: chosen.filter((product) => (product.missingForLive ?? []).length > 0).length,
      warnings: chosen.reduce((sum, product) => sum + product.issues.length, 0),
    }),
    [chosen]
  );

  const pickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []));
    setReview(null);
    setProducts([]);
    setResult(null);
    setError(null);
  };

  const runReview = async () => {
    setBusy('review');
    setError(null);
    try {
      const response = await reviewSheets(files);
      setReview(response);
      setProducts(response.products);
      setResult(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const edit = (key: string, patch: Partial<ImportProduct>) =>
    setProducts((current) =>
      current.map((product) => (product.key === key ? { ...product, ...patch } : product))
    );

  /** Apply a category to every product that has none — the common repair. */
  const fillCategories = () => {
    const name = bulkCategory.trim();
    if (!name) return;
    setProducts((current) =>
      current.map((product) => (product.category ? product : { ...product, category: name }))
    );
    setBulkCategory('');
  };

  const commit = async () => {
    setBusy('commit');
    setError(null);
    try {
      setResult(await commitImport(products, { vendorId: vendorId || undefined, publish }));
      setReview(null);
      setProducts([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Sheet listing</h1>
          <p className="admin-page-sub">
            Upload the sheet you already file with a marketplace — a Myntra SKU template, or any
            spreadsheet with a SKU, a name and a price. Nothing is written until you have read what
            it found.
          </p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      {/* ── Step one: the files ─────────────────────────────────────────── */}
      <div className="admin-card">
        <p className="admin-kpi-label">The sheets</p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '28px 16px',
            borderRadius: 'var(--a-radius-sm)',
            background: 'var(--a-surface-2)',
            boxShadow: 'inset 0 0 0 1px var(--a-edge)',
            textAlign: 'center',
          }}
        >
          <span className="admin-empty-icon" style={{ background: 'var(--a-surface)', margin: 0 }}>
            <Boxes size={22} />
          </span>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: 'var(--a-text)' }}>
            {files.length === 0
              ? 'Add your marketplace sheets'
              : `${files.length} sheet${files.length === 1 ? '' : 's'} ready to read`}
          </p>
          <p
            style={{
              maxWidth: '56ch',
              margin: 0,
              color: 'var(--a-text-dim)',
              fontSize: 13,
              overflowWrap: 'anywhere',
            }}
          >
            {files.length === 0
              ? 'A Myntra SKU template or any sheet with a SKU, name and price.'
              : files.map((file) => file.name).join(', ')}
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 8,
              marginTop: 4,
            }}
          >
            <label className="btn" style={{ cursor: 'pointer' }}>
              {files.length === 0 ? 'Choose sheets' : 'Choose other sheets'}
              <input
                type="file"
                multiple
                accept=".xlsx,.xlsm,.csv"
                onChange={pickFiles}
                style={{ display: 'none' }}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={runReview}
              disabled={files.length === 0 || busy !== null}
            >
              {busy === 'review' ? 'Reading…' : 'Read the sheets'}
            </button>
          </div>
          <p style={{ ...helpText, margin: 0 }}>.xlsx, .xlsm or .csv — several at once is fine.</p>
        </div>

        {review && (
          <p style={{ ...helpText, marginTop: 12 }}>
            {review.sheets
              .map(
                (sheet) =>
                  `${sheet.file} → “${sheet.sheet}”, ${sheet.rows} rows${
                    sheet.articleType
                      ? ` · read as the Myntra ${sheet.articleType} template, every column by its header`
                      : ''
                  }`
              )
              .join(' · ')}
            {review.sheets.some((sheet) => sheet.unmapped.length > 0) && (
              <>
                {' '}
                · columns not used:{' '}
                {[...new Set(review.sheets.flatMap((sheet) => sheet.unmapped))]
                  .slice(0, 6)
                  .join(', ')}
              </>
            )}
          </p>
        )}
      </div>

      {/* ── Step two: what it found ─────────────────────────────────────── */}
      {review && products.length > 0 && (
        <>
          <div className="admin-grid-kpi" style={{ margin: '16px 0' }}>
            <Kpi
              label="Products"
              value={totals.products}
              sub={`${review.summary.creating} new · ${review.summary.updating} already listed`}
            />
            <Kpi label="Sizes" value={totals.variants} sub={`${totals.stock} units of stock`} />
            <Kpi
              label="Needs a category"
              value={totals.missingCategory}
              sub={totals.missingCategory > 0 ? 'Cannot be listed until set' : 'All set'}
            />
            <Kpi
              label="Not ready to go live"
              value={totals.incomplete}
              sub={
                totals.incomplete > 0
                  ? 'Saved as drafts until the missing fields are filled'
                  : 'Every listing is complete'
              }
            />
            <Kpi
              label="Rows refused"
              value={review.summary.rejectedRows}
              sub={review.summary.rejectedRows > 0 ? 'Listed below' : 'None'}
            />
          </div>

          {(review.summary.newCategories.length > 0 || review.summary.newBrands.length > 0) && (
            <div className="admin-card" style={{ marginBottom: 16 }}>
              <p className="admin-kpi-label">Will be created</p>
              {review.summary.newCategories.length > 0 && (
                <p className="admin-kpi-sub" style={{ margin: '4px 0' }}>
                  Categories: {review.summary.newCategories.join(', ')}
                </p>
              )}
              {review.summary.newBrands.length > 0 && (
                <p className="admin-kpi-sub" style={{ margin: '4px 0' }}>
                  Brands: {review.summary.newBrands.join(', ')}
                </p>
              )}
              <p style={helpText}>
                A category or brand the sheet names but the shop does not have yet is made on import
                — you do not have to go and create it first.
              </p>
            </div>
          )}

          {totals.missingCategory > 0 && (
            <div className="admin-card" style={{ marginBottom: 16 }}>
              <p className="admin-kpi-label">Fill in the missing categories</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <input
                  aria-label="Category for products without one"
                  value={bulkCategory}
                  onChange={(event) => setBulkCategory(event.target.value)}
                  placeholder="e.g. Dresses"
                  style={{ ...field, minWidth: 220 }}
                />
                <button type="button" className="btn" onClick={fillCategories}>
                  Apply to all {totals.missingCategory} without one
                </button>
              </div>
            </div>
          )}

          <div className="admin-card">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>In</th>
                    <th>Article</th>
                    <th>Product</th>
                    <th>Colour</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Sizes</th>
                    <th>Listing data</th>
                    <th>Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <React.Fragment key={product.key}>
                      <tr style={{ opacity: product.skip ? 0.4 : 1 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!product.skip}
                            aria-label={`Include ${product.name}`}
                            onChange={(event) => edit(product.key, { skip: !event.target.checked })}
                          />
                        </td>
                        <td style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {product.articleNumber}
                          <span style={{ display: 'block', opacity: 0.45, fontSize: 10 }}>
                            {product.action === 'update' ? 'already listed' : 'new'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--admin-text)', maxWidth: 260 }}>
                          {product.name}
                        </td>
                        <td>{product.colorName}</td>
                        <td>
                          <input
                            value={product.category ?? ''}
                            onChange={(event) =>
                              edit(product.key, { category: event.target.value })
                            }
                            placeholder="Required"
                            style={{
                              ...field,
                              width: 130,
                              borderColor: product.category ? undefined : 'var(--a-warn-fill)',
                            }}
                          />
                        </td>
                        <td>
                          {formatCurrency(product.price)}
                          {product.mrp && product.mrp > product.price && (
                            <span style={{ opacity: 0.45 }}> / {formatCurrency(product.mrp)}</span>
                          )}
                        </td>
                        <td>{product.variants.length}</td>
                        <td style={{ minWidth: 170 }}>
                          {product.articleType ? (
                            <>
                              <span style={{ color: 'var(--admin-text)' }}>
                                {product.articleType}
                              </span>
                              <span
                                className="admin-kpi-sub"
                                style={{ display: 'block', margin: 0 }}
                              >
                                {Object.keys(product.attributes).length} attributes ·{' '}
                                {Object.keys(product.imageAngles ?? {}).length} angles ·{' '}
                                {measuredSizes(product)}/{product.variants.length} sizes measured
                              </span>
                              {(product.missingForLive ?? []).length > 0 ? (
                                <span
                                  className="admin-status-badge"
                                  data-status="PENDING"
                                  style={{ marginTop: 4, textTransform: 'none' }}
                                  title={product.missingForLive.map((m) => m.label).join('\n')}
                                >
                                  {product.missingForLive.length} missing for live
                                </span>
                              ) : (
                                <span
                                  className="admin-status-badge"
                                  data-status="ACTIVE"
                                  style={{ marginTop: 4, textTransform: 'none' }}
                                >
                                  Ready to go live
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ opacity: 0.4 }} title="Not a known marketplace template">
                              —
                            </span>
                          )}
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          {product.issues.length === 0 ? (
                            <span style={{ opacity: 0.4 }}>—</span>
                          ) : (
                            product.issues.map((issue, index) => (
                              <span
                                key={`${issue.code}-${index}`}
                                className="admin-status-badge"
                                style={{ marginRight: 4, textTransform: 'none' }}
                                title={issue.message}
                              >
                                {issue.message.length > 34
                                  ? `${issue.message.slice(0, 34)}…`
                                  : issue.message}
                              </span>
                            ))
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              setExpanded(expanded === product.key ? null : product.key)
                            }
                          >
                            {expanded === product.key ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>

                      {expanded === product.key && (
                        <tr>
                          <td colSpan={10} style={{ paddingBottom: 16 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                              <div style={{ minWidth: 300 }}>
                                <p className="admin-kpi-label">Sizes</p>
                                <table className="admin-table" style={{ minWidth: 280 }}>
                                  <thead>
                                    <tr>
                                      <th>Size</th>
                                      <th>SKU</th>
                                      {product.articleType && (
                                        <>
                                          <th>Standard</th>
                                          <th>GTIN</th>
                                          <th>Measured (in)</th>
                                        </>
                                      )}
                                      <th>Stock</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {product.variants.map((variant, index) => (
                                      <tr key={variant.sku}>
                                        <td style={{ color: 'var(--admin-text)' }}>
                                          {variant.size}
                                        </td>
                                        <td style={{ fontFamily: 'ui-monospace, monospace' }}>
                                          {variant.sku}
                                        </td>
                                        {product.articleType && (
                                          <>
                                            <td>
                                              {variant.standardSize ?? '—'}
                                              {variant.sizeOnLabel === true && (
                                                <span style={{ opacity: 0.5 }}> · on label</span>
                                              )}
                                            </td>
                                            <td style={{ fontFamily: 'ui-monospace, monospace' }}>
                                              {variant.gtin ?? (
                                                <span style={{ color: 'var(--admin-warn)' }}>
                                                  none
                                                </span>
                                              )}
                                            </td>
                                            <td>
                                              {Object.keys(variant.measurementValues ?? {}).length >
                                              0
                                                ? Object.entries(variant.measurementValues ?? {})
                                                    .map(
                                                      ([key, inches]) =>
                                                        `${humanise(key)} ${inches}`
                                                    )
                                                    .join(' · ')
                                                : '—'}
                                            </td>
                                          </>
                                        )}
                                        <td>
                                          <input
                                            type="number"
                                            min={0}
                                            value={variant.stock}
                                            onChange={(event) => {
                                              const next = [...product.variants];
                                              next[index] = {
                                                ...variant,
                                                stock: Number(event.target.value) || 0,
                                              };
                                              edit(product.key, { variants: next });
                                            }}
                                            style={{ ...field, width: 74 }}
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {product.sizeChart && (
                                <div>
                                  <p className="admin-kpi-label">
                                    Size chart, from the measurement columns
                                  </p>
                                  <pre
                                    className="admin-kpi-sub"
                                    style={{
                                      margin: 0,
                                      fontFamily: 'ui-monospace, monospace',
                                      fontSize: 11,
                                      lineHeight: 1.7,
                                      whiteSpace: 'pre',
                                    }}
                                  >
                                    {product.sizeChart}
                                  </pre>
                                </div>
                              )}

                              {Object.keys(product.attributes).length > 0 && (
                                <div style={{ maxWidth: 280 }}>
                                  <p className="admin-kpi-label">
                                    Attributes ({Object.keys(product.attributes).length})
                                  </p>
                                  {Object.entries(product.attributes).map(([key, value]) => (
                                    <p
                                      key={key}
                                      className="admin-kpi-sub"
                                      style={{ margin: '2px 0' }}
                                    >
                                      {product.articleType ? humanise(key) : key}:{' '}
                                      <span style={{ color: 'var(--admin-text)' }}>{value}</span>
                                    </p>
                                  ))}
                                </div>
                              )}

                              {product.articleType && (
                                <div style={{ maxWidth: 260 }}>
                                  <p className="admin-kpi-label">Image angles</p>
                                  {ANGLES.map((angle) => {
                                    const url = product.imageAngles?.[angle];
                                    return (
                                      <p
                                        key={angle}
                                        className="admin-kpi-sub"
                                        style={{ margin: '2px 0' }}
                                      >
                                        {humanise(angle)}:{' '}
                                        {url ? (
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: 'var(--admin-text)' }}
                                          >
                                            found
                                          </a>
                                        ) : (
                                          <span style={{ opacity: 0.45 }}>—</span>
                                        )}
                                      </p>
                                    );
                                  })}
                                </div>
                              )}

                              {(product.missingForLive ?? []).length > 0 && (
                                <div style={{ maxWidth: 280 }}>
                                  <p
                                    className="admin-kpi-label"
                                    style={{ color: 'var(--admin-warn)' }}
                                  >
                                    Missing for live
                                  </p>
                                  {product.missingForLive.map((missing) => (
                                    <p
                                      key={missing.key}
                                      className="admin-kpi-sub"
                                      style={{ margin: '2px 0' }}
                                    >
                                      {missing.label}
                                      <span style={{ opacity: 0.45 }}> · {missing.group}</span>
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {review.rejectedRows.length > 0 && (
            <div className="admin-card" style={{ marginTop: 16 }}>
              <p className="admin-kpi-label">Rows that could not be read</p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Sheet</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.rejectedRows.slice(0, 40).map((row) => (
                      <tr key={`${row.file}-${row.row}`}>
                        <td>{row.row}</td>
                        <td>{row.sheet}</td>
                        <td>{row.issues.map((issue) => issue.message).join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Step three: commit ──────────────────────────────────────── */}
          <div className="admin-card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <label
                  htmlFor="listing-seller"
                  style={{ color: 'var(--a-text-dim)', fontSize: 12, fontWeight: 550 }}
                >
                  Sold by
                </label>
                <select
                  id="listing-seller"
                  value={vendorId}
                  onFocus={() => {
                    if (!sellers)
                      listSellerOptions()
                        .then(setSellers)
                        .catch(() => setSellers([]));
                  }}
                  onChange={(event) => setVendorId(event.target.value)}
                  style={{ ...field, minWidth: 190 }}
                >
                  <option value="">Us — house stock</option>
                  {(sellers ?? []).map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.shopName}
                    </option>
                  ))}
                </select>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 32,
                  fontSize: 13,
                  color: 'var(--a-text)',
                }}
              >
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(event) => setPublish(event.target.checked)}
                />
                Publish immediately
              </label>

              <button
                type="button"
                className="btn btn-primary"
                style={{ marginLeft: 'auto' }}
                onClick={commit}
                disabled={busy !== null || totals.products === 0 || totals.missingCategory > 0}
                title={
                  totals.missingCategory > 0 ? 'Every product needs a category first' : undefined
                }
              >
                {busy === 'commit'
                  ? 'Listing…'
                  : `List ${totals.products} product(s), ${totals.variants} size(s)`}
              </button>
            </div>

            <p style={helpText}>
              {publish
                ? totals.incomplete > 0
                  ? `Complete listings go live as soon as they are listed; the ${totals.incomplete} missing required fields are saved as drafts.`
                  : 'These go live as soon as they are listed.'
                : 'Saved as drafts — add photographs, then publish.'}
            </p>
          </div>
        </>
      )}

      {/* ── Done ────────────────────────────────────────────────────────── */}
      {result && (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <p className="admin-kpi-label">Listed</p>
          <p className="admin-kpi-sub">
            {result.created} new · {result.updated} updated · {result.variants} size(s).
            {result.createdCategories.length > 0 && (
              <> Categories created: {result.createdCategories.join(', ')}.</>
            )}
          </p>
          {result.failures.length > 0 && (
            <div className="admin-table-wrap" style={{ marginTop: 12 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Could not be listed</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failures.map((failure) => (
                    <tr key={failure.sku}>
                      <td style={{ fontFamily: 'ui-monospace, monospace' }}>{failure.sku}</td>
                      <td>{failure.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(result.incomplete ?? []).length > 0 && (
            <div className="admin-table-wrap" style={{ marginTop: 12 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Saved as a draft — still needs</th>
                  </tr>
                </thead>
                <tbody>
                  {result.incomplete.map((entry) => (
                    <tr key={entry.sku}>
                      <td style={{ fontFamily: 'ui-monospace, monospace' }}>{entry.sku}</td>
                      <td>{entry.missing.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="admin-actions" style={{ marginTop: 16 }}>
            <Link href="/admin/products" className="btn">
              Back to products
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
