import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/common';

export const metadata: Metadata = {
  title: 'Size Guide | Creative Impression',
  description:
    'Body measurements for every size we make, how to measure yourself, and fit notes for relaxed and oversized styles.',
};

interface SizeRow {
  size: string;
  chest: string;
  waist: string;
  hips: string;
  length: string;
}

const WOMENS: SizeRow[] = [
  { size: 'XS', chest: '30–32', waist: '23–25', hips: '32–34', length: '24' },
  { size: 'S', chest: '32–34', waist: '25–27', hips: '34–36', length: '24.5' },
  { size: 'M', chest: '34–36', waist: '27–29', hips: '36–38', length: '25' },
  { size: 'L', chest: '36–38', waist: '29–31', hips: '38–40', length: '25.5' },
  { size: 'XL', chest: '38–40', waist: '31–33', hips: '40–42', length: '26' },
  { size: 'XXL', chest: '40–42', waist: '33–35', hips: '42–44', length: '26.5' },
];

const MENS: SizeRow[] = [
  { size: 'S', chest: '36–38', waist: '30–32', hips: '36–38', length: '27' },
  { size: 'M', chest: '38–40', waist: '32–34', hips: '38–40', length: '28' },
  { size: 'L', chest: '40–42', waist: '34–36', hips: '40–42', length: '29' },
  { size: 'XL', chest: '42–44', waist: '36–38', hips: '42–44', length: '30' },
  { size: 'XXL', chest: '44–46', waist: '38–40', hips: '44–46', length: '31' },
  { size: '3XL', chest: '46–48', waist: '40–42', hips: '46–48', length: '31.5' },
];

const KIDS = [
  { size: '2–3Y', chest: '21', height: '36–39' },
  { size: '4–5Y', chest: '23', height: '40–43' },
  { size: '6–7Y', chest: '25', height: '44–47' },
  { size: '8–9Y', chest: '27', height: '48–52' },
  { size: '10–11Y', chest: '29', height: '53–56' },
  { size: '12–13Y', chest: '31', height: '57–61' },
];

const HOW_TO_MEASURE = [
  {
    label: 'Chest / bust',
    detail: 'Measure around the fullest part, keeping the tape level under the arms.',
  },
  {
    label: 'Waist',
    detail: 'Measure around the narrowest part of the torso, usually just above the navel.',
  },
  {
    label: 'Hips',
    detail: 'Stand with your feet together and measure around the fullest part.',
  },
  {
    label: 'Length',
    detail: 'Measured flat, from the highest point of the shoulder to the hem.',
  },
];

const MeasureTable: React.FC<{ caption: string; rows: SizeRow[] }> = ({ caption, rows }) => (
  <section className="mt-12">
    <h2
      className="m-0 text-ink"
      style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-0.01em' }}
    >
      {caption}
    </h2>
    <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
      All measurements in inches. These are body measurements, not garment measurements.
    </p>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
            {['Size', 'Chest', 'Waist', 'Hips', 'Length'].map((head) => (
              <th
                key={head}
                scope="col"
                className="py-3 pr-4 text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{ color: 'var(--ink-3)' }}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.size} style={{ borderBottom: '1px solid var(--border)' }}>
              <th scope="row" className="py-3 pr-4 text-[14px] font-semibold text-ink">
                {row.size}
              </th>
              <td className="py-3 pr-4 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                {row.chest}
              </td>
              <td className="py-3 pr-4 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                {row.waist}
              </td>
              <td className="py-3 pr-4 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                {row.hips}
              </td>
              <td className="py-3 pr-4 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                {row.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

export default function SizeGuidePage() {
  return (
    <main className="section-y">
      <div className="container-max">
        <div className="mx-auto" style={{ maxWidth: '900px' }}>
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Size guide' }]} />

          <header className="mt-6 border-b border-line pb-8">
            <h1
              className="m-0 text-ink"
              style={{
                fontSize: 'clamp(30px, 4.5vw, 48px)',
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              Size guide
            </h1>
            <p className="mt-3 max-w-[60ch] text-lg" style={{ color: 'var(--ink-2)' }}>
              Measure yourself, compare against the chart, and order the size that matches — not the
              size you usually buy. Between two sizes, size up for a relaxed fit.
            </p>
          </header>

          <MeasureTable caption="Womens wear" rows={WOMENS} />
          <MeasureTable caption="Mens wear" rows={MENS} />

          <section className="mt-12">
            <h2
              className="m-0 text-ink"
              style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              Kids
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
              Sized by age, but height is the better guide. All measurements in inches.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[360px] border-collapse text-left">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
                    {['Size', 'Chest', 'Height'].map((head) => (
                      <th
                        key={head}
                        scope="col"
                        className="py-3 pr-4 text-[11px] font-bold uppercase tracking-[0.1em]"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KIDS.map((row) => (
                    <tr key={row.size} style={{ borderBottom: '1px solid var(--border)' }}>
                      <th scope="row" className="py-3 pr-4 text-[14px] font-semibold text-ink">
                        {row.size}
                      </th>
                      <td className="py-3 pr-4 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                        {row.chest}
                      </td>
                      <td className="py-3 pr-4 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                        {row.height}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-12 border border-line bg-surface-2 p-6 md:p-8">
            <h2 className="m-0 text-ink" style={{ fontSize: '17px', fontWeight: 600 }}>
              How to measure
            </h2>
            <dl className="mt-4 flex flex-col gap-3">
              {HOW_TO_MEASURE.map((item) => (
                <div key={item.label} className="text-[15px]" style={{ lineHeight: 1.7 }}>
                  <dt className="inline font-semibold text-ink">{item.label}: </dt>
                  <dd className="m-0 inline" style={{ color: 'var(--ink-2)' }}>
                    {item.detail}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Ordering uniforms or a bulk run? Send us your size split and we will grade the pattern
              to it — custom sizing is included on made-to-order work.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/products" className="btn btn-primary">
                Shop the catalogue
              </Link>
              <Link href="/b2b" className="btn btn-outline">
                Bulk sizing enquiry
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
