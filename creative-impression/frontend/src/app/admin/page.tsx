'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { getQueueCounts, type AdminQueueCounts } from '@/lib/admin-moderation';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  ArrowRight,
  Boxes,
  Package,
  ShieldCheck,
  ShoppingBag,
  Store,
  Wallet,
  Users,
  RotateCcw,
  BarChart3,
  Calendar,
  type IconProps,
} from '@/components/admin/icons';
import { ToneIcon, toneSolid, type Tone } from '@/components/admin/tone';
import {
  BarList,
  CHART_COLORS,
  Delta,
  Donut,
  Sparkline,
  TimeSeriesChart,
  formatCompactINR,
  formatCount,
  formatINR,
} from '@/components/admin/charts';

/**
 * The store at a glance, in the Shopify-analytics idiom:
 *  1. what needs a person now;
 *  2. the period's headline figures, each with its change and trend;
 *  3. sales over time, switchable between sales, orders and customers;
 *  4. how the period breaks down — status, payment, category, seller;
 *  5. what sold, what is running out, and the latest orders.
 *
 * Figures come from GET /api/admin/report?days=7|30|90 (the analytics) and
 * GET /api/admin/dashboard (stock and recent orders). Nothing is invented: a
 * period with no sales says so.
 */

type Days = 7 | 30 | 90;

interface Report {
  range: { days: number; from: string; to: string };
  totals: {
    grossSales: number;
    paidRevenue: number;
    orders: number;
    averageOrder: number;
    newCustomers: number;
    unitsSold: number;
    returns: number;
  };
  previous: {
    grossSales: number;
    paidRevenue: number;
    orders: number;
    averageOrder: number;
    newCustomers: number;
    returns: number;
  };
  changes: Record<string, number | null>;
  series: Array<{
    date: string;
    grossSales: number;
    paidRevenue: number;
    orders: number;
    newCustomers: number;
  }>;
  statusMix: Array<{ status: string; count: number }>;
  paymentMix: Array<{ method: string; count: number; value: number }>;
  categories: Array<{ category: string; sales: number; units: number }>;
  topProducts: Array<{
    id: string;
    name: string;
    thumbnail: string | null;
    category: string;
    sales: number;
    units: number;
  }>;
  sellers: Array<{ vendorId: string | null; name: string; sales: number; units: number }>;
  accounts: { customers: number; b2bBuyers: number; sellers: number; admins: number };
}

interface DashboardBasics {
  stats: {
    pendingOrders: number;
    missingImages: number;
    codPendingRevenue: number;
    totalProducts: number;
  };
  lowStock: Array<{ id: string; name: string; quantity: number }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    createdAt: string;
    user?: { email: string; firstName?: string; lastName?: string } | null;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#29845a',
  SHIPPED: '#005bd3',
  READY_FOR_SHIPMENT: '#0094d5',
  PROCESSING: '#7a6fd8',
  CONFIRMED: '#b28400',
  PENDING: '#e8a700',
  CANCELLED: '#e51c00',
  RETURNED: '#d55181',
};
const humanStatus = (s: string) =>
  s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/* ── Pieces ───────────────────────────────────────────────────────── */

function QueueTile({
  label,
  value,
  href,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  href: string;
  tone: Tone;
  icon: React.FC<IconProps>;
}) {
  // An empty queue goes grey: colour is for what needs doing.
  return (
    <Link href={href} className="admin-kpi-link">
      <div className="admin-card db-queue">
        <ToneIcon icon={Icon} tone={value ? tone : 'neutral'} />
        <span className="db-queue-text">
          <span>{label}</span>
          <strong>{value === null ? '—' : formatCount(value)}</strong>
        </span>
        <ArrowRight size={16} className="db-queue-arrow" />
      </div>
    </Link>
  );
}

