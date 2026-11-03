import './seller.css';

import React from 'react';
import type { Metadata } from 'next';
import { SellerShell } from '@/components/seller/SellerShell';
import { SITE_NAME } from '@/config/site';

export const metadata: Metadata = {
  title: {
    default: 'Seller Central',
    template: `%s · Seller Central | ${SITE_NAME}`,
  },
  // A seller's own console is private to them, and the sign-in pages are
  // reached from the /sell landing page rather than from search.
  robots: { index: false, follow: false },
};

/** Seller Central: its own console shell, apart from the storefront chrome. */
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <SellerShell>{children}</SellerShell>;
}
