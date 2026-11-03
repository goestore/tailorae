'use client';

import React, { useEffect, useState } from 'react';
import { getSalesReport, type SalesReport } from '@/lib/admin-reports';
import { downloadFromApi } from '@/lib/admin-download';
import { formatPaise } from '@/lib/money';
import {
  BarList,
  CHART_COLORS,
  TimeSeriesChart,
  formatCompactINR,
  formatCount,
  formatINR,
} from '@/components/admin/charts';

/**
 * Sales over a date range (`GET /admin/reports?from&to`, FINANCE or SUPPORT):
 * totals, a day-by-day series, and the split by shop, category and product.
 * The same range downloads as CSV from the API.
 *
 * Amounts arrive in paise; the charts are fed rupees because their formatters
 * speak rupees.
 */

const day = (date: Date) => date.toISOString().slice(0, 10);

const defaultRange = () => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: day(from), to: day(to) };
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
  marginBottom: 16,
};

const twoUp: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 16,
  marginBottom: 16,
};

const TOTALS: Array<{ key: keyof SalesReport['totals']; label: string; money: boolean }> = [
  { key: 'gmvPaise', label: 'Gross sales', money: true },
  { key: 'orders', label: 'Orders', money: false },
  { key: 'averageOrderPaise', label: 'Average order', money: true },
  { key: 'commissionPaise', label: 'Commission earned', money: true },
  { key: 'discountsPaise', label: 'Discounts', money: true },
  { key: 'shippingPaise', label: 'Shipping charged', money: true },
  { key: 'refundsPaise', label: 'Refunds', money: true },
];

export function AnalyticsReport() {
  const [range, setRange] = useState(defaultRange);
  const [loaded, setLoaded] = useState<{ key: string; report: SalesReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const rangeKey = `${range.from}:${range.to}`;
  const report = loaded?.report ?? null;
  const isLoading = loaded?.key !== rangeKey && !error;

  useEffect(() => {
    let cancelled = false;
    getSalesReport(range.from, range.to)
      .then((result) => {
        if (!cancelled) setLoaded({ key: `${range.from}:${range.to}`, report: result });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const changeRange = (next: Partial<typeof range>) => {
    setError(null);
    setRange((current) => ({ ...current, ...next }));
  };

  const exportCsv = async () => {
    setIsExporting(true);
    setError(null);
    try {
      await downloadFromApi('/admin/reports', `sales-${range.from}-to-${range.to}.csv`, {
        from: range.from,
        to: range.to,
        format: 'csv',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const series = (report?.byDay ?? []).map((point) => ({
    date: point.date,
    sales: point.gmvPaise / 100,
    orders: point.orders,
  }));

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Analytics</h1>
          <p className="admin-page-sub">Sales, shops and categories over a date range.</p>
        </div>
        <div className="admin-page-actions">
          <label className="admin-kpi-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            From
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(event) => event.target.value && changeRange({ from: event.target.value })}
            />
          </label>
          <label className="admin-kpi-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            To
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(event) => event.target.value && changeRange({ to: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={isExporting}
            onClick={() => void exportCsv()}
          >
            {isExporting ? 'Exporting…' : 'Download CSV'}
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      <div style={grid}>
        {TOTALS.map((total) => (
          <div className="admin-card" key={total.key}>
            <p className="admin-kpi-label">{total.label}</p>
            <p className="admin-kpi-value">
              {report
                ? total.money
                  ? formatPaise(report.totals[total.key])
                  : formatCount(report.totals[total.key])
                : isLoading
                  ? '…'
                  : '—'}
            </p>
          </div>
        ))}
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <p className="admin-kpi-label" style={{ marginBottom: 12 }}>
          Gross sales by day
        </p>
        {series.length ? (
          <TimeSeriesChart
            data={series}
            valueKey="sales"
            format={formatINR}
            axisFormat={formatCompactINR}
            label="Gross sales by day"
          />
        ) : (
          <p className="ch-empty">{isLoading ? 'Loading…' : 'No orders in this period'}</p>
        )}
      </div>

      <div style={twoUp}>
        <div className="admin-card">
          <p className="admin-kpi-label" style={{ marginBottom: 12 }}>
            Sales by shop
          </p>
          <BarList
            rows={(report?.bySeller ?? []).map((seller) => ({
              label: seller.shopName,
              value: seller.gmvPaise / 100,
              sub: `${seller.orders} orders · ${formatPaise(seller.commissionPaise)} commission`,
            }))}
          />
        </div>
        <div className="admin-card">
          <p className="admin-kpi-label" style={{ marginBottom: 12 }}>
            Sales by category
          </p>
          <BarList
            color={CHART_COLORS[1]}
            rows={(report?.byCategory ?? []).map((category) => ({
              label: category.category,
              value: category.revenuePaise / 100,
              sub: `${category.units} units`,
            }))}
          />
        </div>
      </div>

      <div className="admin-card admin-index">
        <p className="admin-kpi-label" style={{ padding: '16px 16px 8px' }}>
          Best sellers
        </p>
        {report?.topProducts.length ? (
          <div className="admin-table-wrap" style={{ width: '100%', margin: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'right' }}>Units sold</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <span className="admin-row-title">{product.name}</span>
                    </td>
                    <td>{product.category ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{formatPaise(product.pricePaise)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCount(product.unitsSold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ch-empty" style={{ padding: '0 16px 16px' }}>
            {isLoading ? 'Loading…' : 'No products sold in this period'}
          </p>
        )}
      </div>
    </div>
  );
}
