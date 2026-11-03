import React from 'react';
import { Product, ProductColor } from '@/types';
import { ProductCard } from './ProductCard';

export interface ProductGridProps {
  products: Product[];
  columns?: 1 | 2 | 3 | 4;
  loading?: boolean;
  /**
   * When set, a product shows only its matching colourways. Without it a
   * colour filter would return the product with all of its colours, including
   * the ones the shopper filtered out.
   */
  selectedColor?: string;
}

interface ColorTile {
  key: string;
  product: Product;
  color?: ProductColor;
}

/**
 * Expand products into one tile per colour.
 *
 * A product with no colour information yields a single tile of itself, so a
 * catalogue that has never had variants entered looks exactly as it did before.
 */
/** "Navy Blue" → "navy-blue", the form colour families take in the URL. */
const familySlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function toTiles(products: Product[], selectedColor?: string): ColorTile[] {
  // The filter value is a list of colour families; a tile shows when its own
  // colour files under one of them.
  const wanted = new Set(
    (selectedColor ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  );

  return products.flatMap((product) => {
    const colors = product.colors ?? [];
    if (colors.length === 0) {
      return [{ key: product.id, product }];
    }

    // Filtering to a colour that a product no longer lists would drop the
    // product from a grid the API said matches, so fall back to all of them.
    const matched = wanted.size
      ? colors.filter((color) => color.family && wanted.has(familySlug(color.family)))
      : colors;
    const shown = matched.length > 0 ? matched : colors;

    return shown.map((color) => ({
      key: `${product.id}:${color.id}`,
      product,
      color,
    }));
  });
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
  selectedColor,
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
      {toTiles(products, selectedColor).map((tile, index) => (
        <ProductCard
          key={tile.key}
          product={tile.product}
          color={tile.color}
          /**
           * The first row is above the fold, and one of those images is the
           * page's Largest Contentful Paint. Lazy-loading it — which is the
           * default — means the browser does not start fetching until layout
           * has run. It never showed before because the grid only existed
           * after hydration; server rendering makes it the measured LCP.
           */
          priority={index < columns}
        />
      ))}
    </div>
  );
};
