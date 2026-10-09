import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shop All Products | Creative Impression',
  description:
    'Browse the full Creative Impression catalogue — polos, tees, shirts and uniforms for men, women and kids, with customization and bulk pricing available.',
  alternates: { canonical: '/products' },
};

/**
 * Metadata holder for the catalogue. The listing page is a client component and
 * cannot export metadata itself; the section and detail routes nested under
 * this one declare their own, which override this.
 */
export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
