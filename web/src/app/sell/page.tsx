import React from 'react';
import type { Metadata } from 'next';
import { SellLanding } from '@/components/sell/SellLanding';

export const metadata: Metadata = {
  title: { absolute: 'Sell on TAILORAE | Open your apparel shop' },
  description:
    'Open your own shop on TAILORAE. List your apparel, take payments through our checkout, and track orders and payouts from one dashboard.',
  alternates: { canonical: '/sell' },
};

/**
 * Public seller-acquisition page. `/seller` is the private dashboard and
 * application form (noindex); this page is the indexable front door to it.
 */
export default function SellPage() {
  return <SellLanding />;
}
