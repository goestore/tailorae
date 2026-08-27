import React from 'react';

export interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  className?: string;
}

/**
 * Accessible star rating. The stars are decorative; the numeric value is what
 * screen readers announce, so rating is never communicated by shape alone.
 */
export const StarRating: React.FC<StarRatingProps> = ({ rating, reviewCount, className = '' }) => {
  const clamped = Math.max(0, Math.min(5, rating));

  return (
    <span className={`cw-stars ${className}`.trim()}>
      <span className="cw-stars-track" aria-hidden="true">
        <span className="cw-stars-empty">
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} />
          ))}
        </span>
        <span className="cw-stars-fill" style={{ width: `${(clamped / 5) * 100}%` }}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} />
          ))}
        </span>
      </span>
      <span className="cw-stars-value">{clamped.toFixed(1)}</span>
      {reviewCount !== undefined && <span className="cw-stars-count">({reviewCount})</span>}
      <span className="sr-only">
        Rated {clamped.toFixed(1)} out of 5
        {reviewCount !== undefined ? ` from ${reviewCount} reviews` : ''}
      </span>
    </span>
  );
};

const Star: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8z" />
  </svg>
);
