'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CustomWearThemeProvider } from '@/components/custom-wear';

/** Catches render/data failures anywhere under /custom-wear. */
export default function CustomWearError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[custom-wear]', error);
  }, [error]);

  return (
    <CustomWearThemeProvider>
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--cw-font-heading)',
            fontSize: 'var(--cw-fs-section)',
            fontWeight: 600,
            color: 'var(--cw-ink)',
          }}
        >
          Something went wrong loading Custom Wear
        </h1>
        <p
          style={{
            margin: '12px 0 24px',
            color: 'var(--cw-ink-muted)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            lineHeight: 1.6,
          }}
        >
          The product catalogue could not be loaded. Try again, or browse the full range.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="cw-cta cw-cta--accent">
            Try again
          </button>
          <Link href="/custom-wear" className="cw-cta cw-cta--outline">
            All Custom Wear
          </Link>
        </div>
      </div>
    </CustomWearThemeProvider>
  );
}
