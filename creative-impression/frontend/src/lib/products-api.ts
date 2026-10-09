import { apiClient } from '@/lib/api-client';
import type { Brand, Category, Product, Seller } from '@/types';

/**
 * The shop listing's calls, in one place.
 *
 * Parameter names and values mirror 9impression's product API — `q`, `color`,
 * `sale`, `newest`, and `sortBy` of `popular | new | price-low | price-high` —
 * so a filtered URL means the same thing against either store. The backend
 * accepts this project's original spellings too, so nothing that already calls
 * `/products` had to change.
 */

export interface ProductFilters {
  category?: string;
  /** popular | new | price-low | price-high */
  sortBy?: string;
  minPrice?: number;
  maxPrice?: number;
  color?: string;
  /** Brand slug or id. */
  brand?: string;
  /** Seller shop slug or id. */
  vendor?: string;
  q?: string;
  sale?: boolean;
  newest?: boolean;
  /** Only products with stock on hand. */
  inStock?: boolean;
  /** A size as sold (or its standard size). */
  size?: string;
  /** "Ideal for" — Myntra age group, e.g. Kids-Girls. */
  ageGroup?: string;
  /** A section's audience; unlike ageGroup, untagged products still qualify. */
  audience?: string;
  /** Template attribute facets, e.g. { upperMaterial: 'Leather' } → attr_upperMaterial. */
  attributes?: Record<string, string>;
  /** Subcategory keyword narrowing, applied server-side. */
  match?: string[];
  exclude?: string[];
  page?: number;
  limit?: number;
}

export interface ProductsPage {
  products: Product[];
  /** Total across the whole filter set, not just this page. */
  total: number;
}

/** Only defined, non-empty values reach the query string. */
function toParams(filters: ProductFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.category) params.category = filters.category;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.minPrice) params.minPrice = String(filters.minPrice);
  if (filters.maxPrice) params.maxPrice = String(filters.maxPrice);
  if (filters.color) params.color = filters.color;
  if (filters.brand) params.brand = filters.brand;
  if (filters.vendor) params.vendor = filters.vendor;
  if (filters.q) params.q = filters.q;
  if (filters.sale) params.sale = '1';
  if (filters.newest) params.newest = '1';
  if (filters.inStock) params.inStock = '1';
  if (filters.size) params.size = filters.size;
  if (filters.ageGroup) params.ageGroup = filters.ageGroup;
  if (filters.audience) params.audience = filters.audience;
  for (const [key, value] of Object.entries(filters.attributes ?? {})) {
    if (value) params[`attr_${key}`] = value;
  }
  if (filters.match?.length) params.match = filters.match.join(',');
  if (filters.exclude?.length) params.exclude = filters.exclude.join(',');
  params.page = String(filters.page ?? 1);
  params.limit = String(filters.limit ?? 24);
  return params;
}

/**
 * One page of the catalogue, plus the total the filters match.
 *
 * The total comes from the envelope, with the `X-Total-Count` header as the
 * fallback — the header is what 9impression returns, and the backend sets both.
 */
export async function getProductsPage(filters: ProductFilters = {}): Promise<ProductsPage> {
  const response = await apiClient.get('/products', { params: toParams(filters) });
  const products: Product[] = response.data?.data?.products ?? [];
  const fromEnvelope = response.data?.data?.pagination?.total;
  const fromHeader = Number(response.headers['x-total-count']);

  const total =
    typeof fromEnvelope === 'number'
      ? fromEnvelope
      : Number.isFinite(fromHeader)
        ? fromHeader
        : products.length;

  return { products, total };
}

export interface SizeFacet {
  value: string;
  /** Baby, Kids, Adult, Plus, Waist / length — as the listing form groups sizes. */
  group: string;
}

export interface AttributeFacet {
  key: string;
  label: string;
  values: string[];
  /** A number field's unit, shown after each value ("120 Hz"). */
  unit?: string;
}

export interface Facets {
  sizes: SizeFacet[];
  ageGroups: Array<{ value: string; label: string }>;
  /** Filterable attributes of the category's template (upper material…). */
  attributes?: AttributeFacet[];
  /** What the size facet is called here: "UK size" for footwear. */
  optionLabel?: string;
}

