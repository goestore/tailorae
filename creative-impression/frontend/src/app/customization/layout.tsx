import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Custom Printing & Embroidery | Creative Impression',
  description:
    'Put your logo or artwork on our garments. Screen printing, DTG, sublimation and embroidery, with proofs approved before production starts.',
  alternates: { canonical: '/customization' },
};

/** The customization page is a client component; its metadata lives here. */
export default function CustomizationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
