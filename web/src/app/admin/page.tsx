'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  daysBetween,
  getDashboard,
  getRecentOrders,
  getSalesReport,
  isoDay,
  type Dashboard,
  type OrderSummary,
  type SalesReport,
} from '@/lib/admin-reports';
import { formatPaise } from '@/lib/money';
import { useCan } from '@/components/admin/StaffContext';
import {
  ArrowRight,
  Package,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
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
 *  3. sales over time, switchable between sales and orders;
 *  4. how the period breaks down — category and shop;
 *  5. what sold, what is running out, and the latest orders.
 *
 * `GET /admin/dashboard` (any staff member) gives the queues, the store's
 * standing figures, the last seven days, low stock and unpaid cash on delivery.
 * The period analytics come from `GET /admin/reports?from&to` — twice, for this
 * period and the one before it — which needs FINANCE or SUPPORT; staff without
 * either see the seven-day view instead. Every amount arrives in paise; the
 * charts format rupees, so they are fed paise / 100.
 */

type Days = 7 | 30 | 90;

interface Period {
  from: string;
  to: string;
}

/** This period and the equally long one before it, ending today. */
function periods(days: Days): { current: Period; previous: Period } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return {
    current: { from: isoDay(from), to: isoDay(to) },
    previous: { from: isoDay(prevFrom), to: isoDay(prevTo) },
  };
}

/** Percentage change; null when there is nothing to compare with. */
function change(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const humanStatus = (s: string) =>
  s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

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
  change: delta,
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
  change?: number | null;
  /** The previous period's figure; left out on a card with nothing to compare. */
  previous?: string;
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
        {previous !== undefined && <Delta value={delta} inverse={inverse} />}
      </div>
      <span className="db-kpi-label">{label}</span>
      <div className="db-kpi-value">{value}</div>
      {previous !== undefined && <div className="db-kpi-prev">vs {previous} last period</div>}
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

const KpiSkeletons = () => (
  <div className="db-grid db-grid--kpi">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="admin-card db-kpi">
        <div className="a-skel a-skel--text" style={{ width: '45%' }} />
        <div className="a-skel a-skel--value" />
        <div className="a-skel a-skel--text" style={{ width: '60%' }} />
      </div>
    ))}
  </div>
);

/* ── Page ─────────────────────────────────────────────────────────── */

const METRICS = [
  {
    key: 'sales',
    label: 'Gross sales',
    format: formatINR,
    axis: formatCompactINR,
    kind: 'area' as const,
  },
  { key: 'orders', label: 'Orders', format: formatCount, axis: formatCount, kind: 'bar' as const },
];

interface Loaded<T> {
  key: string;
  value: T;
}