function KpiCard({
  label,
  value,
  change,
  previous,
  trend,
  inverse,
  icon,
  tone,
}: {
  icon: React.FC<IconProps>;
  tone: Tone;
  label: string;
  value: string;
  change: number | null | undefined;
  previous: string;
  trend?: number[];
  inverse?: boolean;
}) {
  return (
    <div className="admin-card db-kpi">
      {/* Six of these share a row, so nothing sits side by side that could
          squeeze the label: chip and change on top, then label, figure, the
          comparison, and the trend across the full width. */}
      <div className="db-kpi-top">
        <ToneIcon icon={icon} tone={tone} size="sm" />
        <Delta value={change} inverse={inverse} />
      </div>
      <span className="db-kpi-label">{label}</span>
      <div className="db-kpi-value">{value}</div>
      <div className="db-kpi-prev">vs {previous} last period</div>
      {/* A flat line says nothing and reads as an underline glitch. */}
      {trend && new Set(trend).size > 1 && (
        <div className="db-kpi-spark">
          <Sparkline values={trend} width={160} height={28} color={toneSolid(tone)} fluid />
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-card">
      <div className="db-card-head">
        <div>
          <h2 className="db-card-title">{title}</h2>
          {sub && <p className="db-card-sub">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

const METRICS = [
  {
    key: 'grossSales',
    label: 'Gross sales',
    format: formatINR,
    axis: formatCompactINR,
    kind: 'area' as const,
  },
  { key: 'orders', label: 'Orders', format: formatCount, axis: formatCount, kind: 'bar' as const },
  {
    key: 'newCustomers',
    label: 'New customers',
    format: formatCount,
    axis: formatCount,
    kind: 'bar' as const,
  },
];

export default function AdminDashboard() {
  const [days, setDays] = useState<Days>(30);
  const [report, setReport] = useState<Report | null>(null);
  const [basics, setBasics] = useState<DashboardBasics | null>(null);
  const [queues, setQueues] = useState<AdminQueueCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState(METRICS[0].key);
  const [loadedDays, setLoadedDays] = useState<Days | null>(null);

  useEffect(() => {
    let cancelled = false;
    getQueueCounts()
      .then((counts) => !cancelled && setQueues(counts))
      .catch(() => {});
    apiClient
      .get('/admin/dashboard')
      .then((res) => !cancelled && setBasics(res.data?.data ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/admin/report', { params: { days } })
      .then((res) => {
        if (cancelled) return;
        setReport(res.data?.data ?? null);
        setError(null);
      })
      .catch((err) => !cancelled && setError(getApiErrorMessage(err, 'Could not load the report.')))
      .finally(() => !cancelled && setLoadedDays(days));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const loading = loadedDays !== days;
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const header = (
    <div className="db-head">
      <div>
        <h1 className="admin-page-title">Dashboard</h1>
        <p className="admin-page-sub">
          {report
            ? `${new Date(`${report.range.from}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(`${report.range.to}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · compared with the previous ${days} days`
            : 'Store performance at a glance'}
        </p>
      </div>
      <div className="db-head-actions">
        <div className="db-range" role="group" aria-label="Reporting period">
          <span className="db-range-icon" aria-hidden="true">
            <Calendar size={15} />
          </span>
          {([7, 30, 90] as Days[]).map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
              {d === 7 ? 'Last 7 days' : d === 30 ? 'Last 30 days' : 'Last 90 days'}
            </button>
          ))}
        </div>
        <span className="db-head-divider" aria-hidden="true" />
        <Link href="/admin/operations/orders" className="btn">
          View orders
        </Link>
        <Link href="/admin/products/new" className="btn btn-primary">
          Add product
        </Link>
      </div>
    </div>
  );

  const t = report?.totals;
  const p = report?.previous;
  const c = report?.changes ?? {};
  const series = report?.series ?? [];

  return (
    <div style={{ opacity: loading && report ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      {header}
      {error && (
        <p className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      {/* 1 — Needs attention */}
      <div className="db-grid db-grid--queue">
        <QueueTile
          label="Listings to review"
          value={queues ? queues.productsAwaitingModeration : null}
          href="/admin/moderation"
          tone="amber"
          icon={ShieldCheck}
        />
        <QueueTile
          label="Sellers to verify"
          value={queues ? queues.sellersAwaitingKyc : null}
          href="/admin/sellers"
          tone="violet"
          icon={Store}
        />
        <QueueTile
          label="Orders to confirm"
          value={basics ? basics.stats.pendingOrders : null}
          href="/admin/operations/orders"
          tone="green"
          icon={ShoppingBag}
        />
        <QueueTile
          label="Low stock"
          value={basics ? basics.lowStock.length : null}
          href="/admin/products?stock=low"
          tone="rose"
          icon={Boxes}
        />
        <QueueTile
          label="Missing images"
          value={basics ? basics.stats.missingImages : null}
          href="/admin/products?images=missing"
          tone="blue"
          icon={Package}
        />
      </div>

      {/* 2 — Headline figures */}
      {t && p ? (
        <div className="db-grid db-grid--kpi">
          <KpiCard
            icon={Wallet}
            tone="green"
            label="Gross sales"
            value={formatINR(t.grossSales)}
            change={c.grossSales}
            previous={formatINR(p.grossSales)}
            trend={series.map((s) => s.grossSales)}
          />
          <KpiCard
            icon={ShoppingBag}
            tone="blue"
            label="Orders"
            value={formatCount(t.orders)}
            change={c.orders}
            previous={formatCount(p.orders)}
            trend={series.map((s) => s.orders)}
          />
          <KpiCard
            icon={BarChart3}
            tone="violet"
            label="Average order value"
            value={formatINR(t.averageOrder)}
            change={c.averageOrder}
            previous={formatINR(p.averageOrder)}
          />
          <KpiCard
            icon={Wallet}
            tone="green"
            label="Paid revenue"
            value={formatINR(t.paidRevenue)}
            change={c.paidRevenue}
            previous={formatINR(p.paidRevenue)}
            trend={series.map((s) => s.paidRevenue)}
          />
          <KpiCard
            icon={Users}
            tone="teal"
            label="New customers"
            value={formatCount(t.newCustomers)}
            change={c.newCustomers}
            previous={formatCount(p.newCustomers)}
            trend={series.map((s) => s.newCustomers)}
          />
          <KpiCard
            icon={RotateCcw}
            tone="rose"
            label="Returns"
            value={formatCount(t.returns)}
            change={c.returns}
            previous={formatCount(p.returns)}
            inverse
          />
        </div>
      ) : (
        <div className="db-grid db-grid--kpi">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-card db-kpi">
              <div className="a-skel a-skel--text" style={{ width: '45%' }} />
              <div className="a-skel a-skel--value" />
              <div className="a-skel a-skel--text" style={{ width: '60%' }} />
            </div>
          ))}
        </div>
      )}

      {/* 3 — Sales over time + accounts/payments */}
      <div className="db-grid db-grid--main">
        <section className="admin-card">
          <div className="db-tabs" role="tablist" aria-label="Chart metric">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={metric === m.key}
                className="db-tab"
                onClick={() => setMetric(m.key)}
              >
                <span>{m.label}</span>
                <strong>{t ? m.format(t[m.key as keyof Report['totals']] as number) : '—'}</strong>
              </button>
            ))}
          </div>
          {series.length ? (
            <TimeSeriesChart
              data={series}
              valueKey={active.key}
              compareKey={active.key === 'grossSales' ? 'paidRevenue' : undefined}
              kind={active.kind}
              format={active.format}
              axisFormat={active.axis}
              label={active.label}
              color={active.key === 'newCustomers' ? CHART_COLORS[1] : CHART_COLORS[0]}
            />
          ) : (
            <div className="a-skel" style={{ height: 240 }} />
          )}
          {active.key === 'grossSales' && (
            <div className="a-legend" style={{ marginTop: 8 }}>
              <span className="a-legend-item">
                <span className="a-legend-swatch" style={{ background: CHART_COLORS[0] }} /> Gross
                sales (every order not cancelled)
              </span>
              <span className="a-legend-item">
                <span className="a-legend-swatch" style={{ background: '#8a8a8a' }} /> Paid (payment
                received)
              </span>
            </div>
          )}
        </section>

        <div className="db-stack">
          <Card title="Accounts" sub="Everyone with a login">
            <div className="db-accounts">
              <div>
                <span>Customers</span>
                <strong>{report ? formatCount(report.accounts.customers) : '—'}</strong>
              </div>
              <div>
                <span>B2B buyers</span>
                <strong>{report ? formatCount(report.accounts.b2bBuyers) : '—'}</strong>
              </div>
              <div>
                <span>Sellers</span>
                <strong>{report ? formatCount(report.accounts.sellers) : '—'}</strong>
              </div>
              <div>
                <span>Admins</span>
                <strong>{report ? formatCount(report.accounts.admins) : '—'}</strong>
              </div>
            </div>
          </Card>
          <Card title="Payment methods" sub="Share of sales value">
            {report && report.paymentMix.length ? (
              <Donut
                size={132}
                format={formatCompactINR}
                centerLabel="sales"
                data={report.paymentMix.map((m, i) => ({
                  label:
                    m.method === 'COD'
                      ? 'Cash on delivery'
                      : m.method === 'RAZORPAY'
                        ? 'Online (Razorpay)'
                        : m.method,
                  value: m.value,
                  color: CHART_COLORS[i],
                }))}
              />
            ) : (
              <p className="ch-empty">No sales in this period</p>
            )}
          </Card>
        </div>
      </div>

      {/* 4 — Breakdowns */}
      <div className="db-grid db-grid--three">
        <Card title="Orders by status" sub={`All orders placed in the last ${days} days`}>
          {report && report.statusMix.length ? (
            <Donut
              format={formatCount}
              centerLabel="orders"
              data={report.statusMix.map((s) => ({
                label: humanStatus(s.status),
                value: s.count,
                color: STATUS_COLORS[s.status] ?? '#8a8a8a',
              }))}
            />
          ) : (
            <p className="ch-empty">No orders in this period</p>
          )}
        </Card>
        <Card title="Sales by category" sub="Order value, excluding cancelled">
          <BarList
            rows={(report?.categories ?? []).map((cat) => ({
              label: cat.category,
              value: cat.sales,
              sub: `${cat.units} units`,
            }))}
          />
        </Card>
        <Card
          title="Sales by seller"
          sub="House stock and marketplace shops"
          action={
            <Link href="/admin/payouts" className="admin-link">
              Payouts
            </Link>
          }
        >
          <BarList
            color={CHART_COLORS[1]}
            rows={(report?.sellers ?? []).map((s) => ({
              label: s.name,
              value: s.sales,
              sub: `${s.units} units`,
            }))}
          />
        </Card>
      </div>

      {/* 5 — Products, stock, orders */}
      <div className="db-grid db-grid--two">
        <Card
          title="Top products"
          sub="By units sold in this period"
          action={
            <Link href="/admin/products" className="admin-link">
              All products
            </Link>
          }
        >
          {report && report.topProducts.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Units
                    </th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Sales
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.topProducts.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
                        >
                          <span className="db-thumb">
                            <ProductThumb src={row.thumbnail} alt="" className="h-9 w-9" />
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <Link
                              href={`/admin/products/${row.id}`}
                              style={{
                                color: 'var(--a-text)',
                                fontWeight: 550,
                                textDecoration: 'none',
                              }}
                            >
                              {row.name}
                            </Link>
                            <span
                              style={{ display: 'block', color: 'var(--a-text-dim)', fontSize: 12 }}
                            >
                              {row.category}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatCount(row.units)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatINR(row.sales)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ch-empty">Nothing sold in this period</p>
          )}
        </Card>

        <Card
          title="Low stock"
          sub="Live products with fewer than 10 left"
          action={
            <Link href="/admin/products?stock=low" className="admin-link">
              Manage stock
            </Link>
          }
        >
          <BarList
            color="#b28400"
            format={(v) => (v <= 0 ? 'Sold out' : `${v} left`)}
            empty="Everything is well stocked"
            rows={(basics?.lowStock ?? []).map((row) => ({ label: row.name, value: row.quantity }))}
          />
        </Card>
      </div>

      <Card
        title="Recent orders"
        action={
          <Link href="/admin/operations/orders" className="admin-link">
            View all orders
          </Link>
        }
      >
        {basics && basics.recentOrders.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {['Order', 'Date', 'Customer', 'Status', 'Total'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      style={h === 'Total' ? { textAlign: 'right' } : undefined}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {basics.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        style={{ color: 'var(--a-text)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td style={{ color: 'var(--a-text-dim)' }}>
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td>{order.user?.email ?? '—'}</td>
                    <td>
                      <span className="admin-status-badge" data-status={order.status}>
                        {humanStatus(order.status)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatINR(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ch-empty">No orders yet</p>
        )}
      </Card>
    </div>
  );
}
