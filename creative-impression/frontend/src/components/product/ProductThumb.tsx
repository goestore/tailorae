'use client';

import React from 'react';
import { cn } from '@/utils/helpers';

export interface ProductThumbProps {
  /** Image source. May be a real URL or a hex color (e.g. "#d8cdcd") used as a placeholder. */
  src?: string | null;
  alt: string;
  className?: string;
  /** Show the product name overlaid on color-placeholder thumbs. */
  showLabel?: boolean;
}

/** True when the "image" value is actually a hex color placeholder (e.g. "#d8cdcd"). */
export const isColorThumb = (src?: string | null): src is string =>
  typeof src === 'string' && src.trim().startsWith('#');

/** Pick black or white text for readability on a given hex background. */
const contrastText = (hex: string): string => {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#212121' : '#ffffff';
};

/**
 * Product image that gracefully handles the catalog's hex-color placeholder
 * "thumbnails" while still supporting real image URLs.
 */
export const ProductThumb: React.FC<ProductThumbProps> = ({
  src,
  alt,
  className,
  showLabel = false,
}) => {
  if (isColorThumb(src)) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn('flex items-center justify-center overflow-hidden', className)}
        style={{ backgroundColor: src.trim() }}
      >
        {showLabel ? (
          <span
            className="px-2 text-center text-xs font-semibold uppercase tracking-wide opacity-80 line-clamp-2"
            style={{ color: contrastText(src.trim()) }}
          >
            {alt}
          </span>
        ) : (
          <svg
            className="h-8 w-8 opacity-40"
            style={{ color: contrastText(src.trim()) }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 7l1.5-3h-11L8 7m8 0l4 3-2.5 3-1.5-1v9h-8v-9l-1.5 1L4 10l4-3m8 0H8"
            />
          </svg>
        )}
      </div>
    );
  }

  if (src) {
    // Product/banner images can come from arbitrary hosts (e.g. picsum.photos),
    // which are not in next.config's image allowlist — use a plain <img>.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={cn('object-cover', className)} />;
  }

  return (
    <div
      className={cn('flex items-center justify-center bg-neutral-100 text-neutral-400', className)}
      role="img"
      aria-label={alt}
    >
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
};
