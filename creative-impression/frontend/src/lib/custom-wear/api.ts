/**
 * Custom Wear data access.
 *
 * THE ONLY SEAM BETWEEN THE UI AND THE DATA SOURCE. Components never import
 * the dataset directly.
 *
 * Right now `creative-impression/backend` returns stubs for
 * `GET /api/products`, so the catalogue is served from the local sample data
 * and `CUSTOM_WEAR_DATA_SOURCE` reports `'sample-data'`. When the product API
 * is implemented, set `NEXT_PUBLIC_CUSTOM_WEAR_API` and replace the marked
 * bodies below with the fetch — nothing else in the module changes.
 */

import { PAGE_SIZE } from '@/config/custom-wear/taxonomy';
import { CUSTOM_WEAR_PRODUCTS } from '@/data/custom-wear/products';
import { findRelatedProducts, queryProducts } from './filters';
import type {
  CustomWearFilterState,
  CustomWearProduct,
  ProductQueryResult,
  QuoteRequestPayload,
  QuoteRequestResult,
} from '@/types/custom-wear';

/** `'api'` once a product endpoint is configured, otherwise `'sample-data'`. */
export const CUSTOM_WEAR_DATA_SOURCE: 'api' | 'sample-data' = process.env
  .NEXT_PUBLIC_CUSTOM_WEAR_API
  ? 'api'
  : 'sample-data';

export class CustomWearApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'CustomWearApiError';
    this.status = status;
  }
}

// ============================================
// CATALOGUE
// ============================================

/**
 * Filtered, sorted, paginated listing.
 *
 * BACKEND SWAP: replace the body with
 * `GET ${API}/custom-wear/products?<serializeFilters(filters)>` and return the
 * `ProductQueryResult` the endpoint sends back. The filter engine in
 * `filters.ts` then becomes server-side only.
 */
export async function fetchCustomWearProducts(
  filters: CustomWearFilterState,
  pageSize: number = PAGE_SIZE
): Promise<ProductQueryResult> {
  return queryProducts(CUSTOM_WEAR_PRODUCTS, filters, pageSize);
}

/** BACKEND SWAP: `GET ${API}/custom-wear/products/${slug}`. */
export async function fetchCustomWearProductBySlug(
  slug: string
): Promise<CustomWearProduct | null> {
  return CUSTOM_WEAR_PRODUCTS.find((product) => product.slug === slug) ?? null;
}

export async function fetchCustomWearProductsByIds(
  ids: string[]
): Promise<CustomWearProduct[]> {
  if (ids.length === 0) return [];
  const index = new Map(CUSTOM_WEAR_PRODUCTS.map((product) => [product.id, product]));
  return ids
    .map((id) => index.get(id))
    .filter((product): product is CustomWearProduct => Boolean(product));
}

/** BACKEND SWAP: `GET ${API}/custom-wear/products/${product.id}/related`. */
export async function fetchRelatedProducts(
  product: CustomWearProduct,
  limit = 6
): Promise<CustomWearProduct[]> {
  return findRelatedProducts(product, CUSTOM_WEAR_PRODUCTS, limit);
}

/**
 * Recommendation slot. Until behavioural data exists this returns popular
 * products from the same gender, excluding the ones already shown as related.
 */
export async function fetchAlsoViewedProducts(
  product: CustomWearProduct,
  excludeIds: string[] = [],
  limit = 6
): Promise<CustomWearProduct[]> {
  const exclude = new Set([product.id, ...excludeIds]);
  return CUSTOM_WEAR_PRODUCTS.filter(
    (candidate) => !exclude.has(candidate.id) && candidate.gender === product.gender
  )
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, limit);
}

/** Every slug, for `generateStaticParams` and the sitemap. */
export async function fetchAllCustomWearSlugs(): Promise<string[]> {
  return CUSTOM_WEAR_PRODUCTS.map((product) => product.slug);
}

// ============================================
// QUOTES
// ============================================

/**
 * Submits a quote request to the Next.js route handler at
 * `/api/custom-wear/quotes`, which issues the reference number server-side and
 * forwards to the quote backend when one is configured.
 */
export async function submitQuoteRequest(
  payload: QuoteRequestPayload
): Promise<QuoteRequestResult> {
  const response = await fetch('/api/custom-wear/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : 'We could not submit your quote request. Please try again.';
    throw new CustomWearApiError(message, response.status);
  }

  if (
    !data ||
    typeof data !== 'object' ||
    !('reference' in data) ||
    typeof (data as QuoteRequestResult).reference !== 'string'
  ) {
    throw new CustomWearApiError('The quote service returned an unexpected response.', 502);
  }

  return data as QuoteRequestResult;
}
