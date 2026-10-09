import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sell | Creative Impression',
  // A seller's own dashboard is private to them, and the application form is
  // reached from the account area rather than from search.
  robots: { index: false, follow: false },
};

/** Metadata holder for the seller area, whose pages are client components. */
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
