'use client';

import React, { Suspense } from 'react';
import { ProductListing } from '@/components/product';
import { LoadingSpinner } from '@/components/common';

/**
 * The full catalog. Nothing here but the shared listing — every refinement it
 * offers lives in ProductListing, so this page and the section pages cannot
 * drift apart again.
 */
export default function ProductsCatalogPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-[50vh]" size="lg" />}>
      <ProductListing
        title="All Products"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Products' }]}
      />
    </Suspense>
  );
}