export default function AdminDashboard() {
  const can = useCan();
  /** The period analytics and the order list need FINANCE or SUPPORT. */
  const canReport = can('FINANCE', 'SUPPORT');
  const canCatalogue = can('MODERATOR');

  const [days, setDays] = useState<Days>(30);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [reports, setReports] = useState<Loaded<{
    current: SalesReport;
    previous: SalesReport;
  }> | null>(null);
  const [recent, setRecent] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState(METRICS[0].key);

  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((data) => !cancelled && setDashboard(data))
      .catch((err: Error) => !cancelled && setError(err.message));
    if (canReport) {
      getRecentOrders(8)
        .then((rows) => !cancelled && setRecent(rows))
        .catch(() => !cancelled && setRecent([]));
    }
    return () => {
      cancelled = true;
    };
  }, [canReport]);

  useEffect(() => {
    if (!canReport) return;
    let cancelled = false;
    const { current, previous } = periods(days);
    Promise.all([
      getSalesReport(current.from, current.to),
      getSalesReport(previous.from, previous.to),
    ])
      .then(([now, before]) => {
        if (cancelled) return;
        setReports({ key: String(days), value: { current: now, previous: before } });
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [days, canReport]);

  const loading = canReport && reports?.key !== String(days);
  const report = reports?.value.current ?? null;
  const before = reports?.value.previous ?? null;
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const stats = dashboard?.stats;
  const queues = dashboard?.queues;

  /** One point per day, rupees for the chart. Quiet days are zero, not gaps. */
  const series: Array<{ date: string; sales: number; orders: number }> = report
    ? (() => {
        const byDate = new Map(report.byDay.map((d) => [d.date, d]));
        return daysBetween(report.from, report.to).map((date) => ({
          date,
          sales: (byDate.get(date)?.gmvPaise ?? 0) / 100,
          orders: byDate.get(date)?.orders ?? 0,
        }));
      })()
    : (dashboard?.week ?? []).map((d) => ({
        date: d.date,
        sales: d.revenuePaise / 100,
        orders: d.orders,
      }));

  const t = report?.totals;
  const p = before?.totals;
  const topProducts = report?.topProducts ?? dashboard?.topProducts ?? [];

  const header = (
    <div className="db-head">
      <div>
        <h1 className="admin-page-title">Dashboard</h1>
        <p className="admin-page-sub">
          {report
            ? `${shortDate(report.from)} – ${new Date(`${report.to}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · compared with the previous ${days} days`
            : canReport
              ? 'Store performance at a glance'
              : 'The last seven days at a glance'}
        </p>
      </div>
      <div className="db-head-actions">
        {canReport && (
          <>
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
          </>
        )}
        {canCatalogue && (
          <Link href="/admin/products/new" className="btn btn-primary">
            Add product
          </Link>
        )}
      </div>
    </div>
  );

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
        {can('MODERATOR') && (
          <QueueTile
            label="Listings to review"
            value={queues ? queues.productsAwaitingModeration : null}
            href="/admin/moderation"
            tone="amber"
            icon={ShieldCheck}
          />
        )}
        {can('KYC_REVIEW', 'SUPPORT', 'FINANCE') && (
          <QueueTile
            label="Sellers to review"
            value={queues ? queues.sellersAwaitingReview : null}
            href="/admin/sellers"
            tone="violet"
            icon={Store}
          />
        )}
        {can('MODERATOR') && (
          <QueueTile
            label="Brands to review"
            value={queues ? queues.brandsAwaitingReview : null}
            href="/admin/operations/brands"
            tone="blue"
            icon={Tags}
          />
        )}
        {can('SUPPORT') && (
          <QueueTile
            label="Open returns"
            value={queues ? queues.returnsOpen : null}
            href="/admin/operations/returns"
            tone="rose"
            icon={RotateCcw}
          />
        )}
        {can('FINANCE') && (
          <QueueTile
            label="Withdrawals to pay"
            value={queues ? queues.withdrawalsOpen : null}
            href="/admin/payouts"
            tone="green"
            icon={Wallet}
          />
        )}
        {canReport && (
          <QueueTile
            label="Orders to ship"
            value={stats ? stats.ordersToShip : null}
            href="/admin/operations/orders"
            tone="green"
            icon={ShoppingBag}
          />
        )}
        {canCatalogue && (
          <QueueTile
            label="Missing images"
            value={stats ? stats.productsWithoutImages : null}
            href="/admin/products?images=missing"
            tone="blue"
            icon={Package}
          />
        )}
      </div>

      {/* 2 — Headline figures */}
      {canReport ? (
        t && p ? (
          <div className="db-grid db-grid--kpi">
            <KpiCard
              icon={Wallet}
              tone="green"
              label="Gross sales"
              value={formatPaise(t.gmvPaise)}
              change={change(t.gmvPaise, p.gmvPaise)}
              previous={formatPaise(p.gmvPaise)}
              trend={series.map((s) => s.sales)}
            />
            <KpiCard
              icon={ShoppingBag}
              tone="blue"
              label="Orders"
              value={formatCount(t.orders)}
              change={change(t.orders, p.orders)}
              previous={formatCount(p.orders)}
              trend={series.map((s) => s.orders)}
            />
            <KpiCard
              icon={BarChart3}
              tone="violet"
              label="Average order value"
              value={formatPaise(t.averageOrderPaise)}
              change={change(t.averageOrderPaise, p.averageOrderPaise)}
              previous={formatPaise(p.averageOrderPaise)}
            />
            <KpiCard
              icon={Store}
              tone="amber"
              label="Commission earned"
              value={formatPaise(t.commissionPaise)}
              change={change(t.commissionPaise, p.commissionPaise)}
              previous={formatPaise(p.commissionPaise)}
            />
            <KpiCard
              icon={Wallet}
              tone="teal"
              label="Discounts given"
              value={formatPaise(t.discountsPaise)}
              change={change(t.discountsPaise, p.discountsPaise)}
              previous={formatPaise(p.discountsPaise)}
              inverse
            />
            <KpiCard
              icon={RotateCcw}
              tone="rose"
              label="Refunds"
              value={formatPaise(t.refundsPaise)}
              change={change(t.refundsPaise, p.refundsPaise)}
              previous={formatPaise(p.refundsPaise)}
              inverse
            />
          </div>
        ) : (
          <KpiSkeletons />
        )
      ) : stats ? (
        <div className="db-grid db-grid--kpi">
          <KpiCard icon={ShoppingBag} tone="blue" label="Orders today" value={formatCount(stats.ordersToday)} />
          <KpiCard
            icon={ShoppingBag}
            tone="blue"
            label="Orders this month"
            value={formatCount(stats.ordersThisMonth)}
            trend={series.map((s) => s.orders)}
          />
          <KpiCard
            icon={Wallet}
            tone="green"
            label="Sales this month"
            value={formatPaise(stats.gmvThisMonthPaise)}
            trend={series.map((s) => s.sales)}
          />
          <KpiCard icon={Users} tone="teal" label="Customers" value={formatCount(stats.totalCustomers)} />
          <KpiCard icon={Package} tone="violet" label="Live products" value={formatCount(stats.liveProducts)} />
          <KpiCard icon={Store} tone="amber" label="Live shops" value={formatCount(stats.liveSellers)} />
        </div>
      ) : (
        <KpiSkeletons />
      )}

      {/* 3 — Sales over time + the store's standing figures */}
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
                <strong>
                  {series.length
                    ? m.format(
                        series.reduce(
                          (sum, point) => sum + point[m.key as 'sales' | 'orders'],
                          0
                        )
                      )
                    : '—'}
                </strong>
              </button>
            ))}
          </div>
          {series.length ? (
            <TimeSeriesChart
              data={series}
              valueKey={active.key}
              kind={active.kind}
              format={active.format}
              axisFormat={active.axis}
              label={active.label}
              color={active.key === 'orders' ? CHART_COLORS[1] : CHART_COLORS[0]}
            />
          ) : (
            <div className="a-skel" style={{ height: 240 }} />
          )}
          <div className="a-legend" style={{ marginTop: 8 }}>
            <span className="a-legend-item">
              <span className="a-legend-swatch" style={{ background: CHART_COLORS[0] }} />
              {report ? 'Every order not cancelled, by day' : 'The last seven days'}
            </span>
          </div>
        </section>

        <div className="db-stack">
          <Card title="Store" sub="Standing figures, not limited to the period">
            <div className="db-accounts">
              <div>
                <span>Customers</span>
                <strong>{stats ? formatCount(stats.totalCustomers) : '—'}</strong>
              </div>
              <div>
                <span>Live shops</span>
                <strong>{stats ? formatCount(stats.liveSellers) : '—'}</strong>
              </div>
              <div>
                <span>Live products</span>
                <strong>{stats ? formatCount(stats.liveProducts) : '—'}</strong>
              </div>
              <div>
                <span>Sales this month</span>
                <strong>{stats ? formatPaise(stats.gmvThisMonthPaise) : '—'}</strong>
              </div>
              <div>
                <span>Orders this month</span>
                <strong>{stats ? formatCount(stats.ordersThisMonth) : '—'}</strong>
              </div>
              <div>
                <span>Paid revenue to date</span>
                <strong>{stats ? formatPaise(stats.totalRevenuePaise) : '—'}</strong>
              </div>
            </div>
          </Card>
          <Card
            title="Cash to collect"
            sub={
              stats
                ? `${formatPaise(stats.codPendingRevenuePaise)} on unpaid cash-on-delivery orders`
                : 'Unpaid cash-on-delivery orders'
            }
            action={
              canReport ? (
                <Link href="/admin/operations/cod" className="admin-link">
                  All COD
                </Link>
              ) : undefined
            }
          >
            <BarList
              color={CHART_COLORS[2]}
              empty="Nothing waiting to be collected"
              rows={(dashboard?.codPending ?? []).slice(0, 5).map((order) => ({
                label: order.orderNumber,
                value: order.totalPaise / 100,
                sub: order.customerEmail ?? undefined,
              }))}
            />
          </Card>
        </div>
      </div>

      {/* 4 — Breakdowns (period analytics) */}
      {canReport && (
        <div className="db-grid db-grid--two">
          <Card title="Sales by category" sub="Order value, excluding cancelled">
            <BarList
              rows={(report?.byCategory ?? []).map((cat) => ({
                label: cat.category,
                value: cat.revenuePaise / 100,
                sub: `${cat.units} units`,
              }))}
            />
          </Card>
          <Card
            title="Sales by shop"
            sub="House stock and marketplace shops"
            action={
              can('FINANCE') ? (
                <Link href="/admin/payouts" className="admin-link">
                  Payouts
                </Link>
              ) : undefined
            }
          >
            <BarList
              color={CHART_COLORS[1]}
              rows={(report?.bySeller ?? []).map((s) => ({
                label: s.shopName,
                value: s.gmvPaise / 100,
                sub: `${s.orders} orders · ${formatPaise(s.commissionPaise)} commission`,
              }))}
            />
          </Card>
        </div>
      )}

      {/* 5 — Products, stock, orders */}
      <div className="db-grid db-grid--two">
        <Card
          title="Top products"
          sub={report ? 'By units sold in this period' : 'By units sold'}
          action={
            canCatalogue ? (
              <Link href="/admin/products" className="admin-link">
                All products
              </Link>
            ) : undefined
          }
        >
          {topProducts.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Units
                    </th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Price
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span style={{ minWidth: 0 }}>
                          {canCatalogue ? (
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
                          ) : (
                            <span style={{ color: 'var(--a-text)', fontWeight: 550 }}>
                              {row.name}
                            </span>
                          )}
                          <span
                            style={{ display: 'block', color: 'var(--a-text-dim)', fontSize: 12 }}
                          >
                            {row.category ?? '—'}
                          </span>
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatCount(row.unitsSold)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPaise(row.pricePaise)}
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
          sub="Live products running out"
          action={
            canCatalogue ? (
              <Link href="/admin/products?stock=low" className="admin-link">
                Manage stock
              </Link>
            ) : undefined
          }
        >
          <BarList
            color="#b28400"
            format={(v) => (v <= 0 ? 'Sold out' : `${v} left`)}
            empty="Everything is well stocked"
            rows={(dashboard?.lowStock ?? []).map((row) => ({
              label: row.name,
              value: row.quantity,
              sub: row.shopName ?? undefined,
            }))}
          />
        </Card>
      </div>

      {canReport && (
        <Card
          title="Recent orders"
          action={
            <Link href="/admin/operations/orders" className="admin-link">
              View all orders
            </Link>
          }
        >
          {recent && recent.length ? (
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
                  {recent.map((order) => (
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
                      <td>{order.customerEmail ?? '—'}</td>
                      <td>
                        <span className="admin-status-badge" data-status={order.status}>
                          {humanStatus(order.status)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPaise(order.totalPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ch-empty">{recent ? 'No orders yet' : 'Loading…'}</p>
          )}
        </Card>
      )}
    </div>
  );
}
