import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Stories | Creative Impression',
  description:
    'Notes from the factory floor — how our garments are made, and the brands we make them for.',
  // The page has no articles on it yet. Indexing an empty page earns a
  // thin-content signal against the whole domain, so it stays out of the index
  // until there is something here to read. Drop this the day the first story
  // ships.
  robots: 'noindex, follow',
};

const PLANNED = [
  {
    title: 'Inside a production run',
    detail:
      'What actually happens between an approved tech pack and a packed carton — cutting, stitching, finishing and the checks in between.',
  },
  {
    title: 'Brands we build',
    detail:
      'Conversations with the label owners, uniform buyers and boutiques whose collections we manufacture.',
  },
  {
    title: 'Fabric notes',
    detail:
      'Why a fabric behaves the way it does, which one suits which garment, and what a GSM number really tells you.',
  },
  {
    title: 'Print and embroidery',
    detail:
      'Screen, DTG, sublimation and embroidery compared on cost, durability and the artwork each one flatters.',
  },
];

export default function StoriesPage() {
  return (
    <InfoPage
      title="Stories"
      subtitle="Notes from the factory floor. The first pieces are being written now."
    >
      <div className="border border-line bg-surface-2 p-6 md:p-8">
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}>
          We have spent fifteen years making clothes for other people to put their name on. This is
          where we will write about how that actually works. Here is what is coming.
        </p>

        <ul className="mt-6 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
          {PLANNED.map((item) => (
            <li key={item.title} className="p-4" style={{ background: 'var(--surface)' }}>
              <p className="m-0 text-[15px] font-semibold text-ink">{item.title}</p>
              <p className="m-0 mt-1 text-[14px]" style={{ color: 'var(--ink-3)', lineHeight: 1.65 }}>
                {item.detail}
              </p>
            </li>
          ))}
        </ul>

        <p className="m-0 mt-6 text-[14px]" style={{ color: 'var(--ink-3)' }}>
          Want these in your inbox when they land? The newsletter sign-up is in the footer of every
          page.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/info/about" className="btn btn-primary">
            About us
          </Link>
          <Link href="/products" className="btn btn-outline">
            Shop the catalogue
          </Link>
        </div>
      </div>
    </InfoPage>
  );
}
