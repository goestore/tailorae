import type { Metadata } from 'next';
import Link from 'next/link';
import React from 'react';

export const metadata: Metadata = { title: 'Command Center | Creative Impression' };

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const METRICS = [
  { label: 'Net revenue', value: '₹1.28L', change: '+18.4%', detail: 'vs last 30 days', bars: [32, 46, 40, 58, 51, 72, 84] },
  { label: 'Active orders', value: '184', change: '+12', detail: '26 ready to ship', bars: [62, 48, 74, 56, 68, 81, 76] },
  { label: 'Conversion', value: '4.82%', change: '+0.6%', detail: '8,420 sessions', bars: [38, 44, 52, 48, 64, 61, 79] },
  { label: 'Inventory health', value: '92%', change: 'Stable', detail: '14 low-stock items', bars: [84, 82, 90, 86, 88, 91, 92] },
];

const WORKSPACE = [
  { href: '/admin/content/home', code: '01', title: 'Homepage Studio', description: 'Hero, collections and merchandising', tone: 'cyan', icon: <Icon><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9.5 20v-6h5v6"/></Icon> },
  { href: '/admin/products', code: '02', title: 'Product Catalogue', description: 'Pricing, stock and categories', tone: 'violet', icon: <Icon><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></Icon> },
  { href: '/admin/content/brand', code: '03', title: 'Brand System', description: 'Identity, palette and messaging', tone: 'amber', icon: <Icon><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="7"/></Icon> },
  { href: '/admin/content/layout', code: '04', title: 'Experience Layer', description: 'Navigation, layout and surfaces', tone: 'green', icon: <Icon><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M8 9h13"/></Icon> },
];

const QUEUE = [
  { time: '09:42', label: 'New B2B order', meta: 'CI-2841 · 240 units', status: 'Priority', tone: 'amber' },
  { time: '09:18', label: 'Customisation approved', meta: 'Apex Athletics · Embroidery', status: 'Ready', tone: 'green' },
  { time: '08:55', label: 'Low stock detected', meta: 'Classic Polo · Navy / XL', status: 'Review', tone: 'violet' },
  { time: '08:31', label: 'Customer message', meta: 'Sizing request · Order CI-2819', status: 'Unread', tone: 'cyan' },
];

const PIPELINE = [
  { label: 'Payment verified', value: '38', note: 'Auto-cleared', tone: 'cyan' },
  { label: 'In production', value: '24', note: '4 due today', tone: 'violet' },
  { label: 'Quality check', value: '11', note: '2 flagged', tone: 'amber' },
  { label: 'Ready to dispatch', value: '26', note: 'Before 16:00', tone: 'green' },
];

export default function AdminHome() {
  return (
    <div className="admin-content admin-dashboard admin-command">
      <section className="admin-command-hero">
        <div>
          <div className="admin-command-kicker"><span /> LIVE OPERATIONS / 03 SEP 2026</div>
          <h1>Good morning, <em>Shiva.</em></h1>
          <p>Your storefront is healthy. Two items need attention before today&apos;s fulfilment run.</p>
        </div>
        <div className="admin-command-actions">
          <Link href="/admin/products/new" className="admin-command-button admin-command-button--ghost">+ New product</Link>
          <Link href="/admin/preview" className="admin-command-button admin-command-button--solid">Launch preview <span>↗</span></Link>
        </div>
      </section>

      <section className="admin-metric-grid" aria-label="Store performance">
        {METRICS.map((metric, index) => (
          <article className="admin-metric" key={metric.label}>
            <div className="admin-metric-top"><span>0{index + 1}</span><p>{metric.label}</p><b>{metric.change}</b></div>
            <div className="admin-metric-value">{metric.value}</div>
            <div className="admin-metric-bottom">
              <small>{metric.detail}</small>
              <div className="admin-spark" aria-hidden="true">{metric.bars.map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div>
            </div>
          </article>
        ))}
      </section>

      <section className="admin-flow" aria-labelledby="fulfilment-flow">
        <div className="admin-flow-label">
          <span>LIVE PIPELINE</span>
          <h2 id="fulfilment-flow">Today&apos;s fulfilment flow</h2>
          <Link href="/admin/operations/orders">Open orders <span>→</span></Link>
        </div>
        <div className="admin-flow-stages">
          {PIPELINE.map((stage, index) => (
            <Link href="/admin/operations/orders" key={stage.label} className={`admin-flow-stage admin-flow-stage--${stage.tone}`}>
              <div><span>0{index + 1}</span><i /></div>
              <strong>{stage.value}</strong>
              <p>{stage.label}</p>
              <small>{stage.note}</small>
            </Link>
          ))}
        </div>
      </section>

      <div className="admin-command-grid">
        <section className="admin-workspace" aria-labelledby="workspace-heading">
          <div className="admin-module-heading">
            <div><span>CONTROL MATRIX</span><h2 id="workspace-heading">Storefront workspace</h2></div>
            <Link href="/">Open storefront <span>↗</span></Link>
          </div>
          <div className="admin-workspace-grid">
            {WORKSPACE.map((item) => (
              <Link href={item.href} key={item.href} className={`admin-workspace-card admin-workspace-card--${item.tone}`}>
                <div className="admin-workspace-card-top"><span>{item.code}</span><div>{item.icon}</div></div>
                <h3>{item.title}</h3><p>{item.description}</p>
                <b>Enter module <span>→</span></b>
              </Link>
            ))}
          </div>
        </section>

        <aside className="admin-queue" aria-labelledby="queue-heading">
          <div className="admin-module-heading"><div><span>ACTIVITY STREAM</span><h2 id="queue-heading">Needs attention</h2></div><b>04</b></div>
          <div className="admin-queue-list">
            {QUEUE.map((item) => (
              <div className="admin-queue-item" key={`${item.time}-${item.label}`}>
                <time>{item.time}</time><div><strong>{item.label}</strong><small>{item.meta}</small></div><span className={`admin-queue-status admin-queue-status--${item.tone}`}>{item.status}</span>
              </div>
            ))}
          </div>
          <Link href="/admin/operations/orders" className="admin-queue-link">View operations queue <span>→</span></Link>
        </aside>
      </div>

      <section className="admin-pulse">
        <div><span className="admin-pulse-orbit"><i /></span><p><b>Systems nominal</b><small>API, payments, catalogue and content services operational</small></p></div>
        <div className="admin-pulse-items"><span><i /> API 42ms</span><span><i /> Payments</span><span><i /> Inventory synced</span></div>
      </section>
    </div>
  );
}
