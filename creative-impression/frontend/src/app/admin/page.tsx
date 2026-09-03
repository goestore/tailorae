import type { Metadata } from 'next';
import Link from 'next/link';
import React from 'react';

export const metadata: Metadata = { title: 'Command Center | Creative Impression' };

type Control = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  tone: 'gold' | 'blue' | 'green' | 'purple';
  icon: React.ReactNode;
};

const STORE_CONTROLS: Control[] = [
  {
    href: '/admin/content/home',
    eyebrow: 'Experience',
    title: 'Home page studio',
    description: 'Control hero imagery, product bands, category blocks, and the page order.',
    action: 'Open editor',
    tone: 'gold',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    href: '/admin/content/brand',
    eyebrow: 'Identity',
    title: 'Brand settings',
    description: 'Set the store name, announcement bar, colours, and core visual language.',
    action: 'Edit brand',
    tone: 'purple',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
  },
  {
    href: '/admin/content/layout',
    eyebrow: 'System',
    title: 'Site layout',
    description: 'Tune the layout values that shape the storefront across every screen.',
    action: 'Configure layout',
    tone: 'blue',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    href: '/admin/content/custom-wear',
    eyebrow: 'Collection',
    title: 'Custom Wear',
    description: 'Control copy and conversion details for the custom collection experience.',
    action: 'Manage collection',
    tone: 'green',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
];

const OPERATIONS = [
  {
    href: '/admin/products/new',
    label: 'Add a product',
    description: 'List a new item in the store catalogue',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    href: '/admin/products',
    label: 'Manage catalogue',
    description: 'Edit pricing, inventory, and categories',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/admin/operations/orders',
    label: 'Review orders',
    description: 'Process and manage customer fulfilment',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    href: '/admin/operations/contact-requests',
    label: 'Customer inbox',
    description: 'Read and resolve support messages',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
];

export default function AdminHome() {
  return (
    <div className="admin-content admin-dashboard">
      {/* Hero Header */}
      <section className="admin-welcome">
        <div className="admin-welcome-text">
          <p className="admin-kicker">Operations dashboard</p>
          <h1>Command Center</h1>
          <span>Use the workspace below to shape the storefront, move orders forward, and engage with your customers.</span>
        </div>
        <div className="admin-welcome-actions">
          <Link href="/admin/preview" className="admin-action-btn admin-action-btn--secondary">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Preview shop
          </Link>
          <Link href="/admin/content/home" className="admin-action-btn admin-action-btn--primary">
            Edit home page
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Grid container for main layout */}
      <div className="admin-grid-layout">
        
        {/* Left Column: Quick Operations */}
        <aside className="admin-operations-sidebar">
          <div className="admin-section-heading">
            <h2 id="operation-controls">Daily Operations</h2>
          </div>
          <div className="admin-operation-list" aria-labelledby="operation-controls">
            {OPERATIONS.map((operation) => (
              <Link key={operation.href} href={operation.href} className="admin-operation-item">
                <div className="admin-operation-icon">
                  {operation.icon}
                </div>
                <div className="admin-operation-text">
                  <b>{operation.label}</b>
                  <small>{operation.description}</small>
                </div>
                <div className="admin-operation-arrow" aria-hidden="true">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </aside>

        {/* Right Column: Storefront Controls */}
        <section className="admin-controls-main" aria-labelledby="storefront-controls">
          <div className="admin-section-heading">
            <h2 id="storefront-controls">Storefront Controls</h2>
            <Link href="/" className="admin-link-discreet">
              View live shop 
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 ml-1 inline-block">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </Link>
          </div>
          
          <div className="admin-control-grid">
            {STORE_CONTROLS.map((control) => (
              <Link href={control.href} key={control.href} className={`admin-control-card admin-control-card--${control.tone}`}>
                <div className="admin-control-card-header">
                  <div className="admin-control-card-icon">
                    {control.icon}
                  </div>
                  <p>{control.eyebrow}</p>
                </div>
                <div className="admin-control-card-body">
                  <h3>{control.title}</h3>
                  <span>{control.description}</span>
                </div>
                <div className="admin-control-action">
                  {control.action} 
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
