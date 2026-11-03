import React from 'react';
import { isLightColor } from '@/lib/custom-wear/color';

export interface GarmentMarkProps {
  /** Garment colour. Defaults to white when nothing is selected. */
  hex?: string;
  /** The front view draws a collar; the back does not. */
  view?: 'front' | 'back';
  className?: string;
  /** Accessible name. Omit to mark the drawing decorative. */
  label?: string;
}

/** The garment outline, in the module's single definition. */
export const GARMENT_PATH =
  'M34 12 20 20 6 32l10 12 8-6v76h52V38l8 6 10-12L80 20 66 12a16 8 0 0 1-32 0z';

export const GARMENT_VIEWBOX = '0 0 100 128';

/**
 * The garment drawn in a given colour.
 *
 * Used as the design canvas, as the gallery's colour view, and as a product
 * card's image when a product has no photograph — six real photos cover
 * seventeen products, so several legitimately have none, and a broken-image
 * icon is a worse answer than an accurate drawing.
 *
 * The outline is derived from the fill: a light garment needs a dark edge or it
 * dissolves into the pale surface behind it, and a dark one needs a light edge.
 */
export const GarmentMark: React.FC<GarmentMarkProps> = ({
  hex,
  view = 'front',
  className,
  label,
}) => {
  const fill = hex ?? '#FFFFFF';
  const outline = isLightColor(fill) ? 'rgba(17,17,17,0.28)' : 'rgba(255,255,255,0.35)';

  return (
    <svg
      viewBox={GARMENT_VIEWBOX}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path d={GARMENT_PATH} fill={fill} stroke={outline} strokeWidth="1.5" strokeLinejoin="round" />
      {view === 'front' && (
        <path d="M40 12a12 7 0 0 0 20 0" fill="none" stroke={outline} strokeWidth="1.5" />
      )}
    </svg>
  );
};
