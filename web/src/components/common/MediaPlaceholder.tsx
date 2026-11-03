import React from 'react';
import { cn } from '@/utils/helpers';
import { GARMENT_PATH, GARMENT_VIEWBOX } from '@/components/custom-wear/GarmentMark';
import { isLightColor } from '@/lib/custom-wear/color';
import { Logo } from './Logo';

/**
 * What an image slot shows before it has an image.
 *
 * One designed object instead of a grey box with a broken-picture icon: warm
 * paper with a faint woven texture, a stitched hairline frame, and a drawing
 * of what belongs there — a garment for a product or category, the ringed
 * initials for a brand or shop, the monogram for a banner. The name and a
 * quiet "Image coming soon" sit underneath when the slot is big enough.
 *
 * It is pure markup (no state), so it renders on the server and in client
 * components alike. Text hides itself in small slots through a container
 * query on the placeholder's own width — a cart thumbnail shows only the
 * drawing, a product card shows everything.
 */
export type MediaPlaceholderVariant = 'product' | 'category' | 'brand' | 'seller' | 'banner' | 'avatar';

export interface MediaPlaceholderProps {
  variant?: MediaPlaceholderVariant;
  /** What the image would have shown — read out to screen readers and printed small. */
  name?: string;
  /** Product colour (hex) to draw the garment in; the default is undyed cloth. */
  tint?: string;
  /** Fill a positioned parent instead of sizing from `className`. */
  fill?: boolean;
  /** Hide the name and caption even when there is room (the caller prints them). */
  bare?: boolean;
  className?: string;
}

const initials = (name = '') =>
  name
    .split(/[\s'&.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

const UNDYED = '#FFFDF8';

export const MediaPlaceholder: React.FC<MediaPlaceholderProps> = ({
  variant = 'product',
  name,
  tint,
  fill = false,
  bare = false,
  className,
}) => {
  const garment = variant === 'product' || variant === 'category';
  const fillColor = tint?.trim().startsWith('#') ? tint.trim() : UNDYED;
  const outline = isLightColor(fillColor) ? 'rgba(120, 80, 0, 0.42)' : 'rgba(255, 255, 255, 0.5)';
  const showText = !bare && variant !== 'category' && variant !== 'avatar';

  return (
    <div
      role="img"
      aria-label={name ? `${name} — image coming soon` : 'Image coming soon'}
      className={cn('mph', `mph--${variant}`, fill && 'mph--fill', className)}
    >
      <div className="mph-body" aria-hidden="true">
        {garment && (
          <svg viewBox={GARMENT_VIEWBOX} className="mph-garment" preserveAspectRatio="xMidYMid meet">
            <path d={GARMENT_PATH} fill={fillColor} stroke={outline} strokeWidth="1.5" strokeLinejoin="round" />
            {/* Collar, and a running stitch just inside the hem. */}
            <path d="M40 12a12 7 0 0 0 20 0" fill="none" stroke={outline} strokeWidth="1.5" />
            <path d="M28 108h44" fill="none" stroke={outline} strokeWidth="1.2" strokeDasharray="3 3" />
          </svg>
        )}

        {(variant === 'brand' || variant === 'seller' || variant === 'avatar') && (
          <span className="mph-initials">{initials(name) || 'T'}</span>
        )}

        {variant === 'banner' && <Logo variant="monogram" alt="" className="mph-monogram" />}

        {showText && (
          <span className="mph-text">
            {name && <span className="mph-name">{name}</span>}
            <span className="mph-note">Image coming soon</span>
          </span>
        )}
      </div>
    </div>
  );
};
