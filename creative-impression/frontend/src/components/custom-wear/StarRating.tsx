import React from 'react';

export interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  size?: number;
  showCount?: boolean;
  className?: string;
}

/**
 * Accessible star rating. The stars are decorative; the numeric value is what
 * screen readers announce, so rating is never communicated by shape alone.
 */
export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  reviewCount,
  size = 14,
  showCount = true,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(5, rating));
  const percent = (clamped / 5) * 100;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`.trim()}
      style={{ fontFamily: 'var(--cw-font-body)', fontSize: 'var(--cw-fs-micro)' }}
    >
      <span
        aria-hidden="true"
        className="relative inline-block leading-none"
        style={{ width: size * 5 + 4, height: size }}
      >
        <span className="absolute inset-0 flex" style={{ color: 'var(--cw-border)' }}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} size={size} />
          ))}
        </span>
        <span
          className="absolute inset-0 flex overflow-hidden"
          style={{ color: 'var(--cw-primary)', width: `${percent}%` }}
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} size={size} />
          ))}
        </span>
      </span>
      <span style={{ color: 'var(--cw-ink-muted)', fontWeight: 600 }}>{clamped.toFixed(1)}</span>
      {showCount && reviewCount !== undefined && (
        <span style={{ color: 'var(--cw-ink-subtle)' }}>({reviewCount})</span>
      )}
      <span className="sr-only">
        Rated {clamped.toFixed(1)} out of 5
        {reviewCount !== undefined ? ` from ${reviewCount} reviews` : ''}
      </span>
    </span>
  );
};

const Star: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0">
    <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8z" />
  </svg>
);
