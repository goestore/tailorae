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
    <div className="flex items-center space-x-2">
      <Link href="/auth/login">
        <button
          onClick={() => setActiveMode('signin')}
          className={`px-4 py-2 rounded-full font-semibold transition-all ${
            activeMode === 'signin'
              ? 'bg-yellow-400 text-black font-bold'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Sign In
        </button>
      </Link>
      <Link href="/auth/register">
        <button
          onClick={() => setActiveMode('signup')}
          className={`px-4 py-2 rounded-full font-semibold transition-all ${
            activeMode === 'signup'
              ? 'bg-yellow-400 text-black font-bold'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Sign Up
        </button>
      </Link>
    </div>
  );
};
