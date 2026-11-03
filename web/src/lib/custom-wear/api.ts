/**
 * Custom Wear data access.
 *
 * THE ONLY SEAM BETWEEN THE UI AND THE DATA SOURCE. Components never call the
 * API for Custom Wear directly.
 *
 * The catalogue is admin-managed rows served by `GET /api/custom-wear/products`.
 * The API speaks paise (`basePricePaise`, `pricePerUnitPaise`…); the studio's
 * pricing engine (`pricing.ts`) and its cards speak rupees, so products are
 * converted here, once, on the way in. Nothing past this file sees paise.
 */

import { PAGE_SIZE } from '@/config/custom-wear/taxonomy';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';
import type { CustomWearProductView, ProductQueryResult as ApiQueryResult } from '@/lib/api/types';
import { apiBase } from '@/lib/site-url';
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

export class CustomWearApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'CustomWearApiError';
    this.status = status;
  }
}

// ============================================
// PAISE → RUPEES
// ============================================

const rupees = (paise: number | null | undefined): number | undefined =>
  typeof paise === 'number' ? paise / 100 : undefined;

/** One API product in the shape the storefront's Custom Wear code reads. */
export function fromApiProduct(p: CustomWearProductView): CustomWearProduct {
  return {
    ...(p as unknown as CustomWearProduct),
    id: p.id ?? '',
    slug: p.slug ?? '',
    sku: p.sku ?? '',
    name: p.name ?? '',
    shortDescription: p.shortDescription ?? '',
    description: p.description ?? '',
    gender: (p.gender ?? 'unisex') as CustomWearProduct['gender'],
    category: p.category ?? '',
    productType: (p.productType ?? '') as CustomWearProduct['productType'],
    fabric: (p.fabric ?? undefined) as CustomWearProduct['fabric'],
    basePrice: rupees(p.basePricePaise) ?? 0,
    maxPrice: rupees(p.maxPricePaise),
    currency: p.currency ?? 'INR',
    priceTiers: (p.priceTiers ?? []).map((tier) => ({
      minQty: tier.minQty ?? 1,
      maxQty: tier.maxQty ?? null,
      pricePerUnit: rupees(tier.pricePerUnitPaise) ?? 0,
    })),
    colors: (p.colors ?? []) as CustomWearProduct['colors'],
    sizes: (p.sizes ?? []) as CustomWearProduct['sizes'],
    images: (p.images ?? []) as CustomWearProduct['images'],
    customizationMethods: (p.customizationMethods ?? []).map((method) => ({
      id: method.id as CustomWearProduct['customizationMethods'][number]['id'],
      supported: Boolean(method.supported),
      setupFee: rupees(method.setupFeePaise),
      pricePerUnit: rupees(method.pricePerUnitPaise),
      note: method.note,
    })),
    customizationLocations: (p.customizationLocations ?? []).map((location) => ({
      id: location.id as CustomWearProduct['customizationLocations'][number]['id'],
      supported: Boolean(location.supported),
      maxWidthMm: location.maxWidthMm,
      maxHeightMm: location.maxHeightMm,
      pricePerUnit: rupees(location.pricePerUnitPaise),
    })),
    badges: (p.badges ?? []) as CustomWearProduct['badges'],
    accordions: p.accordions as CustomWearProduct['accordions'],
    descriptionBlock: p.descriptionBlock as CustomWearProduct['descriptionBlock'],
    sizeChart: p.sizeChart as CustomWearProduct['sizeChart'],
  };
}

// ============================================
// CATALOGUE
// ============================================

/**
 * Server-side reads, cached for a minute: the catalogue changes when staff
 * edit it, not per request. Returns null on any failure so a page renders its
 * empty state instead of an error when the API is restarting.
 */
async function read<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60, tags: ['custom-wear'] },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return (payload?.data as T) ?? null;
  } catch (error) {
    console.warn(`[custom-wear] ${path} unavailable:`, (error as Error).message);
    return null;
  }
}

