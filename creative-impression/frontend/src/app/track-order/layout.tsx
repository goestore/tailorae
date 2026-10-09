import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Track Your Order | Creative Impression',
  description:
    'Check where your order has reached with your order number. No account needed — add the email you checked out with to see the items and total too.',
  alternates: { canonical: '/track-order' },
};

/** Metadata holder for order tracking, which is a client component. */
export default function TrackOrderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
