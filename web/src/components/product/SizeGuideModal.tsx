'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/common';
import type { ProductVariant } from '@/types';
import { measurementChart, type MeasurementChart } from './listing-specs';

export interface SizeGuideModalProps {
  /**
   * A product-specific chart, when the product carries one. Plain text is
   * rendered as-is; anything else falls back to the standard tables.
   */
  productSizeGuide?: string | null;
  /**
   * The product's sizes. When any carries measurements (from a marketplace
   * listing), the dialog shows a real per-size table instead of the text
   * chart or the standard tables.
   */
  variants?: ProductVariant[];
  /** "Garment Measurements in" / "To-Fit Denotes Body Measurements in". */
  measurementBasis?: string | null;
  className?: string;
}

type Unit = 'in' | 'cm';

const formatMeasure = (inches: number, unit: Unit): string => {
  const value = unit === 'cm' ? inches * 2.54 : inches;
  return String(Math.round(value * 10) / 10);
};

/** The product's own measurements, size by size, with an inch/cm switch. */
const MeasurementTable: React.FC<{ chart: MeasurementChart; unit: Unit }> = ({ chart, unit }) => (
  <div className="mt-2 overflow-x-auto">
    <table className="w-full border-collapse text-left" style={{ minWidth: 120 + chart.columns.length * 80 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
          {['Size', ...chart.columns.map((column) => column.label)].map((head) => (
            <th
              key={head}
              scope="col"
              className="py-2 pr-3 text-[10.5px] font-bold uppercase tracking-[0.1em]"
              style={{ color: 'var(--ink-3)' }}
            >
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {chart.rows.map((row) => (
          <tr key={row.size} style={{ borderBottom: '1px solid var(--border)' }}>
            <th scope="row" className="py-2 pr-3 text-[13px] font-semibold text-ink">
              {row.size}
            </th>
            {chart.columns.map((column) => (
              <td key={column.key} className="py-2 pr-3 text-[13px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                {row.values[column.key] === undefined ? '—' : formatMeasure(row.values[column.key], unit)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

interface Row {
  size: string;
  chest: string;
  waist: string;
  hips: string;
}

const WOMENS: Row[] = [
  { size: 'XS', chest: '30–32', waist: '23–25', hips: '32–34' },
  { size: 'S', chest: '32–34', waist: '25–27', hips: '34–36' },
  { size: 'M', chest: '34–36', waist: '27–29', hips: '36–38' },
  { size: 'L', chest: '36–38', waist: '29–31', hips: '38–40' },
  { size: 'XL', chest: '38–40', waist: '31–33', hips: '40–42' },
  { size: 'XXL', chest: '40–42', waist: '33–35', hips: '42–44' },
];

const MENS: Row[] = [
  { size: 'S', chest: '36–38', waist: '30–32', hips: '36–38' },
  { size: 'M', chest: '38–40', waist: '32–34', hips: '38–40' },
  { size: 'L', chest: '40–42', waist: '34–36', hips: '40–42' },
  { size: 'XL', chest: '42–44', waist: '36–38', hips: '42–44' },
  { size: 'XXL', chest: '44–46', waist: '38–40', hips: '44–46' },
  { size: '3XL', chest: '46–48', waist: '40–42', hips: '46–48' },
];

const Table: React.FC<{ caption: string; rows: Row[] }> = ({ caption, rows }) => (
  <div className="mt-6 first:mt-0">
    <p className="m-0 text-[13px] font-semibold text-ink">{caption}</p>
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[380px] border-collapse text-left">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
            {['Size', 'Chest', 'Waist', 'Hips'].map((head) => (
              <th
                key={head}
                scope="col"
                className="py-2 pr-3 text-[10.5px] font-bold uppercase tracking-[0.1em]"
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
              <th scope="row" className="py-2 pr-3 text-[13px] font-semibold text-ink">
                {row.size}
              </th>
              <td className="py-2 pr-3 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                {row.chest}
              </td>
              <td className="py-2 pr-3 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                {row.waist}
              </td>
              <td className="py-2 pr-3 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                {row.hips}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/**
 * The size chart, at the point where the size is chosen.
 *
 * The full page at /size-guide stays the canonical reference and is linked
 * from the footer of the dialog; this is the same numbers without making the
 * shopper leave a half-configured product page to see them.
 */
export const SizeGuideModal: React.FC<SizeGuideModalProps> = ({
  productSizeGuide,
  variants,
  measurementBasis,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [unit, setUnit] = useState<Unit>('in');
  const chart = useMemo(() => measurementChart(variants), [variants]);
  const garment = /garment/i.test(measurementBasis ?? '');

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`text-[12px] underline underline-offset-2 transition-colors hover:text-ink ${className}`.trim()}
        style={{ color: 'var(--ink-3)' }}
      >
        Size guide
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Size guide" size="lg">
        {chart ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>
              {garment
                ? 'Measurements of the garment itself, for this product.'
                : 'Measurements for this product, size by size.'}{' '}
              Between two sizes, size up for a relaxed fit.
            </p>
            <div
              role="group"
              aria-label="Units"
              className="inline-flex overflow-hidden border text-[12px] font-semibold"
              style={{ borderColor: 'var(--border-strong)', borderRadius: 999 }}
            >
              {(['in', 'cm'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={unit === option}
                  onClick={() => setUnit(option)}
                  className="px-3 py-1 transition-colors"
                  style={{
                    background: unit === option ? 'var(--brand)' : 'transparent',
                    color: unit === option ? 'var(--ink)' : 'var(--ink-3)',
                  }}
                >
                  {option === 'in' ? 'Inches' : 'cm'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="m-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            Body measurements in inches, not garment measurements. Between two sizes, size up for a
            relaxed fit.
          </p>
        )}

        {chart ? (
          <div className="mt-5">
            <MeasurementTable chart={chart} unit={unit} />
          </div>
        ) : productSizeGuide ? (
          <div
            className="mt-5 whitespace-pre-line border border-line bg-surface-2 p-4 text-[13.5px]"
            style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}
          >
            {productSizeGuide}
          </div>
        ) : (
          <div className="mt-5">
            <Table caption="Womens wear" rows={WOMENS} />
            <Table caption="Mens wear" rows={MENS} />
          </div>
        )}

        <p className="m-0 mt-6 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          Kids sizing, how to measure, and custom grading for bulk orders are on the{' '}
          <Link href="/size-guide" className="underline underline-offset-2 hover:text-ink">
            full size guide
          </Link>
          .
        </p>
      </Modal>
    </>
  );
};
