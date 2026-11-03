import React from 'react';
import Link from 'next/link';
import { ProductThumb } from '@/components/product/ProductThumb';
import type { SearchSuggestion } from '@/lib/products-api';
import { formatCurrency } from '@/utils/helpers';

/**
 * What a search shows when it finds nothing.
 *
 * The listing's "Nothing matches those filters." is honest about a filter set
 * and wrong about a query: it does not repeat what was searched for, so a
 * shopper cannot see their own typo, and it offers nothing to do next. This
 * echoes the query, hands back the nearest spellings the catalogue actually
 * holds, and puts the sections one click away — a dead end is the most
 * expensive screen in a storefront.
 */

/** Where someone who found nothing is most likely to find something. */
const POPULAR_SECTIONS: { label: string; href: string }[] = [
  { label: "Women's", href: '/products/womens' },
  { label: "Men's", href: '/products/mens' },
  { label: 'Kids', href: '/products/kids' },
  { label: 'New arrivals', href: '/products/new-arrivals' },
  { label: 'Sale', href: '/products/sale' },
  { label: 'Custom wear', href: '/custom-wear' },
];

export interface SearchEmptyStateProps {
  /** Empty means nothing has been searched for yet, not that a search failed. */
  query: string;
  /**
   * Nearest spellings in the catalogue, when nothing matched literally. The
   * backend only returns these once a strict search has already failed.
   */
  nearMatches?: SearchSuggestion[];
}

export const SearchEmptyState: React.FC<SearchEmptyStateProps> = ({
  query,
  nearMatches = [],
}) => (
  <div className="mt-10">
    <div className="border border-line bg-surface-2 px-6 py-12 text-center">
      {query ? (
        <>
          <p className="m-0 text-lg text-ink">
            No results for &ldquo;<span className="font-semibold">{query}</span>&rdquo;
          </p>
          <p className="mx-auto mt-2 max-w-[52ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
            Check the spelling, try a shorter phrase, or search by SKU. Every product code on an
            invoice works here.
          </p>
        </>
      ) : (
        <>
          <p className="m-0 text-lg text-ink">What are you looking for?</p>
          <p className="mx-auto mt-2 max-w-[52ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
            Search by product name, style or SKU — or pick up a section below.
          </p>
        </>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/products" className="btn btn-primary">
          Browse the catalogue
        </Link>
        <Link href="/products/new-arrivals" className="btn btn-outline">
          New arrivals
        </Link>
      </div>
    </div>

    {nearMatches.length > 0 && (
      <section className="mt-10" aria-labelledby="search-did-you-mean">
        <h2 id="search-did-you-mean" className="m-0 text-[15px] font-semibold text-ink">
          Did you mean
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
          The closest spellings in the catalogue to &ldquo;{query}&rdquo;.
        </p>
        <ul className="mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {nearMatches.map((product) => (
            <li key={product.id}>
              <Link
                href={`/products/${product.slug}`}
                className="flex items-center gap-3 border border-line bg-surface p-3 transition-colors hover:border-[var(--border-strong)]"
              >
                <ProductThumb
                  src={product.thumbnail}
                  alt={product.name}
                  className="h-16 w-12 shrink-0 border border-line"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{product.name}</span>
                  {product.category && (
                    <span className="block truncate text-[11px]" style={{ color: 'var(--ink-3)' }}>
                      {product.category.name}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-semibold text-ink">
                  {formatCurrency(product.price)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )}

    <section className="mt-10" aria-labelledby="search-popular">
      <h2 id="search-popular" className="m-0 text-[15px] font-semibold text-ink">
        Or start from a section
      </h2>
      <ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
        {POPULAR_SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="inline-flex items-center border border-line bg-surface px-4 py-2 text-[13px] text-ink transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]"
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  </div>
);
