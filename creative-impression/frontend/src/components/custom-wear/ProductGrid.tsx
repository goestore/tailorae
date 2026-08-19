'use client';

import React from 'react';
import Link from 'next/link';
import { CUSTOM_WEAR_CATEGORY_GROUPS, categoryHref } from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';
import type { CustomWearProduct, PurchaseMode } from '@/types/custom-wear';
import { CustomWearProductCard } from './CustomWearProductCard';
import { ProductCardSkeleton } from './ProductCardSkeleton';

export interface ProductGridProps {
  products: CustomWearProduct[];
  mode: PurchaseMode;
  /** Dims the grid and shows skeletons while a filter change is in flight. */
  isPending?: boolean;
  onClearFilters: () => void;
  skeletonCount?: number;
}

/**
 * Responsive product grid: 1 column on narrow phones, 2 on standard phones and
 * tablets, 3 on small desktops, 4 on large desktops.
 */
export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  mode,
  isPending = false,
  onClearFilters,
  skeletonCount = 8,
}) => {
  if (isPending && products.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div
        className="flex flex-col items-center px-6 py-14 text-center"
        style={{
          border: '1px solid var(--cw-border)',
          borderRadius: 'var(--cw-radius-card)',
          backgroundColor: 'var(--cw-surface-alt)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--cw-font-body)',
            fontSize: '17px',
            fontWeight: 700,
            color: 'var(--cw-ink)',
          }}
        >
          {customWearContent.labels.emptyResultsTitle}
        </h2>
        <p
          style={{
            margin: '8px 0 18px',
            maxWidth: '420px',
            color: 'var(--cw-ink-subtle)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            lineHeight: 1.6,
          }}
        >
          {customWearContent.labels.emptyResultsBody}
        </p>

        <button
          suppressHydrationWarning
          type="button"
          onClick={onClearFilters}
          className="cw-cta cw-cta--accent"
        >
          Clear Filters
        </button>

        <div className="mt-8 w-full">
          <p
            className="uppercase"
            style={{
              margin: '0 0 10px',
              color: 'var(--cw-ink-subtle)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '0.12em',
            }}
          >
            Popular categories
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {CUSTOM_WEAR_CATEGORY_GROUPS.flatMap((group) =>
              group.categories.slice(0, 2).map((category) => (
                <Link
                  key={category.id}
                  href={categoryHref(category)}
                  className="transition-colors hover:bg-neutral-100"
                  style={{
                    fontFamily: 'var(--cw-font-body)',
                    fontSize: 'var(--cw-fs-micro)',
                    fontWeight: 600,
                    color: 'var(--cw-ink-muted)',
                    backgroundColor: 'var(--cw-white)',
                    border: '1px solid var(--cw-border)',
                    borderRadius: 'var(--cw-radius-chip)',
                    padding: '7px 11px',
                  }}
                >
                  {group.label} {category.label}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-3 transition-opacity duration-200 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
      style={{ opacity: isPending ? 0.55 : 1 }}
      aria-busy={isPending}
    >
      {products.map((product, index) => (
        <CustomWearProductCard
          key={product.id}
          product={product}
          mode={mode}
          priority={index < 4}
        />
      ))}
    </div>
  );
};
