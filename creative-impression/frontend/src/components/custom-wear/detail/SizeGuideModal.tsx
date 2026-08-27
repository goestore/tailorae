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
      <p className="cw-sizechart-empty">
        A measurement chart has not been published for this product yet. Contact us and we will send
        the current specification.
      </p>
    ) : (
      <div className="cw-sizechart">
        <table>
          <caption className="sr-only">
            {productName} measurements in {chart.unit}
          </caption>
          <thead>
            <tr>
              <th scope="col">Size</th>
              {chart.columns.map((column) => (
                <th key={column} scope="col">
                  {column} ({chart.unit})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => (
              <tr key={row.size}>
                <th scope="row">{row.size}</th>
                {row.values.map((value, index) => (
                  <td key={index}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {chart.note && <p className="cw-sizechart-note">{chart.note}</p>}
      </div>
    )}
  </Modal>
);
