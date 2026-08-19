'use client';

import React, { useRef } from 'react';
import type { CustomWearProduct, PurchaseMode } from '@/types/custom-wear';
import { CustomWearProductCard } from '../CustomWearProductCard';

export interface ProductCarouselProps {
  title: string;
  products: CustomWearProduct[];
  mode: PurchaseMode;
  /** Rendered as an h2 by default; pass 'h3' when nested under another section. */
  headingLevel?: 'h2' | 'h3';
}

/**
 * Horizontal product rail used by Related, Also Viewed and Recently Viewed.
 * Reuses `CustomWearProductCard` — the card markup exists in exactly one place.
 */
export const ProductCarousel: React.FC<ProductCarouselProps> = ({
  title,
  products,
  mode,
  headingLevel: Heading = 'h2',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  const scrollBy = (direction: 'left' | 'right') => {
    const element = scrollRef.current;
    if (!element) return;
    const amount = element.clientWidth * 0.8;
    element.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <section className="py-10" style={{ borderTop: '1px solid var(--cw-border)' }}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <Heading
          style={{
            margin: 0,
            fontFamily: 'var(--cw-font-heading)',
            fontSize: 'var(--cw-fs-section)',
            fontWeight: 600,
            letterSpacing: '-0.015em',
            color: 'var(--cw-ink)',
          }}
        >
          {title}
        </Heading>

        <div className="hidden gap-2 md:flex">
          {(['left', 'right'] as const).map((direction) => (
            <button
              suppressHydrationWarning
              key={direction}
              type="button"
              onClick={() => scrollBy(direction)}
              aria-label={direction === 'left' ? `Scroll ${title} left` : `Scroll ${title} right`}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-neutral-50"
              style={{ border: '1px solid var(--cw-border)' }}
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                style={{ color: 'var(--cw-ink)' }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={direction === 'left' ? 'm15 19-7-7 7-7' : 'm9 5 7 7-7 7'}
                />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:gap-4"
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="w-[calc(50%-6px)] flex-shrink-0 snap-start sm:w-[280px] lg:w-[300px]"
          >
            <CustomWearProductCard product={product} mode={mode} maxSwatches={5} />
          </div>
        ))}
      </div>
    </section>
  );
};
