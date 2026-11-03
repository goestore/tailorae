'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Logo } from '@/components/common';

export interface AuthShellProps {
  /** Sits between the wordmark and the heading — the sign-in / sign-up tabs. */
  nav?: React.ReactNode;
  /** Optional heading block above the form — a title and a line of context. */
  title?: string;
  description?: React.ReactNode;
  /** Small line above the heading, e.g. "Seller Central". */
  eyebrow?: string;
  /** Where the logo leads. */
  homeHref?: string;
  /** Below the card: the way across to the other kind of account. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The card every auth page sits in.
 *
 * Sign-in, registration, forgot-password and reset-password are one journey, so
 * they share one frame — a reader who lands on the reset page from an email
 * should not feel they have left the shop.
 */
export const AuthShell: React.FC<AuthShellProps> = ({
  nav,
  title,
  description,
  eyebrow,
  homeHref = '/',
  footer,
  children,
}) => (
  <main className="auth-shell flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10 md:py-16">
    <div className="w-full max-w-md">
      <Card className="auth-card p-6 md:p-9">
        <Link href={homeHref} className="mx-auto mb-7 block w-fit" aria-label="TAILORAE home">
          <Logo variant="monogram" alt="" className="h-[60px]" />
        </Link>

        {nav}

        {eyebrow && (
          <p className="m-0 mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">
            {eyebrow}
          </p>
        )}

        {title && (
          <h1 className="mb-2 text-center text-3xl text-ink" style={{ letterSpacing: '-0.03em' }}>
            {title}
          </h1>
        )}
        {description && (
          <p className="mb-8 text-center text-[14px]" style={{ color: 'var(--ink-3)', lineHeight: 1.6 }}>
            {description}
          </p>
        )}

        {children}
      </Card>
      {footer && (
        <p className="m-0 mt-5 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
          {footer}
        </p>
      )}
    </div>
  </main>
);
