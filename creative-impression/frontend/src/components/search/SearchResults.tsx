'use client';

import React, { useState } from 'react';
import { Breadcrumbs, Button } from '@/components/common';
import { ProductGrid } from '@/components/product/ProductGrid';
import { getProductsPage, type SearchSuggestion } from '@/lib/products-api';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { Product } from '@/types';
import { SearchAutocomplete } from './SearchAutocomplete';
import { SearchEmptyState } from './SearchEmptyState';

/**
 * The results half of `/search`.
 *
 * Page one arrives already rendered from the server component above it, so the
 * grid is in the HTML rather than behind a spinner and a round trip. This
 * component only exists for the two things the server cannot do: accumulate
 * further pages behind Load more, and carry the refine box.
 *
 * It is mounted with the query as its key, so arriving at a different query
 * builds a fresh component rather than appending the new results to the old
 * ones.
 */

/** Must match the server's SSR_PAGE_SIZE, or page two overlaps page one. */
const PAGE_SIZE = 24;

export interface SearchResultsProps {
  query: string;
  initialProducts: Product[];
  initialTotal: number;
  /** Nearest spellings, resolved on the server when the query matched nothing. */
  nearMatches?: SearchSuggestion[];
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  query,
  initialProducts,
  initialTotal,
  nearMatches = [],
}) => {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasQuery = query.trim().length > 0;
  const hasMore = products.length < initialTotal;

  const loadMore = () => {
    const next = page + 1;
    setIsLoadingMore(true);
    setError(null);
    getProductsPage({ q: query, page: next, limit: PAGE_SIZE })
      .then((result) => {
        // Ranking is a total order, so a product cannot appear on two pages —
        // but a concurrent catalogue edit could still shift one, and a
        // duplicate key in the grid is a React error rather than a cosmetic
        // one.
        setProducts((current) => {
          const seen = new Set(current.map((product) => product.id));
          return [...current, ...result.products.filter((product) => !seen.has(product.id))];
        });
        setPage(next);
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Could not load more results.')))
      .finally(() => setIsLoadingMore(false));
  };

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Search' }]} />

        <header className="mt-6 border-b border-line pb-6">
          <h1
            className="m-0 text-ink"
            style={{ fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.05, letterSpacing: '-0.03em' }}
          >
            {hasQuery ? <>Results for &ldquo;{query}&rdquo;</> : 'Search'}
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
            {!hasQuery
              ? 'Search the catalogue by name, style or SKU.'
              : initialTotal > 0
                ? `${initialTotal} ${initialTotal === 1 ? 'product' : 'products'}, most relevant first`
                : 'Nothing matched'}
          </p>

          {/* The same combobox the header uses, so refining a search behaves
              identically wherever it is done. */}
          <div className="mt-5 max-w-xl">
            <SearchAutocomplete initialQuery={query} autoFocus={!hasQuery} />
          </div>
        </header>

        {hasQuery && initialTotal > 0 ? (
          <>
            <div className="mt-8">
              <ProductGrid products={products} columns={4} />
            </div>

            {error && (
              <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--sale)' }}>
                {error}
              </p>
            )}

            {hasMore && (
              <div className="mt-10 flex justify-center">
                <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? 'Loading…' : `Load more (${initialTotal - products.length} left)`}
                </Button>
              </div>
            )}
          </>
        ) : (
          <SearchEmptyState
            query={hasQuery ? query : ''}
            nearMatches={nearMatches}
          />
        )}
      </div>
    </main>
  );
};
