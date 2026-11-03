/**
 * Filter + sort engine for Custom Wear.
 *
 * Pure functions over a product array, so the exact same code runs on the
 * server (initial render) and in the client (filter changes) — and can later be
 * swapped for a server query without changing any component.
 *
 * ADD A FILTER TYPE: add the key to `MultiFilterKey`, add a group to
 * `CUSTOM_WEAR_FILTER_GROUPS`, then add one entry to `FILTER_PREDICATES`.
 */

import {
  CUSTOM_WEAR_FILTER_GROUPS,
  GSM_BUCKETS,
  MOQ_BUCKETS,
  PAGE_SIZE,
  getCategoryById,
  getFilterOptionLabel,
} from '@/config/custom-wear/taxonomy';
import type {
  ActiveFilterChip,
  CustomWearFilterState,
  CustomWearProduct,
  MultiFilterKey,
  ProductQueryResult,
  SortId,
} from '@/types/custom-wear';

export const EMPTY_FILTERS: CustomWearFilterState = {
  mode: 'shop',
  category: null,
  gender: [],
  productType: [],
  color: [],
  size: [],
  fabric: [],
  gsm: [],
  method: [],
  location: [],
  moq: [],
  minPrice: null,
  maxPrice: null,
  search: '',
  sort: 'recommended',
  page: 1,
};

export const MULTI_FILTER_KEYS: MultiFilterKey[] = CUSTOM_WEAR_FILTER_GROUPS.map(
  (group) => group.key
);

/**
 * One predicate per multi-select filter. Each answers: does this product match
 * at least one of the selected option ids? (OR within a group, AND across.)
 */
const FILTER_PREDICATES: Record<
  MultiFilterKey,
  (product: CustomWearProduct, selected: string[]) => boolean
> = {
  gender: (product, selected) => selected.includes(product.gender),

  productType: (product, selected) => selected.includes(product.productType),

  color: (product, selected) => product.colors.some((color) => selected.includes(color.id)),

  size: (product, selected) => product.sizes.some((size) => selected.includes(size.id)),

  fabric: (product, selected) => Boolean(product.fabric && selected.includes(product.fabric)),

  gsm: (product, selected) => {
    if (product.gsm === undefined) return false;
    return selected.some((bucketId) => {
      const bucket = GSM_BUCKETS.find((entry) => entry.id === bucketId);
      if (!bucket) return false;
      const gsm = product.gsm as number;
      return gsm >= bucket.min && (bucket.max === null || gsm < bucket.max);
    });
  },

  method: (product, selected) =>
    product.customizationMethods.some(
      (method) => method.supported && selected.includes(method.id)
    ),

  location: (product, selected) =>
    product.customizationLocations.some(
      (location) => location.supported && selected.includes(location.id)
    ),

  moq: (product, selected) => {
    const moq = product.minOrderQuantity ?? 1;
    return selected.some((bucketId) => {
      const bucket = MOQ_BUCKETS.find((entry) => entry.id === bucketId);
      return bucket ? moq <= bucket.max : false;
    });
  },
};

const searchableText = (product: CustomWearProduct): string =>
  [
    product.name,
    product.sku,
    product.shortDescription,
    product.productType,
    product.gender,
    product.fabric ?? '',
    product.category,
    getCategoryById(product.category)?.fullLabel ?? '',
    ...(product.badges ?? []),
    ...product.colors.map((color) => color.name),
  ]
    .join(' ')
    .toLowerCase();

const SORTERS: Record<SortId, (a: CustomWearProduct, b: CustomWearProduct) => number> = {
  recommended: (a, b) =>
    (b.popularity ?? 0) * (b.rating ?? 0) - (a.popularity ?? 0) * (a.rating ?? 0),
  popular: (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
  newest: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  'price-asc': (a, b) => a.basePrice - b.basePrice,
  'price-desc': (a, b) => b.basePrice - a.basePrice,
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0),
};

/** Applies every active filter. Sorting and pagination happen in `queryProducts`. */
export function applyFilters(
  products: CustomWearProduct[],
  filters: CustomWearFilterState
): CustomWearProduct[] {
  const category = getCategoryById(filters.category);
  const query = filters.search.trim().toLowerCase();

  return products.filter((product) => {
    if (category && product.category !== category.id) {
      // Unisex products belong to the matching type in every gender's listing.
      const sameType = product.productType === category.productType;
      const unisexMatch = product.gender === 'unisex' && sameType;
      if (!unisexMatch) return false;
    }

    for (const key of MULTI_FILTER_KEYS) {
      const selected = filters[key];
      if (selected.length > 0 && !FILTER_PREDICATES[key](product, selected as string[])) {
        return false;
      }
    }

    if (filters.minPrice !== null && product.basePrice < filters.minPrice) return false;
    if (filters.maxPrice !== null && product.basePrice > filters.maxPrice) return false;

    if (query && !searchableText(product).includes(query)) return false;

    return true;
  });
}

