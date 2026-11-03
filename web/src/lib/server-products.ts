import { cache } from 'react';
import { apiBase } from '@/lib/site-url';
import type { Product, ProductDetail } from '@/types';

/**
 * Whether the catalogue actually says this product does not exist, or the
 * lookup simply could not be completed.
 *
 * The difference matters at the page level: 'missing' is a real 404, while
 * 'unavailable' means the API was slow or restarting. Answering 404 to a
 * shopper because a backend was rebooting takes a page out of the index for a
 * deploy, so callers treat that case as "render and let the client retry".
 */
export type ProductLookup =
  | { status: 'found'; product: ProductDetail }
  | { status: 'missing'; product: null }
  | { status: 'unavailable'; product: null };

/**
 * Read one product on the server, for the page body, `generateMetadata` and
 * structured data.
 *
 * Cached for an hour and tagged, so a price or stock edit in the admin does not
 * leave a stale title in the tab for a day, and a crawler is not re-fetching
 * the API on every hit.
 *
 * Wrapped in React's `cache` because a single render asks for the same product
 * up to three times — the page, the metadata and the structured data. The abort
 * signal below opts the request out of Next's own per-render fetch
 * memoization, so without this it would hit the API once each.
 */
export const lookupProduct = cache(async (idOrSlug: string): Promise<ProductLookup> => {
  try {
    const response = await fetch(`${apiBase()}/products/${encodeURIComponent(idOrSlug)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600, tags: ['products', `product:${idOrSlug}`] },
    });

    if (response.status === 404) return { status: 'missing', product: null };
    if (!response.ok) return { status: 'unavailable', product: null };

    const payload = await response.json();
    const product = (payload?.data?.product as ProductDetail) ?? null;
    return product ? { status: 'found', product } : { status: 'missing', product: null };
  } catch (error) {
    // A missing title degrades the page; a throw here would blank it entirely.
    console.warn(`[ssr] product ${idOrSlug} unavailable:`, (error as Error).message);
    return { status: 'unavailable', product: null };
  }
});

/** The product, or null for either reason. For callers that cannot act on the difference. */
export const fetchProduct = async (idOrSlug: string): Promise<ProductDetail | null> =>
  (await lookupProduct(idOrSlug)).product;

/** Must match ProductListing's page size, or the client refetches on mount. */
export const SSR_PAGE_SIZE = 24;

/** The filters a listing can be rendered under, shaped like the API's params. */
export interface ListingQuery {
  category?: string;
  q?: string;
  color?: string;
  brand?: string;
  vendor?: string;
  sortBy?: string;
  minPrice?: number;
  maxPrice?: number;
  sale?: boolean;
  newest?: boolean;
  inStock?: boolean;
  match?: string[];
  exclude?: string[];
  page?: number;
  limit?: number;
}

/** The query string the API expects, built once so server and client agree. */
export function listingParams(query: ListingQuery): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined | null) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  };

  set('category', query.category);
  set('q', query.q);
  set('color', query.color);
  set('brand', query.brand);
  set('vendor', query.vendor);
  set('sortBy', query.sortBy);
  set('minPrice', query.minPrice);
  set('maxPrice', query.maxPrice);
  if (query.sale) params.set('sale', '1');
  if (query.newest) params.set('newest', '1');
  if (query.inStock) params.set('inStock', '1');
  if (query.match?.length) params.set('match', query.match.join(','));
  if (query.exclude?.length) params.set('exclude', query.exclude.join(','));
  params.set('page', String(query.page ?? 1));
  params.set('limit', String(query.limit ?? SSR_PAGE_SIZE));

  return params;
}

/**
 * Page one of a listing, rendered on the server.
 *
 * Without this a listing URL serves HTML whose body is a spinner: the grid only
 * exists after the JS bundle downloads, hydrates and makes a round trip. That is
 * the top of the funnel and what a crawler sees for the site's most commercial
 * keywords.
 *
 * The filters here must match what the client computes on first render from the
 * same search params, or it discards this result and fetches again.
 *
 * Returns null rather than throwing: the client fetch is still there, so a slow
 * or restarting API costs the SSR benefit for that request, not the page.
 */
export async function fetchProductsPage(
  query: ListingQuery
): Promise<{ products: Product[]; total: number } | null> {
  const params = listingParams(query);

  try {
    const response = await fetch(`${apiBase()}/products?${params.toString()}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      // Short window: a listing changes with stock and price, and a minute of
      // staleness on a grid is cheaper than an API hit per crawl.
      next: { revalidate: 60, tags: ['products'] },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const products: Product[] = payload?.data?.products ?? [];
    const total = payload?.data?.pagination?.total;
    return { products, total: typeof total === 'number' ? total : products.length };
  } catch (error) {
    console.warn('[ssr] product listing unavailable:', (error as Error).message);
    return null;
  }
}
