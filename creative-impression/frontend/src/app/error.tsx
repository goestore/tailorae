'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

/**
 * Catches render and data failures anywhere the more specific boundaries do
 * not. Without this, an unhandled throw on any storefront route falls through
 * to Next's built-in error screen, which in production is an unstyled page
 * carrying nothing the shopper can act on.
 *
 * `digest` is the server-side hash of the real error — the browser deliberately
 * never receives the message or stack, so it is the only handle support has
 * when someone reports a failure.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[storefront]', error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md border border-line bg-white p-8 text-center md:p-12">
        <p
          className="m-0 text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: 'var(--ink-3)' }}
        >
          Something went wrong
        </p>
        <h1 className="mt-4 text-2xl text-ink">This page did not load</h1>
        <p className="mt-2 text-ink-3">
          The fault is on our side, not yours. Trying again usually works &mdash; nothing you had in
          your cart has been lost.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="bg-[var(--brand)] px-6 py-3 text-ink transition-colors hover:bg-[#ffd24a]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="border border-line px-6 py-3 text-ink transition-colors hover:bg-surface-2"
          >
            Back to home
          </Link>
        </div>

        {error.digest && (
          <p className="mt-8 text-xs text-ink-3">
            Quote reference{' '}
            <code className="font-mono" style={{ color: 'var(--brand-700)' }}>
              {error.digest}
            </code>{' '}
            if you contact us about this.
          </p>
        )}
      </div>
    </main>
  );
}
