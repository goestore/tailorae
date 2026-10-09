import React from 'react';
import type { Metadata } from 'next';
import { SearchResults } from '@/components/search';
import { fetchProductsPage, SSR_PAGE_SIZE } from '@/lib/server-products';
import { apiBase } from '@/lib/site-url';
import type { SearchSuggestion } from '@/lib/products-api';

/**
 * Search results, on a route of their own.
 *
 * `/products?q=` still works and still refines the listing — this is not a
 * replacement for it. But a search is a different page from a filtered
 * category: it has to repeat the query back, it has to say something useful
 * when it finds nothing, and it must never be indexed. The listing is shared by
 * every section page, so making it behave one way for `q` and another way for
 * `category` would put a search's concerns into every category page that has
 * nothing to do with them. Splitting the route keeps the header's search box
 * pointing at one destination that is free to be a search result page and
 * nothing else.
 *
 * Rendered on the server for the same reason the catalogue is: a shopper who
 * followed a shared search link should get products in the HTML, not a spinner.
 */

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? '';

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const query = one((await searchParams).q).trim();

  return {
    title: query
      ? `Search results for “${query}” | Creative Impression`
      : 'Search | Creative Impression',
    description: query
      ? `Products matching “${query}” at Creative Impression.`
      : 'Search the Creative Impression catalogue by name, style or SKU.',
    /**
     * There is one of these per query anyone has ever typed, and none of them
     * should compete with the category pages for the same words. `follow` stays
     * on so the products linked from here are still discovered.
     */
    robots: { index: false, follow: true },
  };
}

/**
 * The nearest spellings the catalogue holds, for the empty state.
 *
 * Only asked for once the search itself has come back with nothing, and the
 * backend only answers with near matches in that case anyway — so a successful
 * search never pays for this. Failure is silent: a missing "did you mean" makes
 * the empty state thinner, not broken.
 */
async function fetchNearMatches(query: string): Promise<SearchSuggestion[]> {
  try {
    const response = await fetch(
      `${apiBase()}/products/search/q?q=${encodeURIComponent(query)}&limit=6`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 60, tags: ['products'] },
      }
    );
    if (!response.ok) return [];

    const payload = await response.json();
    return payload?.data?.fuzzy ? ((payload?.data?.items as SearchSuggestion[]) ?? []) : [];
  } catch (error) {
    console.warn('[ssr] search suggestions unavailable:', (error as Error).message);
    return [];
  }
}

export default async function SearchPage({ searchParams }: PageProps) {
  const query = one((await searchParams).q).trim();

  const initial = query
    ? await fetchProductsPage({ q: query, page: 1, limit: SSR_PAGE_SIZE })
    : null;

  const total = initial?.total ?? 0;
  const nearMatches = query && total === 0 ? await fetchNearMatches(query) : [];

  return (
    // Keyed on the query so arriving at a new search builds a fresh component
    // rather than appending its results to the previous query's.
    <SearchResults
      key={query}
      query={query}
      initialProducts={initial?.products ?? []}
      initialTotal={total}
      nearMatches={nearMatches}
    />
  );
}
