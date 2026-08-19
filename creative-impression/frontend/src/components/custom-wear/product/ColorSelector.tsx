'use client';

import React from 'react';
import type { ProductColor } from '@/types/custom-wear';

export interface ColorSelectorProps {
  colors: ProductColor[];
  selectedColorId: string | null;
  onSelect: (colorId: string) => void;
  label?: string;
  /** Rendered next to the heading, e.g. the resolved variant SKU. */
  meta?: React.ReactNode;
}

/**
 * Garment colour picker. The chosen colour is named in text as well as shown
 * as a ring + tick, so it never depends on colour perception alone.
 */
export const ColorSelector: React.FC<ColorSelectorProps> = ({
  colors,
  selectedColorId,
  onSelect,
  label = 'Garment Colour',
  meta,
}) => {
  const selected = colors.find((color) => color.id === selectedColorId);

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            fontWeight: 700,
            color: 'var(--cw-ink)',
          }}
        >
          {label}
          {selected && (
            <span style={{ fontWeight: 400, color: 'var(--cw-ink-subtle)' }}>
              {' '}
              · {selected.name}
            </span>
          )}
        </h3>
        {meta}
      </div>

      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
        {colors.map((color) => {
          const isSelected = color.id === selectedColorId;
          const isOutOfStock = color.inStock === false;
          return (
            <button
              suppressHydrationWarning
              key={color.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${color.name}${isOutOfStock ? ' (out of stock)' : ''}`}
              title={color.name}
              disabled={isOutOfStock}
              onClick={() => onSelect(color.id)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: color.secondaryHex
                  ? `linear-gradient(135deg, ${color.hex} 50%, ${color.secondaryHex} 50%)`
                  : color.hex,
                boxShadow: isSelected
                  ? '0 0 0 2px var(--cw-white), 0 0 0 4px var(--cw-primary)'
                  : 'inset 0 0 0 1px rgba(0,0,0,0.18)',
              }}
            >
              {isSelected && (
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke={isLightColor(color.hex) ? '#111111' : '#FFFFFF'}
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4 10.5 4 4 8-9" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};

function isLightColor(hex: string): boolean {
  const value = hex.replace('#', '');
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165;
}
