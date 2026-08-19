'use client';

import React, { useEffect, useState } from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import { fetchCustomWearProductsByIds } from '@/lib/custom-wear/api';
import { getRecentlyViewedIds, recordRecentlyViewed } from '@/lib/custom-wear/recently-viewed';
import type { CustomWearProduct, PurchaseMode } from '@/types/custom-wear';
import { ProductCarousel } from './ProductCarousel';

export interface RecentlyViewedProps {
  currentProductId: string;
  mode: PurchaseMode;
}

/**
 * Recently viewed rail.
 *
 * Reads ids from localStorage after mount (never during render) so the server
 * and client markup match, then records the current product.
 */
export const RecentlyViewed: React.FC<RecentlyViewedProps> = ({ currentProductId, mode }) => {
  const [products, setProducts] = useState<CustomWearProduct[]>([]);

  useEffect(() => {
    let cancelled = false;

    const previousIds = getRecentlyViewedIds().filter((id) => id !== currentProductId);
    recordRecentlyViewed(currentProductId);

    if (previousIds.length === 0) return undefined;

    fetchCustomWearProductsByIds(previousIds).then((result) => {
      if (!cancelled) setProducts(result);
    });

    return () => {
      cancelled = true;
    };
  }, [currentProductId]);

  if (products.length === 0) return null;

  return (
    <ProductCarousel
      title={customWearContent.labels.recentlyViewedHeading}
      products={products}
      mode={mode}
    />
  );
};
