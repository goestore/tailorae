import React from 'react';

export interface ProductCardSkeletonProps {
  count?: number;
}

const Line: React.FC<{ width: string; height?: number }> = ({ width, height = 12 }) => (
  <div
    className="animate-pulse rounded"
    style={{ width, height, backgroundColor: 'var(--cw-surface-alt)' }}
  />
);

/**
 * Matches the real card's box model exactly, so swapping skeleton for content
 * causes no layout shift.
 */
export const ProductCardSkeleton: React.FC = () => (
  <div
    className="flex h-full flex-col overflow-hidden bg-white"
    style={{ border: '1px solid var(--cw-border)', borderRadius: 'var(--cw-radius-card)' }}
    aria-hidden="true"
  >
    <div
      className="w-full animate-pulse"
      style={{ aspectRatio: 'var(--cw-card-aspect)', backgroundColor: 'var(--cw-surface-alt)' }}
    />
    <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="h-[18px] w-[18px] animate-pulse rounded-full"
            style={{ backgroundColor: 'var(--cw-surface-alt)' }}
          />
        ))}
      </div>
      <Line width="90%" height={15} />
      <Line width="60%" height={15} />
      <Line width="40%" />
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Line width="55%" height={14} />
        <div
          className="animate-pulse rounded"
          style={{ height: 42, backgroundColor: 'var(--cw-surface-alt)' }}
        />
      </div>
    </div>
  </div>
);

export const ProductGridSkeleton: React.FC<ProductCardSkeletonProps> = ({ count = 8 }) => (
  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
    {Array.from({ length: count }).map((_, index) => (
      <ProductCardSkeleton key={index} />
    ))}
  </div>
);
