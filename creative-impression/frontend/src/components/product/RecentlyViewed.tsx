'use client';

import React, { useEffect, useState } from 'react';
import { ScrollRail } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getRecentlyViewedIds } from '@/lib/recently-viewed';
import { Product } from '@/types';
import { ProductCard } from './ProductCard';

export interface RecentlyViewedProps {
  heading?: string;
  /** Kept out of its own rail — the product page passes the id it is showing. */
  excludeId?: string;
}

/**
 * The rail of products this browser has opened before.
 *
 * The ids live in localStorage, so this can only run after mount; rendering
 * nothing until the fetch resolves keeps the server and client markup
 * identical and avoids a hydration mismatch. It also renders nothing when the
 * list is empty or every id has since been delisted, so a first-time visitor
 * never sees an empty heading.
 */
export const RecentlyViewed: React.FC<RecentlyViewedProps> = ({
  heading = 'Recently viewed',
  excludeId,
}) => {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const ids = getRecentlyViewedIds().filter((id) => id !== excludeId);
    // Nothing to show and nothing to clear: `products` only ever holds what a
    // previous run of this effect fetched for the same rail, and the section
    // is hidden when the list is empty.
    if (ids.length === 0) return;

    let cancelled = false;
    apiClient
      .get('/products', { params: { ids: ids.join(','), limit: ids.length } })
      .then((res) => {
        if (!cancelled) setProducts(res.data?.data?.products ?? []);
      })
      // A rail of past views is a nicety; a failed fetch hides it rather than
      // interrupting the page it is sitting on.
      .catch(() => {
        if (!cancelled) setProducts([]);
      });

    return () => {
      cancelled = true;
    };
  }, [excludeId]);

  if (products.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-heading">
      <h2
        id="recently-viewed-heading"
        className="m-0 mb-4 text-ink"
        style={{ fontSize: 'clamp(18px, 2vw, 24px)', letterSpacing: '-0.02em' }}
      >
        {heading}
      </h2>
      <ScrollRail label="recently viewed">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} className="pcard-fixed snap-start" />
        ))}
      </ScrollRail>
    </section>
  );
};
