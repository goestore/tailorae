'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Custom Wear for the staff console (`/admin/custom-wear/...`).
 *
 * Quotes (SUPPORT): every request for a custom printed or embroidered garment
 * is worked from NEW through CONTACTED and QUOTED to WON or LOST, with the
 * quoted price (paise) and private notes kept on the request. Design files are
 * five-minute signed links, so a quote is re-read before its files are opened.
 *
 * Products (CONTENT): the custom wear catalogue. The API saves a product whole
 * (`CustomWearProductRequest`); every price on it is paise.
 */

export const QUOTE_STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'] as const;
export type AdminQuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<AdminQuoteStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUOTED: 'Quoted',
  WON: 'Won',
  LOST: 'Lost',
};

/** An uploaded artwork file: its stored reference and a signed link to it. */
export interface QuoteArtwork {
  reference: string;
  name: string;
  /** png | jpeg | webp | svg | pdf … */
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  url: string;
}

export interface AdminCustomWearQuote {
  id: string;
  reference: string;
  userId: string | null;
  productId: string | null;
  productSlug: string;
  productName: string;
  sku: string;
  colorName: string | null;
  sizes: string[];
  quantity: number;
  method: string | null;
  locations: string[];
  /** Five-minute signed links. */
  designFiles: string[];
  artwork: QuoteArtwork[];
  notes: string | null;
  customerName: string;
  company: string | null;
  email: string;
  phone: string | null;
  country: string;
  postcode: string | null;
  requiredBy: string | null;
  status: AdminQuoteStatus;
  quotedPricePaise: number | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
}

export type QuoteCounts = Record<AdminQuoteStatus | 'ALL', number>;

export interface QuoteListResult {
  quotes: AdminCustomWearQuote[];
  counts: QuoteCounts;
  pagination: { page: number; limit: number; total: number; pages: number };
}

export async function listCustomWearQuotes(params: {
  status?: AdminQuoteStatus | 'ALL';
  search?: string;
  page?: number;
}): Promise<QuoteListResult> {
  try {
    const response = await apiClient.get('/admin/custom-wear/quotes', {
      params: {
        status: params.status && params.status !== 'ALL' ? params.status : undefined,
        search: params.search?.trim() || undefined,
        page: params.page ?? 1,
        limit: 50,
      },
    });
    return response.data.data as QuoteListResult;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load quote requests.'));
  }
}

/** One quote with fresh signed links to its files. */
export async function getCustomWearQuote(id: string): Promise<AdminCustomWearQuote> {
  try {
    const response = await apiClient.get(`/admin/custom-wear/quotes/${encodeURIComponent(id)}`);
    return response.data.data.quote as AdminCustomWearQuote;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that quote.'));
  }
}

export async function updateCustomWearQuote(
  id: string,
  patch: {
    status?: AdminQuoteStatus;
    quotedPricePaise?: number | null;
    adminNotes?: string | null;
  }
): Promise<AdminCustomWearQuote> {
  try {
    const response = await apiClient.patch(
      `/admin/custom-wear/quotes/${encodeURIComponent(id)}`,
      patch
    );
    return response.data.data.quote as AdminCustomWearQuote;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that quote.'));
  }
}

/* ----- Products ---------------------------------------------------------- */

/** The API's fixed vocabularies (CustomWearTaxonomy). */
export const CW_GENDERS = ['men', 'women', 'kids', 'unisex'] as const;
export const CW_PRODUCT_TYPES = ['polo', 'round-neck', 'hoodie', 'sweatshirt', 'sportswear'] as const;
export const CW_FABRICS = [
  'cotton-100',
  'cotton-blend',
  'polyester',
  'performance-polyester',
  'dry-fit',
  'organic-cotton',
  'recycled-polyester',
] as const;
export const CW_BADGES = [
  'new',
  'bestseller',
  'premium',
  'eco-friendly',
  'no-moq',
  'new-options',
] as const;

/** Category ids are `<mens|womens|kids>-<type>`; each fixes gender and product type. */
export const CW_CATEGORIES: Array<{ id: string; gender: string; productType: string; label: string }> =
  [
    ['men', 'mens', "Men's"],
    ['women', 'womens', "Women's"],
    ['kids', 'kids', "Kids'"],
  ].flatMap(([gender, prefix, who]) =>
    [
      ['polo', 'polo', 'Polo T-Shirts'],
      ['round-neck', 'round-neck', 'Round Neck T-Shirts'],
      ['hoodies', 'hoodie', 'Hoodies'],
      ['sweatshirts', 'sweatshirt', 'Sweatshirts'],
      ['sports-wear', 'sportswear', 'Sports Wear'],
    ].map(([id, productType, label]) => ({
      id: `${prefix}-${id}`,
      gender,
      productType,
      label: `${who} ${label}`,
    }))
  );

/**
 * The structured parts of a product — tiers, colours, sizes, images,
 * customisation options and copy blocks — edited as JSON in the console.
 */
export const CW_STRUCTURED_KEYS = [
  'priceTiers',
  'colors',
  'sizes',
  'images',
  'customizationMethods',
  'customizationLocations',
  'accordions',
  'descriptionBlock',
  'sizeChart',
  'relatedProductIds',
] as const;

export interface AdminCustomWearProduct {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string;
  description: string;
  gender: string;
  category: string;
  productType: string;
  fabric: string | null;
  gsm: number | null;
  fit: string | null;
  basePricePaise: number;
  maxPricePaise: number | null;
  currency: string;
  rating: number;
  reviewCount: number;
  badges: string[];
  minOrderQuantity: number;
  defaultQuantity: number | null;
  highlights: string[];
  popularity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  priceTiers: Array<{ minQty: number; maxQty?: number | null; pricePerUnitPaise: number }>;
  colors: unknown[];
  sizes: unknown[];
  images: Array<{ id: string; url: string; alt: string; role: string; colorId?: string }>;
  customizationMethods: unknown[];
  customizationLocations: unknown[];
  accordions: unknown[];
  descriptionBlock: unknown;
  sizeChart: unknown;
  relatedProductIds: string[];
}

/** The API's `CustomWearProductRequest`: everything but id, slug-optional, timestamps. */
export type CustomWearProductInput = Omit<
  AdminCustomWearProduct,
  'id' | 'createdAt' | 'updatedAt' | 'slug'
> & { slug?: string };

export async function listCustomWearProducts(): Promise<AdminCustomWearProduct[]> {
  try {
    const response = await apiClient.get('/admin/custom-wear/products', {
      params: { includeInactive: true },
    });
    return (response.data?.data?.products as AdminCustomWearProduct[]) ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load custom wear products.'));
  }
}

export async function saveCustomWearProduct(
  id: string | null,
  input: CustomWearProductInput
): Promise<AdminCustomWearProduct> {
  try {
    const response = id
      ? await apiClient.put(`/admin/custom-wear/products/${encodeURIComponent(id)}`, input)
      : await apiClient.post('/admin/custom-wear/products', input);
    return response.data?.data?.product as AdminCustomWearProduct;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save that product.'));
  }
}

export async function deleteCustomWearProduct(id: string): Promise<string> {
  try {
    const response = await apiClient.delete(`/admin/custom-wear/products/${encodeURIComponent(id)}`);
    return response.data?.message ?? 'Product deleted.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not delete that product.'));
  }
}

/** A saved product as the request that would save it again unchanged. */
export function productToInput(product: AdminCustomWearProduct): CustomWearProductInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, createdAt, updatedAt, ...rest } = product;
  return rest;
}