/** Sizes and age groups live products carry, within a category when given. */
export async function getFacets(category?: string): Promise<Facets> {
  const response = await apiClient.get('/products/facets/list', {
    params: category ? { category } : {},
  });
  return {
    sizes: response.data?.data?.sizes ?? [],
    ageGroups: response.data?.data?.ageGroups ?? [],
    attributes: response.data?.data?.attributes ?? [],
    optionLabel: response.data?.data?.optionLabel ?? 'Size',
  };
}

/** A colour family the filter offers: the fixed list, never a seller's spelling. */
export interface ColourFacet {
  name: string;
  slug: string;
  hex: string;
  /** Products carrying it. */
  count: number;
}

/**
 * Colour facets for the filter bar, within a category when given. Independent
 * of the other filters, so picking a size never hides a colour option.
 */
export async function getColors(category?: string): Promise<ColourFacet[]> {
  const response = await apiClient.get('/products/colors/list', {
    params: category ? { category } : undefined,
  });
  return response.data?.data?.families ?? [];
}

/** The whole fixed list, for the listing form's "Colour family" dropdown. */
export async function getColourFamilies(): Promise<Array<{ name: string; slug: string; hex: string }>> {
  const response = await apiClient.get('/products/colors/families');
  return response.data?.data?.families ?? [];
}

/** The family a colour name most likely files under ("Dusty Rose" → Rose). */
export async function suggestColourFamily(name: string, hex?: string | null): Promise<string | null> {
  const response = await apiClient.get('/products/colors/suggest', {
    params: { name, ...(hex ? { hex } : {}) },
  });
  return response.data?.data?.family ?? null;
}

/** The selected colour families in a `color` query value: "navy-blue,multi". */
export const parseColourParam = (value: string | undefined | null): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Brands with at least one live product, for the filter facet and the brand
 * index. A brand whose whole range is out of stock is left out — offering it
 * only sends the shopper to an empty grid.
 */
export async function getBrands(): Promise<Brand[]> {
  const response = await apiClient.get('/products/brands/list');
  return response.data?.data?.brands ?? [];
}

/** One brand, for its own page. Returns null when the slug is unknown. */
export async function getBrand(slug: string): Promise<Brand | null> {
  try {
    const response = await apiClient.get(`/products/brands/${encodeURIComponent(slug)}`);
    return response.data?.data?.brand ?? null;
  } catch {
    return null;
  }
}

/** Shops with at least one live product. */
export async function getSellers(): Promise<Seller[]> {
  const response = await apiClient.get('/products/sellers/list');
  return response.data?.data?.sellers ?? [];
}

/** Categories that currently have something active to sell. */
export async function getCategories(): Promise<Category[]> {
  const response = await apiClient.get('/products/categories/list');
  return response.data?.data?.categories ?? [];
}

export interface SearchSuggestion {
  id: string;
  name: string;
  slug: string;
  price: number;
  originalPrice: number | null;
  thumbnail: string | null;
  category?: { name: string; slug: string } | null;
}

export interface SearchSuggestions {
  items: SearchSuggestion[];
  /**
   * True when nothing matched the query literally and these are the nearest
   * spellings the catalogue holds. The caller has to say so — presenting a
   * guess as a result is how "polp" quietly becomes "polo" and the shopper
   * never learns they mistyped.
   */
  fuzzy: boolean;
}

const NO_SUGGESTIONS: SearchSuggestions = { items: [], fuzzy: false };

/**
 * Typeahead search. Returns few enough rows to render as a dropdown.
 *
 * Takes a signal because this fires on every keystroke: without one, a slow
 * response for "pol" can land after the response for "polo" and repaint the
 * list with the older answer.
 */
export async function searchProducts(
  term: string,
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<SearchSuggestions> {
  const trimmed = term.trim();
  if (!trimmed) return NO_SUGGESTIONS;

  const params: Record<string, string> = { q: trimmed };
  if (options.limit) params.limit = String(options.limit);

  const response = await apiClient.get('/products/search/q', {
    params,
    signal: options.signal,
  });

  return {
    items: response.data?.data?.items ?? [],
    fuzzy: Boolean(response.data?.data?.fuzzy),
  };
}
