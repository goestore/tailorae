import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoice | Creative Impression',
  // Private to one shopper and meaningless without a session. robots.txt asks
  // a crawler not to fetch these; noindex also keeps one that already knows the
  // URL from listing it.
  robots: { index: false, follow: false },
};

/** Metadata holder for invoices, which carry a name, an address and an order total. */
export default function InvoiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
