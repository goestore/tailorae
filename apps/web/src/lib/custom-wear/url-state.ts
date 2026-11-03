/**
 * URL <-> filter-state serialisation.
 *
 * Every filter lives in the query string so listings are bookmarkable and
 * shareable: `/custom-wear?gender=men&type=polo&color=black,navy&size=L,XL`
 */

import { MULTI_FILTER_KEYS, EMPTY_FILTERS } from './filters';
import { SORT_OPTIONS, getCategoryById } from '@/config/custom-wear/taxonomy';
import type {
  CustomWearFilterState,
  MultiFilterKey,
  PurchaseMode,
  SortId,
} from '@/types/custom-wear';

/** Short, readable query keys. Changing one only affects this map. */
export const QUERY_KEYS: Record<MultiFilterKey, string> = {
  gender: 'gender',
  productType: 'type',
  color: 'color',
  size: 'size',
  fabric: 'fabric',
  gsm: 'gsm',
  method: 'method',
  location: 'location',
  moq: 'moq',
};

const VALID_SORTS = new Set<string>(SORT_OPTIONS.map((option) => option.id));

/** Accepts both `URLSearchParams` and Next's plain `searchParams` object. */
export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

const readParam = (params: SearchParamsInput, key: string): string | null => {
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const readList = (params: SearchParamsInput, key: string): string[] => {
  const raw = readParam(params, key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const readNumber = (params: SearchParamsInput, key: string): number | null => {
  const raw = readParam(params, key);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export function parseFilters(
  params: SearchParamsInput,
  defaults: Partial<CustomWearFilterState> = {}
): CustomWearFilterState {
  const base = { ...EMPTY_FILTERS, ...defaults };

  const modeParam = readParam(params, 'mode');
  const mode: PurchaseMode = modeParam === 'quote' ? 'quote' : modeParam === 'shop' ? 'shop' : base.mode;

  const sortParam = readParam(params, 'sort');
  const sort: SortId = sortParam && VALID_SORTS.has(sortParam) ? (sortParam as SortId) : base.sort;

  const categoryParam = readParam(params, 'category');
  const category = categoryParam && getCategoryById(categoryParam) ? categoryParam : base.category;

  const pageValue = readNumber(params, 'page');
  const page = pageValue && pageValue > 0 ? Math.floor(pageValue) : 1;

  const next: CustomWearFilterState = {
    ...base,
    mode,
    sort,
    category,
    page,
    minPrice: readNumber(params, 'minPrice') ?? base.minPrice,
    maxPrice: readNumber(params, 'maxPrice') ?? base.maxPrice,
    search: readParam(params, 'q') ?? base.search,
  };

  MULTI_FILTER_KEYS.forEach((key) => {
    const values = readList(params, QUERY_KEYS[key]);
    if (values.length > 0) {
      (next[key] as string[]) = values;
    }
  });

  return next;
}

/**
 * Serialises state back to a query string. `defaults` (usually the values
 * implied by the route path) are omitted so pretty URLs stay clean.
 */
export function serializeFilters(
  filters: CustomWearFilterState,
  defaults: Partial<CustomWearFilterState> = {}
): string {
  const params = new URLSearchParams();

  if (filters.mode !== (defaults.mode ?? EMPTY_FILTERS.mode)) {
    params.set('mode', filters.mode);
  }
  if (filters.category && filters.category !== defaults.category) {
    params.set('category', filters.category);
  }

  MULTI_FILTER_KEYS.forEach((key) => {
    const values = filters[key] as string[];
    const defaultValues = (defaults[key] as string[] | undefined) ?? [];
    const isDefault =
      values.length === defaultValues.length &&
      values.every((value) => defaultValues.includes(value));
    if (values.length > 0 && !isDefault) {
      params.set(QUERY_KEYS[key], values.join(','));
    }
  });

  if (filters.minPrice !== null) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== null) params.set('maxPrice', String(filters.maxPrice));
  if (filters.search.trim()) params.set('q', filters.search.trim());
  if (filters.sort !== EMPTY_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));

  return params.toString();
}

/** Full href for the current state, e.g. `/custom-wear/men/polo-t-shirts?color=black`. */
export function buildFilterHref(
  pathname: string,
  filters: CustomWearFilterState,
  defaults: Partial<CustomWearFilterState> = {}
): string {
  const query = serializeFilters(filters, defaults);
  return query ? `${pathname}?${query}` : pathname;
}
