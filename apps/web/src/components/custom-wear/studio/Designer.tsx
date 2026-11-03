'use client';

import React, { useEffect } from 'react';
import { formatCurrency } from '@/utils/helpers';
import type { CustomWearProduct } from '@/types/custom-wear';
import { DesignCanvas } from './DesignCanvas';
import { ArtworkInspector } from './ArtworkInspector';
import type { ProductConfig } from './useProductConfig';

export interface DesignerProps {
  product: CustomWearProduct;
  config: ProductConfig;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Design mode: the garment, its print areas and the artwork tools, on their own
 * full screen.
 *
 * Decorating a garment needs room — a zone you cannot aim at is a zone you
 * cannot use — but it is not what someone wants on arrival. Keeping it behind a
 * deliberate "Customize" step lets the product page lead with photography and
 * lets this view take the whole window when it is actually wanted.
 */
export const Designer: React.FC<DesignerProps> = ({ product, config, isOpen, onClose }) => {
  // A full-screen layer over a scrollable page must hold the page still, and
  // Escape has to work — otherwise this reads as a broken page, not a mode.
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const areas = config.selection.placements.length;

  return (
    <div className="cw-designer" role="dialog" aria-modal="true" aria-label="Design your garment">
      <header className="cw-designer-top">
        <button
          suppressHydrationWarning
          type="button"
          onClick={onClose}
          className="cw-designer-back"
        >
          <span aria-hidden="true">←</span> Back to product
        </button>

        <p className="cw-designer-title">
          {product.name}
          {config.color && <span> · {config.color.name}</span>}
        </p>

        <button
          suppressHydrationWarning
          type="button"
          onClick={onClose}
          className="cw-cta cw-cta--accent cw-designer-done"
        >
          Done
        </button>
      </header>

      <div className="cw-designer-body">
        <div className="cw-designer-stage">
          <DesignCanvas
            product={product}
            color={config.color}
            placements={config.selection.placements}
            uploads={config.selection.uploads}
            activePlacementId={config.activePlacementId}
            onAddPlacement={config.addPlacement}
            onSelectPlacement={config.setActivePlacement}
          />
        </div>

        <aside className="cw-designer-side" aria-label="Artwork">
          <ArtworkInspector product={product} config={config} />
        </aside>
      </div>

      <footer className="cw-designer-foot">
        <span className="cw-designer-count">
          {areas === 0 ? 'No print areas yet' : `${areas} print area${areas === 1 ? '' : 's'}`}
        </span>
        <span className="cw-designer-price">
          {formatCurrency(config.pricing.unitPrice)} <span>/ unit</span>
        </span>
      </footer>
    </div>
  );
};