/** The API's query string for a filter state: lists comma-joined, prices in paise. */
function toQuery(filters: CustomWearFilterState, pageSize: number): string {
  const params = new URLSearchParams();
  const list = (key: string, values: string[]) => {
    if (values.length) params.set(key, values.join(','));
  };
  if (filters.category) params.set('category', filters.category);
  list('gender', filters.gender);
  list('type', filters.productType);
  list('color', filters.color);
  list('size', filters.size);
  list('fabric', filters.fabric);
  list('gsm', filters.gsm);
  list('method', filters.method);
  list('location', filters.location);
  list('moq', filters.moq);
  if (filters.minPrice !== null) params.set('minPricePaise', String(Math.round(filters.minPrice * 100)));
  if (filters.maxPrice !== null) params.set('maxPricePaise', String(Math.round(filters.maxPrice * 100)));
  if (filters.search.trim()) params.set('q', filters.search.trim());
  params.set('sort', filters.sort);
  params.set('page', String(filters.page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

const EMPTY_RESULT = (pageSize: number): ProductQueryResult => ({
  products: [],
  total: 0,
  page: 1,
  pageSize,
  pageCount: 1,
  priceBounds: { min: 0, max: 0 },
});

/** Filtered, sorted, paginated listing — filtering runs in the API. */
export async function fetchCustomWearProducts(
  filters: CustomWearFilterState,
  pageSize: number = PAGE_SIZE
): Promise<ProductQueryResult> {
  const data = await read<ApiQueryResult>(`/custom-wear/products?${toQuery(filters, pageSize)}`);
  if (!data) return EMPTY_RESULT(pageSize);
  return {
    products: (data.products ?? []).map(fromApiProduct),
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? pageSize,
    pageCount: data.pageCount ?? 1,
    priceBounds: {
      min: rupees(data.priceBounds?.minPaise) ?? 0,
      max: rupees(data.priceBounds?.maxPaise) ?? 0,
    },
  };
}

export async function fetchCustomWearProductBySlug(
  slug: string
): Promise<CustomWearProduct | null> {
  const data = await read<{ product?: CustomWearProductView }>(
    `/custom-wear/products/${encodeURIComponent(slug)}`
  );
  return data?.product ? fromApiProduct(data.product) : null;
}

/** Products by id, in the order asked for (the cart's quote lines, recently viewed). */
export async function fetchCustomWearProductsByIds(
  ids: string[]
): Promise<CustomWearProduct[]> {
  if (ids.length === 0) return [];
  const data = await read<ApiQueryResult>(
    `/custom-wear/products?ids=${ids.map(encodeURIComponent).join(',')}&pageSize=${ids.length}`
  );
  const index = new Map((data?.products ?? []).map((p) => [p.id, fromApiProduct(p)]));
  return ids
    .map((id) => index.get(id))
    .filter((product): product is CustomWearProduct => Boolean(product));
}

export async function fetchRelatedProducts(
  product: CustomWearProduct,
  limit = 6
): Promise<CustomWearProduct[]> {
  const data = await read<{ products?: CustomWearProductView[] }>(
    `/custom-wear/products/${encodeURIComponent(product.slug || product.id)}/related?limit=${limit}`
  );
  return (data?.products ?? []).map(fromApiProduct);
}

/**
 * Recommendation slot. Until behavioural data exists this is the most popular
 * products of the same gender, excluding the ones already shown as related.
 */
export async function fetchAlsoViewedProducts(
  product: CustomWearProduct,
  excludeIds: string[] = [],
  limit = 6
): Promise<CustomWearProduct[]> {
  const exclude = new Set([product.id, ...excludeIds]);
  const data = await read<ApiQueryResult>(
    `/custom-wear/products?gender=${encodeURIComponent(product.gender)}&sort=popular&pageSize=${limit + exclude.size}`
  );
  return (data?.products ?? [])
    .map(fromApiProduct)
    .filter((candidate) => !exclude.has(candidate.id))
    .slice(0, limit);
}

/** Every slug, for `generateStaticParams` and the sitemap. */
export async function fetchAllCustomWearSlugs(): Promise<string[]> {
  const data = await read<{ slugs?: string[] }>('/custom-wear/products/slugs');
  return data?.slugs ?? [];
}

// ============================================
// QUOTES
// ============================================
//
// A result is only ever returned once the API has stored the request — there
// is no provisional path that could tell a customer "received" when nothing
// was kept. Validation failures come back as 422 with `errors[]`.

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

/** A stored quote as the API sends it: the quoted price in paise. */
type ApiQuote = Omit<CustomWearQuoteSummary, 'quotedPrice'> & { quotedPricePaise?: number | null };

const fromApiQuote = (quote: ApiQuote): CustomWearQuoteSummary => ({
  ...quote,
  quotedPrice: rupees(quote.quotedPricePaise) ?? null,
});

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
    const response = await apiClient.get('/custom-wear/quotes/mine', { silent: true });
    return ((response.data?.data?.quotes ?? []) as ApiQuote[]).map(fromApiQuote);
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
    return fromApiQuote(response.data?.data?.quote as ApiQuote);
  } catch (error) {
    throw toApiError(error, 'Could not look up that quote.');
  }
}

export interface UploadedArtwork {
  /**
   * What a quote's `designFiles` carries: the API's `artwork/<uuid>.<ext>`
   * reference. Artwork is private, so this is an identifier, not a link.
   */
  url: string;
  name: string;
  format: 'png' | 'jpg' | 'webp' | 'pdf';
  bytes: number;
  rasterised: boolean;
}

/** Store one artwork file; returns its reference for the quote. */
export async function uploadArtwork(file: File): Promise<UploadedArtwork> {
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await apiClient.post('/custom-wear/artwork', form, {
      // Let the browser write the multipart header with its own boundary.
      headers: { 'Content-Type': undefined },
      timeout: 120000,
    });
    const artwork = response.data?.data?.artwork as
      | { reference?: string; name?: string; format?: string; bytes?: number; rasterised?: boolean }
      | undefined;
    if (!artwork?.reference) throw new CustomWearApiError('The upload returned no file.', 502);
    return {
      url: artwork.reference,
      name: artwork.name ?? file.name,
      format: (artwork.format ?? 'png') as UploadedArtwork['format'],
      bytes: artwork.bytes ?? file.size,
      rasterised: Boolean(artwork.rasterised),
    };
  } catch (error) {
    if (error instanceof CustomWearApiError) throw error;
    throw toApiError(error, 'Could not upload that file. Please try again.');
  }
}
