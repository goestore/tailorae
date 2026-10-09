import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'B2B & Bulk Orders | Creative Impression',
  description:
    'Wholesale apparel manufacturing with tiered pricing, custom branding and export experience. Request a quote with your quantities, sizes and artwork.',
  alternates: { canonical: '/b2b' },
};

/** The B2B page is a client component; its metadata lives here. */
export default function B2BLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
