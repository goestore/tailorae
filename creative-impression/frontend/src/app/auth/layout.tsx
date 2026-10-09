import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Creative Impression',
  // Private to one shopper and meaningless without a session. robots.txt asks
  // a crawler not to fetch these; noindex also keeps one that already knows the
  // URL from listing it.
  robots: { index: false, follow: false },
};

/** Metadata holder for the sign-in and registration pages. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
