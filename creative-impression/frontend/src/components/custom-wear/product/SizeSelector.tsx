'use client';

import React from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import type { ProductSize } from '@/types/custom-wear';

export interface SizeSelectorProps {
  sizes: ProductSize[];
  /** Single-select in shop mode; multi-select when collecting a size split for a quote. */
  selected: string[];
  multiple?: boolean;
  onSelect: (sizeId: string) => void;
  onOpenSizeGuide: () => void;
  error?: string;
}

export const SizeSelector: React.FC<SizeSelectorProps> = ({
  sizes,
  selected,
  multiple = false,
  onSelect,
  onOpenSizeGuide,
  error,
}) => (
  <section>
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3
        style={{
          margin: 0,
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-small)',
          fontWeight: 700,
          color: 'var(--cw-ink)',
        }}
      >
        {multiple ? 'Size Requirements' : 'Select Size'}
        {multiple && (
          <span style={{ fontWeight: 400, color: 'var(--cw-ink-subtle)' }}>
            {' '}
            · choose all you need
          </span>
        )}
      </h3>
      <button
        suppressHydrationWarning
        type="button"
        onClick={onOpenSizeGuide}
        className="underline transition-opacity hover:opacity-70"
        style={{
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-micro)',
          fontWeight: 600,
          color: 'var(--cw-ink-muted)',
        }}
      >
        {customWearContent.labels.sizeGuide}
      </button>
    </div>

    <div
      role={multiple ? 'group' : 'radiogroup'}
      aria-label="Size"
      className="flex flex-wrap gap-2"
    >
      {sizes.map((size) => {
        const isSelected = selected.includes(size.id);
        const isOutOfStock = size.inStock === false;
        return (
          <button
            suppressHydrationWarning
            key={size.id}
            type="button"
            role={multiple ? undefined : 'radio'}
            aria-checked={multiple ? undefined : isSelected}
            aria-pressed={multiple ? isSelected : undefined}
            disabled={isOutOfStock}
            onClick={() => onSelect(size.id)}
            className="transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              minWidth: '52px',
              padding: '10px 12px',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-small)',
              fontWeight: 600,
              borderRadius: 'var(--cw-radius-control)',
              border: `1px solid ${isSelected ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
              backgroundColor: isSelected ? 'var(--cw-primary)' : 'var(--cw-white)',
              color: isSelected ? 'var(--cw-on-primary)' : 'var(--cw-ink-muted)',
            }}
          >
            {size.label}
          </button>
        );
      })}
    </div>

    {error && (
      <p
        role="alert"
        style={{
          margin: '8px 0 0',
          color: 'var(--cw-danger)',
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-micro)',
        }}
      >
        {error}
      </p>
    )}
  </section>
);
