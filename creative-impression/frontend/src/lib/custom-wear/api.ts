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
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';
import { findRelatedProducts, queryProducts } from './filters';
import type {
  CustomWearFilterState,
  CustomWearProduct,
  CustomWearQuoteSummary,
  ProductQueryResult,
  QuoteContactPayload,
  QuoteLinePayload,
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
//
// Quotes go straight to the Express API (`/api/custom-wear`), which stores
// them as `CustomWearQuote` rows and issues the reference. A result is only
// ever returned once the backend has stored the request — there is no
// provisional path that could tell a customer "received" when nothing was kept.

interface QuoteResponseData {
  reference: string;
  references: string[];
  persisted: boolean;
  receivedAt: string;
}

const toQuoteResult = (data: QuoteResponseData | undefined): QuoteRequestResult => {
  if (!data || typeof data.reference !== 'string' || data.persisted !== true) {
    throw new CustomWearApiError('The quote service returned an unexpected response.', 502);
  }
  return {
    reference: data.reference,
    references: Array.isArray(data.references) ? data.references : [data.reference],
    persisted: true,
    receivedAt: data.receivedAt,
  };
};

const toApiError = (error: unknown, fallback: string): CustomWearApiError =>
  new CustomWearApiError(getApiErrorMessage(error, fallback), getApiErrorStatus(error) ?? 500);

/** Submit one configured garment for a quote. */
export async function submitQuoteRequest(
  payload: QuoteRequestPayload
): Promise<QuoteRequestResult> {
  try {
    const response = await apiClient.post('/custom-wear/quotes', payload);
    return toQuoteResult(response.data?.data);
  } catch (error) {
    if (error instanceof CustomWearApiError) throw error;
    throw toApiError(error, 'We could not submit your quote request. Please try again.');
  }
}

/** Submit several garments under one contact — one stored quote per line. */
export async function submitQuoteBatch(
  contact: QuoteContactPayload,
  items: QuoteLinePayload[]
): Promise<QuoteRequestResult> {
  try {
    const response = await apiClient.post('/custom-wear/quotes/batch', { ...contact, items });
    return toQuoteResult(response.data?.data);
  } catch (error) {
    if (error instanceof CustomWearApiError) throw error;
    throw toApiError(error, 'We could not submit your quote requests. Please try again.');
  }
}

/** The signed-in customer's quotes. */
export async function fetchMyQuotes(): Promise<CustomWearQuoteSummary[]> {
  try {
    const response = await apiClient.get('/custom-wear/quotes/mine');
    return (response.data?.data?.quotes ?? []) as CustomWearQuoteSummary[];
  } catch (error) {
    throw toApiError(error, 'Could not load your quotes.');
  }
}

/** Guest status check: answers only when the email matches the request. */
export async function lookupQuote(
  reference: string,
  email: string
): Promise<CustomWearQuoteSummary> {
  try {
    const response = await apiClient.get(
      `/custom-wear/quotes/${encodeURIComponent(reference.trim().toUpperCase())}`,
      { params: { email: email.trim() } }
    );
    return response.data?.data?.quote as CustomWearQuoteSummary;
  } catch (error) {
    throw toApiError(error, 'Could not look up that quote.');
  }
}

export interface UploadedArtwork {
  url: string;
  name: string;
  format: 'png' | 'jpg' | 'webp' | 'pdf';
  bytes: number;
  rasterised: boolean;
}

/** Store one artwork file; returns its `/uploads/artwork/...` path. */
export async function uploadArtwork(file: File): Promise<UploadedArtwork> {
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await apiClient.post('/custom-wear/artwork', form, {
      // Let the browser write the multipart header with its own boundary.
      headers: { 'Content-Type': undefined },
      timeout: 120000,
    });
    const artwork = response.data?.data?.artwork as UploadedArtwork | undefined;
    if (!artwork?.url) throw new CustomWearApiError('The upload returned no file.', 502);
    return artwork;
  } catch (error) {
    if (error instanceof CustomWearApiError) throw error;
    throw toApiError(error, 'Could not upload that file. Please try again.');
  }
}
