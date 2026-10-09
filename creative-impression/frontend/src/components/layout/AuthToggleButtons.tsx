'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const AuthToggleButtons: React.FC = () => {
  const pathname = usePathname();

  /**
   * Which tab is active is a fact about the URL, so it is read rather than
   * stored. Mirroring it into state meant the highlight was set by an effect
   * after paint — a frame of the wrong tab on every navigation — and the
   * onClick handlers below were setting a value the next render overwrote.
   */
  const activeMode: 'signin' | 'signup' = pathname?.includes('/auth/register')
    ? 'signup'
    : 'signin';

  return (
    <div className="flex items-center gap-2">
      <Link href="/auth/login">
        <button
          suppressHydrationWarning
          className={`px-3.5 py-1.5 text-sm font-semibold transition-colors ${
            activeMode === 'signin'
              ? 'bg-brand-gradient text-ink'
              : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
          }`}
        >
          Sign In
        </button>
      </Link>
      <Link href="/auth/register">
        <button
          suppressHydrationWarning
          className={`px-3.5 py-1.5 text-sm font-semibold transition-colors ${
            activeMode === 'signup'
              ? 'bg-brand-gradient text-ink'
              : 'border border-line text-ink-2 hover:border-ink-3 hover:text-ink'
          }`}
        >
          Sign Up
        </button>
      </Link>
    </div>
  );
};
