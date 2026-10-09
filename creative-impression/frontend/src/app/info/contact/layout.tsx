import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | Creative Impression',
  description:
    'Questions about an order, a bulk enquiry or a custom run? Send us the details and we reply the same working day.',
  alternates: { canonical: '/info/contact' },
};

/** The contact page is a client component; its metadata lives here. */
export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
