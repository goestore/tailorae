'use client';

import React from 'react';
import { Modal } from '@/components/common';
import type { SizeChart } from '@/types/custom-wear';

export interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  chart?: SizeChart;
}

/** Product-specific measurement table. Charts come from the product record. */
export const SizeGuideModal: React.FC<SizeGuideModalProps> = ({
  isOpen,
  onClose,
  productName,
  chart,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={`Size Guide — ${productName}`} size="lg">
    {!chart ? (
      <p style={{ color: 'var(--cw-ink-muted)', fontSize: 'var(--cw-fs-small)' }}>
        A measurement chart has not been published for this product yet. Contact us and we will send
        the current specification.
      </p>
    ) : (
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-left"
          style={{
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
            minWidth: '420px',
          }}
        >
          <caption className="sr-only">
            {productName} measurements in {chart.unit}
          </caption>
          <thead>
            <tr style={{ backgroundColor: 'var(--cw-surface-alt)' }}>
              <th scope="col" className="px-3 py-2.5 font-bold" style={{ color: 'var(--cw-ink)' }}>
                Size
              </th>
              {chart.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-2.5 font-bold"
                  style={{ color: 'var(--cw-ink)' }}
                >
                  {column} ({chart.unit})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => (
              <tr key={row.size} style={{ borderTop: '1px solid var(--cw-border)' }}>
                <th
                  scope="row"
                  className="px-3 py-2.5 text-left font-bold"
                  style={{ color: 'var(--cw-ink)' }}
                >
                  {row.size}
                </th>
                {row.values.map((value, index) => (
                  <td key={index} className="px-3 py-2.5" style={{ color: 'var(--cw-ink-muted)' }}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {chart.note && (
          <p
            style={{
              margin: '14px 0 0',
              color: 'var(--cw-ink-subtle)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
              lineHeight: 1.6,
            }}
          >
            {chart.note}
          </p>
        )}
      </div>
    )}
  </Modal>
);
