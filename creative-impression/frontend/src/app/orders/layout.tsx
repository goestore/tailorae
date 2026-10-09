import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your order | Creative Impression',
  // An order confirmation carries a name, an address and a total. The URL is
  // shareable on purpose — it is what a confirmation email links to — but it
  // has no business in a search index, so ask a crawler that already knows it
  // not to list it.
  robots: { index: false, follow: false },
};

/** Metadata holder for the order confirmation route, which is a client component. */
export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
