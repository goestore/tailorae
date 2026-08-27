import React from 'react';
import { Product } from '@/types';
import { ProductCard } from './ProductCard';

export interface ProductGridProps {
  products: Product[];
  columns?: 1 | 2 | 3 | 4;
  loading?: boolean;
}

/**
 * Every variant starts 2-up on the narrowest phone. The 4-up ladder holds at
 * three columns until xl because this grid sits beside a 200px filter rail —
 * going four-wide at lg left the cards narrower than anywhere else on the site.
 */
const GRID_COLS: Record<NonNullable<ProductGridProps['columns']>, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
};

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  columns = 4,
  loading = false,
}) => {
  // Same gap tokens the home-page rows use, so a card sits on the same rhythm
  // wherever it appears.
  const gridClass = `grid ${GRID_COLS[columns]} gap-x-[var(--card-gap)] gap-y-[var(--card-row-gap)]`;

  if (loading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 8 }).map((_, i) => (
          // Mirrors the real card's shape so nothing shifts when data lands.
          <div key={i}>
            <div
              className="animate-pulse rounded-card bg-neutral-200"
              style={{ aspectRatio: 'var(--card-ratio)' }}
            />
            <div className="space-y-2 pt-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-neutral-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg text-ink-3">No products found</p>
      </div>
    );
  }

  return (
    <div className={gridClass}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
};
