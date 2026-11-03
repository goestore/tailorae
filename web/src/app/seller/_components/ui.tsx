'use client';

import React from 'react';
import Link from 'next/link';
import { STATUS_LABELS, type Shop } from '@/lib/seller-api';

/**
 * The pieces every seller page repeats: the page heading, a notice strip, a
 * figure tile and the "not for your role" / "no shop yet" placeholders. They
 * were pasted inline page by page before; one copy keeps the console's pages
 * looking like one console.
 */

export const PageHeader: React.FC<{
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, lead, actions }) => (
  <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
    <div className="min-w-0">
      <h1
        className="m-0 text-ink"
        style={{ fontSize: 'clamp(26px, 3.6vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.03em' }}
      >
        {title}
      </h1>
      {lead && (
        <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
          {lead}
        </p>
      )}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; id?: string }> = ({ children, id }) => (
  <h2 id={id} className="m-0 text-ink" style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}>
    {children}
  </h2>
);

/** A strip with a title, a sentence and optional actions. `alert` is for refusals and suspensions. */
export const Notice: React.FC<{
  title: React.ReactNode;
  children?: React.ReactNode;
  tone?: 'brand' | 'alert' | 'plain';
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, children, tone = 'brand', actions, className = 'mt-6' }) => (
  <div
    role={tone === 'alert' ? 'alert' : undefined}
    className={`${className} flex flex-wrap items-center justify-between gap-4 border px-4 py-3.5 text-[14px]`}
    style={
      tone === 'alert'
        ? { borderColor: 'var(--sale)', background: 'var(--surface-2)' }
        : tone === 'plain'
          ? { borderColor: 'var(--border)', background: 'var(--surface-2)' }
          : { borderColor: 'var(--brand)', background: 'var(--brand-soft)' }
    }
  >
    <div className="min-w-0 flex-1">
      <p className="m-0 font-semibold text-ink">{title}</p>
      {children && (
        <div className="m-0 mt-1" style={{ color: 'var(--ink-2)' }}>
          {children}
        </div>
      )}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Stat: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="border border-line p-4">
    <p className="m-0 text-caption font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-3)' }}>
      {label}
    </p>
    <p className="m-0 mt-2 text-[26px] font-semibold leading-none text-ink">{value}</p>
    {note && (
      <p className="m-0 mt-1.5 text-small" style={{ color: 'var(--ink-3)' }}>
        {note}
      </p>
    )}
  </div>
);

export const Empty: React.FC<{ title: string; children?: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  children,
  action,
}) => (
  <div className="mt-10 border border-line bg-surface-2 px-6 py-14 text-center">
    <p className="m-0 text-lg text-ink">{title}</p>
    {children && (
      <p className="mx-auto mt-2 max-w-[46ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
        {children}
      </p>
    )}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

/** A page the person's role in this shop does not open. The API would answer 403. */
export const NotForRole: React.FC<{ what: string }> = ({ what }) => (
  <main className="section-y">
    <div className="container-max">
      <Notice title="Not part of your role" tone="plain" className="mt-0">
        Your role in this shop does not include {what}. Ask the shop&apos;s owner if you need it.{' '}
        <Link href="/seller" className="underline underline-offset-2">
          Back to the overview
        </Link>
        .
      </Notice>
    </div>
  </main>
);

/** A page that needs a business, opened before one exists. */
export const NoShopYet: React.FC = () => (
  <main className="section-y">
    <div className="container-max">
      <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
        You have not set up your business yet.{' '}
        <Link href="/seller" className="underline underline-offset-2">
          Start on the overview
        </Link>
        .
      </p>
    </div>
  </main>
);

/**
 * Where the application stands, for every state but DRAFT (which the overview
 * shows as its step list) and APPROVED (nothing to say). The team's note is
 * shown wherever one was written.
 */
export const StatusNotice: React.FC<{ shop: Shop; className?: string }> = ({ shop, className }) => {
  const note = shop.statusNote ? (
    <>
      {' '}
      <strong className="text-ink">Note from our team:</strong> {shop.statusNote}
    </>
  ) : null;
  switch (shop.status) {
    case 'SUBMITTED':
      return (
        <Notice title="Application submitted" className={className}>
          We review every new seller before they can sell. You will hear from us by email, usually within one
          working day.
        </Notice>
      );
    case 'UNDER_REVIEW':
      return (
        <Notice title="Your application is being reviewed" className={className}>
          We are checking your business details, documents and bank account. Selling opens the moment it is
          approved.
        </Notice>
      );
    case 'NEEDS_INFO':
      return (
        <Notice
          title="We need a few changes"
          tone="alert"
          className={className}
          actions={
            <Link href="/seller/verification" className="btn btn-primary btn-sm">
              Fix and resubmit
            </Link>
          }
        >
          Update what is asked for, then submit again.{note}
        </Notice>
      );
    case 'REJECTED':
      return (
        <Notice
          title="Your application was not approved"
          tone="alert"
          className={className}
          actions={
            <Link href="/info/contact" className="btn btn-outline btn-sm">
              Contact us
            </Link>
          }
        >
          You cannot sell on TAILORAE with this business for now.{note}
        </Notice>
      );
    case 'SUSPENDED':
      return (
        <Notice
          title="Your shop is suspended"
          tone="alert"
          className={className}
          actions={
            <Link href="/info/contact" className="btn btn-outline btn-sm">
              Contact us
            </Link>
          }
        >
          Your listings are hidden from shoppers and no new orders come in. Orders already placed still have to be
          fulfilled.{note}
        </Notice>
      );
    default:
      return null;
  }
};

/** The message shown where selling is closed because the shop is not approved. */
export const sellingClosedText = (shop: Shop): string =>
  shop.status === 'SUSPENDED'
    ? 'Your shop is suspended, so listings cannot be added or changed until it is reinstated.'
    : `You can list products once your application is approved (status: ${STATUS_LABELS[shop.status].toLowerCase()}).`;

export const prettyStatus = (status: string): string =>
  status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export const formatDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
