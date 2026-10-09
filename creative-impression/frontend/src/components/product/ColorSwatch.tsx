import React from 'react';
import { resolveSwatchStyle, type SwatchSource } from '@/lib/color-map';

export interface ColorSwatchProps {
  color: SwatchSource;
  /** Shows the colour name beside the dot. */
  showName?: boolean;
  size?: number;
  className?: string;
}

/**
 * The colour dot under a product card, and inside the filter menu.
 *
 * A pale colour gets a hairline outline, or a white swatch on a white card is
 * an invisible one. Unrecognised names still render a neutral dot rather than
 * nothing, so the row does not silently lose an option.
 */
export const ColorSwatch: React.FC<ColorSwatchProps> = ({
  color,
  showName = false,
  size = 12,
  className = '',
}) => {
  const swatch = resolveSwatchStyle(color);
  const name = color.name ?? '';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      <span
        aria-hidden="true"
        title={name}
        className="inline-block shrink-0 rounded-full"
        style={{
          ...swatch.style,
          width: size,
          height: size,
          border: swatch.isLight ? '1px solid var(--border-strong)' : '1px solid transparent',
        }}
      />
      {showName && (
        <span className="truncate text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
          {name}
        </span>
      )}
    </span>
  );
};
