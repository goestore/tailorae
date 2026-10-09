'use client';

import React, { useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import {
  exportCatalog,
  importCatalog,
  listSellerOptions,
  type ImportPlan,
  type ImportResult,
  type SellerOption,
} from '@/lib/admin-products';

/**
 * Bulk catalogue import.
 *
 * A seller arriving with three hundred SKUs across five colours and six sizes
 * is not going to fill in a form four thousand times. This is the door they
 * come through, and the export below is the other half of it: pull the
 * catalogue down, edit a stock column in a spreadsheet, push it back.
 *
 * Always two steps. The file is checked and reported on before anything is
 * written, because a misread column applied to a whole catalogue is not a
 * mistake you notice until a shopper does.
 */

const TEMPLATE = [
  'sku,name,price,category,brand,status,shortDescription,color,size,variantSku,variantQuantity,variantPrice',
  'POLO-001,Classic Polo,799,Men,,ACTIVE,Pique cotton polo,Navy,S,,12,',
  'POLO-001,Classic Polo,799,Men,,ACTIVE,,Navy,M,,18,',
  'POLO-001,Classic Polo,799,Men,,ACTIVE,,White,S,,6,',
].join('\n');

// Height, padding and border come from the console's field styles (32px).
const field: React.CSSProperties = {
  width: '100%',
};

const helpText: React.CSSProperties = { margin: 0, color: 'var(--a-text-dim)', fontSize: 12 };

/** Hand the browser a file without a round trip through the server. */
const download = (filename: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function CatalogImportPage() {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [sellers, setSellers] = useState<SellerOption[] | null>(null);

  const loadSellers = () => {
    if (sellers) return;
    listSellerOptions()
      .then(setSellers)
      .catch(() => setSellers([]));
  };

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPlan(null);
    setResult(null);
    file
      .text()
      .then(setCsv)
      .catch(() => setError('That file could not be read.'));
  };

  const run = async (commit: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const outcome = await importCatalog(csv, {
        commit,
        vendorId: vendorId || undefined,
      });
      setMessage(outcome.message);
      if (outcome.plan) {
        setPlan(outcome.plan);
        setResult(null);
      }
      if (outcome.result) {
        setResult(outcome.result);
        setPlan(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportNow = async () => {
    setBusy(true);
    setError(null);
    try {
      download('catalogue.csv', await exportCatalog(vendorId || undefined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Import catalogue</h1>
          <p className="admin-page-sub">
            One row per variant, with the product&rsquo;s own columns repeated. Products are matched
            on SKU, so re-importing a corrected file updates rather than duplicates.
          </p>
        </div>
        <div className="admin-page-actions">
          <button
            type="button"
            className="btn"
            onClick={() => download('catalogue-template.csv', TEMPLATE)}
          >
            Download template
          </button>
          <button type="button" className="btn" onClick={exportNow} disabled={busy}>
            Export current catalogue
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}
      {message && !error && (
        <div className="admin-alert" role="status" style={{ marginBottom: 16 }}>
          <span>{message}</span>
        </div>
      )}

      <div className="admin-card">
        <p className="admin-kpi-label">The file</p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <label className="btn" style={{ cursor: 'pointer' }}>
            Choose a CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={readFile}
              style={{ display: 'none' }}
            />
          </label>
          <span style={helpText}>{fileName ?? 'No file chosen — or paste the rows below.'}</span>
        </div>

        <textarea
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value);
            setPlan(null);
            setResult(null);
          }}
          rows={10}
          spellCheck={false}
          aria-label="CSV rows"
          placeholder="sku,name,price,category,… — paste the rows here"
          style={{ ...field, display: 'block', resize: 'vertical' }}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 12,
            marginTop: 12,
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <label
              htmlFor="import-seller"
              style={{ color: 'var(--a-text-dim)', fontSize: 12, fontWeight: 550 }}
            >
              Sold by
            </label>
            <select
              id="import-seller"
              value={vendorId}
              onFocus={loadSellers}
              onChange={(event) => setVendorId(event.target.value)}
              style={{ minWidth: 220 }}
            >
              <option value="">Us — house stock</option>
              {(sellers ?? []).map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.shopName}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginLeft: 'auto' }}
            onClick={() => run(false)}
            disabled={busy || csv.trim() === ''}
          >
            {busy ? 'Checking…' : 'Check the file'}
          </button>
        </div>
      </div>

      {plan && (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <p className="admin-kpi-label">What this would do</p>

          <div className="admin-grid-kpi" style={{ marginTop: 12, marginBottom: 12 }}>
            <div className="admin-card">
              <p className="admin-kpi-label">New</p>
              <p className="admin-kpi-value">{plan.summary.creating}</p>
            </div>
            <div className="admin-card">
              <p className="admin-kpi-label">Updated</p>
              <p className="admin-kpi-value">{plan.summary.updating}</p>
            </div>
            <div className="admin-card">
              <p className="admin-kpi-label">Variants</p>
              <p className="admin-kpi-value">{plan.summary.variants}</p>
            </div>
            <div className="admin-card">
              <p className="admin-kpi-label">Rows refused</p>
              <p className="admin-kpi-value">{plan.summary.errors}</p>
            </div>
          </div>

          {plan.summary.missingCategories.length > 0 && (
            <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
              <span>
                Unknown categor{plan.summary.missingCategories.length === 1 ? 'y' : 'ies'}:{' '}
                {plan.summary.missingCategories.join(', ')}. Create{' '}
                {plan.summary.missingCategories.length === 1 ? 'it' : 'them'} on the{' '}
                <Link href="/admin/products" className="underline">
                  products page
                </Link>{' '}
                first — the import will not invent a category.
              </span>
            </div>
          )}

          {plan.summary.ignoredColumns.length > 0 && (
            <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
              Columns ignored: {plan.summary.ignoredColumns.join(', ')}
            </p>
          )}

          {plan.errors.length > 0 && (
            <div className="admin-table-wrap" style={{ marginBottom: 12 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Why it was refused</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.errors.slice(0, 50).map((row, index) => (
                    <tr key={`${row.row}-${index}`}>
                      <td>{row.row}</td>
                      <td>{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.errors.length > 50 && (
                <p className="admin-kpi-sub">…and {plan.errors.length - 50} more.</p>
              )}
            </div>
          )}

          {plan.preview.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Action</th>
                    <th>Variants</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.preview.map((row) => (
                    <tr key={row.sku}>
                      <td>{row.sku}</td>
                      <td>{row.name}</td>
                      <td>{row.action === 'create' ? 'Create' : 'Update'}</td>
                      <td>{row.variants}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-actions" style={{ marginTop: 16, flexWrap: 'wrap' }}>
            {plan.summary.errors > 0 && (
              <span style={helpText}>Refused rows are skipped; everything else still goes in.</span>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => run(true)}
              disabled={
                busy ||
                plan.summary.missingCategories.length > 0 ||
                plan.summary.creating + plan.summary.updating === 0
              }
            >
              {busy
                ? 'Importing…'
                : `Import ${plan.summary.creating + plan.summary.updating} product(s)`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <p className="admin-kpi-label">Done</p>
          <p className="admin-kpi-sub">
            {result.created} created · {result.updated} updated · {result.variants} variant(s)
            written.
          </p>
          {result.failures.length > 0 && (
            <div className="admin-table-wrap" style={{ marginTop: 12 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Could not be saved</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failures.map((failure) => (
                    <tr key={failure.sku}>
                      <td>{failure.sku}</td>
                      <td>{failure.message}</td>
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
