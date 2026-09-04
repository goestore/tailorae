'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Header } from './Header';
import { Footer } from './Footer';

type Announcement = {
  enabled: boolean;
  message: string;
  scroll: boolean;
  speedSeconds: number;
};

type AdminIconName = 'grid' | 'box' | 'edit' | 'arrow';
type AdminLink = { href: string; label: string; icon: AdminIconName; tone: 'blue' | 'teal' | 'green' | 'gold' | 'purple' };

const ADMIN_GROUPS: Array<{ label: string; links: AdminLink[] }> = [
  { label: 'Overview', links: [
    { href: '/admin', label: 'Dashboard', icon: 'grid', tone: 'blue' },
    { href: '/admin/operations/analytics', label: 'Analytics', icon: 'grid', tone: 'blue' },
  ] },
  { label: 'Content', links: [
    { href: '/admin/preview', label: 'Responsive preview', icon: 'grid', tone: 'blue' },
    { href: '/admin/content/home', label: 'Homepage studio', icon: 'edit', tone: 'green' },
    { href: '/admin/content/brand', label: 'Brand identity', icon: 'edit', tone: 'purple' },
  ] },
  { label: 'Commerce', links: [
    { href: '/admin/products/new', label: 'List product', icon: 'box', tone: 'teal' },
    { href: '/admin/products', label: 'All products', icon: 'box', tone: 'teal' },
    { href: '/admin/operations/inventory', label: 'Inventory', icon: 'box', tone: 'gold' },
    { href: '/admin/operations/orders', label: 'Orders', icon: 'box', tone: 'blue' },
    { href: '/admin/operations/customers', label: 'Customers', icon: 'grid', tone: 'blue' },
  ] },
  { label: 'Utilities', links: [
    { href: '/admin/content/layout', label: 'Site layout', icon: 'grid', tone: 'blue' },
    { href: '/admin/content/custom-wear', label: 'Custom Wear', icon: 'edit', tone: 'gold' },
    { href: '/admin/operations/contact-requests', label: 'Customer inbox', icon: 'arrow', tone: 'green' },
    { href: '/', label: 'View shop', icon: 'arrow', tone: 'gold' },
  ] },
];

function AdminIcon({ name }: { name: AdminIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'grid' && <><rect {...common} x="4" y="4" width="6" height="6" /><rect {...common} x="14" y="4" width="6" height="6" /><rect {...common} x="4" y="14" width="6" height="6" /><rect {...common} x="14" y="14" width="6" height="6" /></>}
      {name === 'box' && <><path {...common} d="m4 7 8-4 8 4-8 4-8-4Z" /><path {...common} d="M4 7v10l8 4 8-4V7M12 11v10" /></>}
      {name === 'edit' && <><path {...common} d="M5 20h14" /><path {...common} d="m7 16 9.8-9.8 2 2L9 18H7v-2Z" /></>}
      {name === 'arrow' && <><path {...common} d="M4 12h15" /><path {...common} d="m15 7 5 5-5 5" /></>}
    </svg>
  );
}

/** Keeps management tools deliberately separate from the customer storefront. */
export function SiteFrame({ children, announcement }: { children: ReactNode; announcement?: Announcement }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return (
      <div className="admin-shell admin-layout">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <aside className="admin-rail">
          <div className="admin-rail-header">
            <Link href="/admin" className="admin-brand" aria-label="Admin home">
              <div className="admin-brand-icon">
                <span>CI</span>
              </div>
              <div className="admin-brand-meta">
                <b>Creative Impression</b>
                <small>Command Center</small>
              </div>
            </Link>
          </div>
          <nav className="admin-mobile-nav" aria-label="Quick admin navigation">
            <Link href="/admin">Overview</Link>
            <Link href="/admin/products">Products</Link>
            <Link href="/admin/operations/orders">Orders</Link>
            <Link href="/admin/content/home">Content</Link>
          </nav>
          <nav className="admin-nav" aria-label="Admin navigation">
            {ADMIN_GROUPS.map((group) => (
              <section key={group.label} className="admin-nav-group">
                <p className="admin-group-label">{group.label}</p>
                {group.links.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={`${group.label}-${item.label}`}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`admin-nav-link admin-nav-link--${item.tone}${isActive ? ' admin-nav-link--active' : ''}`}
                    >
                      <span className="admin-nav-icon-wrap">
                        <AdminIcon name={item.icon} />
                      </span>
                      <span className="admin-nav-label">{item.label}</span>
                    </Link>
                  );
                })}
              </section>
            ))}
          </nav>
        </aside>
        <main id="main-content" className="admin-main">
          <header className="admin-topbar">
            <div className="admin-topbar-info">
              <div className="admin-topbar-title-row">
                <span className="admin-status-dot" aria-hidden="true" />
                <p>Store Command Center</p>
              </div>
              <span>Manage shop content, experience, and operations</span>
            </div>
            <div className="admin-topbar-actions">
              <Link href="/" target="_blank" className="admin-topbar-ghost-btn">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                View live shop
              </Link>
              <Link href="/admin/preview" className="admin-preview-link">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Responsive preview
              </Link>
            </div>
          </header>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header announcement={announcement} />
      <div id="main-content" className="flex-1" tabIndex={-1}>{children}</div>
      <Footer />
    </div>
  );
}
