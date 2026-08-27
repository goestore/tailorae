'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const AuthToggleButtons: React.FC = () => {
  const [activeMode, setActiveMode] = useState<'signin' | 'signup'>('signin');
  const pathname = usePathname();

  useEffect(() => {
    // Set active mode based on current pathname
    if (pathname?.includes('/auth/register')) {
      setActiveMode('signup');
    } else if (pathname?.includes('/auth/login')) {
      setActiveMode('signin');
    }
  }, [pathname]);

  return (
    <div className="flex items-center gap-2">
      <Link href="/auth/login">
        <button
          suppressHydrationWarning
          onClick={() => setActiveMode('signin')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
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
          onClick={() => setActiveMode('signup')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
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
