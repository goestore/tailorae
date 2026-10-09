import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Account | Creative Impression',
  // Private to one shopper and meaningless without a session. robots.txt asks
  // a crawler not to fetch these; noindex also keeps one that already knows the
  // URL from listing it.
  robots: { index: false, follow: false },
};

/** Metadata holder for the account area, whose pages are client components. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
