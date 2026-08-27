import React from 'react';
import type { DesignTemplateArtwork } from '@/types/custom-wear';

export interface DesignMarkProps {
  artwork: DesignTemplateArtwork;
  /** Drop the plate behind the mark, for placing on a garment. */
  bare?: boolean;
  className?: string;
}

/**
 * Renders a library design.
 *
 * The templates are data, not files — a kind plus one or two strings and two
 * colours — so the mark is drawn here. That keeps the library weightless and
 * lets the same design render at any size, on the garment and in the picker,
 * without a single asset request.
 */
export const DesignMark: React.FC<DesignMarkProps> = ({ artwork, bare = false, className = '' }) => {
  const { kind, primary, secondary, color, background } = artwork;

  const frame: React.CSSProperties = {
    background: bare ? 'transparent' : background,
    color,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    lineHeight: 1,
    textAlign: 'center',
  };

  if (kind === 'badge') {
    return (
      <span className={className} style={{ ...frame, borderRadius: '999px', aspectRatio: '1 / 1' }}>
        <span style={{ fontWeight: 800, fontSize: '38cqw', letterSpacing: '0.06em' }}>{primary}</span>
        {secondary && (
          <span style={{ fontWeight: 600, fontSize: '20cqw', letterSpacing: '0.14em', marginTop: '6%' }}>
            {secondary}
          </span>
        )}
      </span>
    );
  }

  if (kind === 'wordmark') {
    return (
      <span className={className} style={frame}>
        <span style={{ fontWeight: 800, fontSize: '26cqw', letterSpacing: '0.08em' }}>{primary}</span>
        {secondary && (
          <span style={{ fontWeight: 600, fontSize: '12cqw', letterSpacing: '0.2em', marginTop: '8%' }}>
            {secondary}
          </span>
        )}
      </span>
    );
  }

  if (kind === 'icon') {
    return (
      <span className={className} style={frame}>
        <span style={{ fontWeight: 700, fontSize: '44cqw' }}>{primary}</span>
      </span>
    );
  }

  // monogram
  return (
    <span className={className} style={frame}>
      <span style={{ fontWeight: 800, fontSize: '48cqw', letterSpacing: '0.02em' }}>{primary}</span>
    </span>
  );
};
