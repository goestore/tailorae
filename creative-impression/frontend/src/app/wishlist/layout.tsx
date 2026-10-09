import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wishlist | Creative Impression',
  // Private to one shopper and meaningless without a session. robots.txt asks
  // a crawler not to fetch these; noindex also keeps one that already knows the
  // URL from listing it.
  robots: { index: false, follow: false },
};

/** Metadata holder for the wishlist, which is a client component. */
export default function WishlistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