export function queryProducts(
  products: CustomWearProduct[],
  filters: CustomWearFilterState,
  pageSize: number = PAGE_SIZE
): ProductQueryResult {
  const filtered = applyFilters(products, filters);
  const sorted = [...filtered].sort(SORTERS[filters.sort] ?? SORTERS.recommended);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page), pageCount);
  const start = (page - 1) * pageSize;

  const allPrices = products.map((product) => product.basePrice);

  return {
    products: sorted.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pageCount,
    priceBounds: {
      min: allPrices.length ? Math.min(...allPrices) : 0,
      max: allPrices.length ? Math.max(...allPrices) : 0,
    },
  };
}

/** Chips rendered above the grid, in sidebar order. */
export function buildActiveChips(filters: CustomWearFilterState): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  const category = getCategoryById(filters.category);
  if (category) {
    chips.push({ key: 'category', value: category.id, label: category.fullLabel });
  }

  if (filters.search.trim()) {
    chips.push({ key: 'search', value: filters.search, label: `“${filters.search.trim()}”` });
  }

  MULTI_FILTER_KEYS.forEach((key) => {
    (filters[key] as string[]).forEach((value) => {
      chips.push({ key, value, label: getFilterOptionLabel(key, value) });
    });
  });

  if (filters.minPrice !== null || filters.maxPrice !== null) {
    const min = filters.minPrice ?? 0;
    const max = filters.maxPrice;
    chips.push({
      key: 'price',
      value: 'price',
      label: max === null ? `₹${min}+` : `₹${min} – ₹${max}`,
    });
  }

  return chips;
}

export function countActiveFilters(filters: CustomWearFilterState): number {
  let count = MULTI_FILTER_KEYS.reduce(
    (sum, key) => sum + (filters[key] as string[]).length,
    0
  );
  if (filters.category) count += 1;
  if (filters.minPrice !== null || filters.maxPrice !== null) count += 1;
  if (filters.search.trim()) count += 1;
  return count;
}

export function hasActiveFilters(filters: CustomWearFilterState): boolean {
  return countActiveFilters(filters) > 0;
}

/** Removes a single chip, preserving mode and sort. */
export function removeChip(
  filters: CustomWearFilterState,
  chip: ActiveFilterChip
): CustomWearFilterState {
  if (chip.key === 'category') return { ...filters, category: null, page: 1 };
  if (chip.key === 'search') return { ...filters, search: '', page: 1 };
  if (chip.key === 'price') return { ...filters, minPrice: null, maxPrice: null, page: 1 };

  return {
    ...filters,
    [chip.key]: (filters[chip.key] as string[]).filter((value) => value !== chip.value),
    page: 1,
  } as CustomWearFilterState;
}

/** Clears every filter but keeps the purchase mode and sort the user chose. */
export function clearAllFilters(filters: CustomWearFilterState): CustomWearFilterState {
  return { ...EMPTY_FILTERS, mode: filters.mode, sort: filters.sort };
}

export function toggleMultiValue(
  filters: CustomWearFilterState,
  key: MultiFilterKey,
  value: string
): CustomWearFilterState {
  const current = filters[key] as string[];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  return { ...filters, [key]: next, page: 1 } as CustomWearFilterState;
}

/**
 * Related products, ranked by: same product type, same gender, same category,
 * similar price, shared customization method. Explicit `relatedProductIds`
 * always come first.
 */
export function findRelatedProducts(
  product: CustomWearProduct,
  catalogue: CustomWearProduct[],
  limit = 6
): CustomWearProduct[] {
  const explicit = (product.relatedProductIds ?? [])
    .map((id) => catalogue.find((entry) => entry.id === id))
    .filter((entry): entry is CustomWearProduct => Boolean(entry));

  const productMethods = new Set(
    product.customizationMethods.filter((method) => method.supported).map((method) => method.id)
  );

  const scored = catalogue
    .filter(
      (candidate) =>
        candidate.id !== product.id && !explicit.some((entry) => entry.id === candidate.id)
    )
    .map((candidate) => {
      let score = 0;
      if (candidate.productType === product.productType) score += 5;
      if (candidate.gender === product.gender) score += 4;
      if (candidate.category === product.category) score += 3;

      const priceGap = Math.abs(candidate.basePrice - product.basePrice) / product.basePrice;
      if (priceGap <= 0.25) score += 2;
      else if (priceGap <= 0.5) score += 1;

      const sharedMethods = candidate.customizationMethods.filter(
        (method) => method.supported && productMethods.has(method.id)
      ).length;
      score += Math.min(sharedMethods, 3);

      return { candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.candidate.popularity ?? 0) - (a.candidate.popularity ?? 0));

  return [...explicit, ...scored.map((entry) => entry.candidate)].slice(0, limit);
}
