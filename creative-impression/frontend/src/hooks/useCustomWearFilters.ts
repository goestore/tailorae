'use client';

/**
 * URL-backed filter state.
 *
 * The query string is the single source of truth: every listing is
 * shareable/bookmarkable, and back/forward navigation restores the exact view.
 * Updates use `router.replace` with `scroll: false`, so changing a filter never
 * jumps the page or pushes a history entry per checkbox.
 */

import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { clearAllFilters, removeChip, toggleMultiValue } from '@/lib/custom-wear/filters';
import { buildFilterHref, parseFilters } from '@/lib/custom-wear/url-state';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import type {
  ActiveFilterChip,
  CustomWearFilterState,
  MultiFilterKey,
  PurchaseMode,
  SortId,
} from '@/types/custom-wear';

export interface UseCustomWearFiltersOptions {
  /** Filters implied by the route path (e.g. the category on a pretty URL). */
  defaults?: Partial<CustomWearFilterState>;
}

export interface UseCustomWearFiltersResult {
  filters: CustomWearFilterState;
  /** True while the router transition for a filter change is in flight. */
  isPending: boolean;
  setMode: (mode: PurchaseMode) => void;
  setSort: (sort: SortId) => void;
  setSearch: (search: string) => void;
  setPage: (page: number) => void;
  setCategory: (categoryId: string | null) => void;
  setPriceRange: (min: number | null, max: number | null) => void;
  toggleValue: (key: MultiFilterKey, value: string) => void;
  clearChip: (chip: ActiveFilterChip) => void;
  clearAll: () => void;
  hrefFor: (next: CustomWearFilterState) => string;
}

export function useCustomWearFilters({
  defaults = {},
}: UseCustomWearFiltersOptions = {}): UseCustomWearFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // `defaults` is a fresh object literal on every render; key on its content.
  const defaultsKey = JSON.stringify(defaults);
  const stableDefaults = useMemo<Partial<CustomWearFilterState>>(
    () => JSON.parse(defaultsKey) as Partial<CustomWearFilterState>,
    [defaultsKey]
  );

  const filters = useMemo(
    () => parseFilters(searchParams, stableDefaults),
    [searchParams, stableDefaults]
  );

  const hrefFor = useCallback(
    (next: CustomWearFilterState) => buildFilterHref(pathname, next, stableDefaults),
    [pathname, stableDefaults]
  );

  const commit = useCallback(
    (next: CustomWearFilterState) => {
      startTransition(() => {
        router.replace(hrefFor(next), { scroll: false });
      });
    },
    [router, hrefFor]
  );

  const setMode = useCallback(
    (mode: PurchaseMode) => {
      if (mode === filters.mode) return;
      trackCustomWearEvent('custom_wear_mode_changed', { mode });
      commit({ ...filters, mode });
    },
    [filters, commit]
  );

  const setSort = useCallback(
    (sort: SortId) => commit({ ...filters, sort, page: 1 }),
    [filters, commit]
  );

  const setSearch = useCallback(
    (search: string) => {
      if (search.trim() !== filters.search.trim()) {
        trackCustomWearEvent('custom_wear_search', { query: search.trim() });
      }
      commit({ ...filters, search, page: 1 });
    },
    [filters, commit]
  );

  const setPage = useCallback(
    (page: number) => commit({ ...filters, page: Math.max(1, page) }),
    [filters, commit]
  );

  const setCategory = useCallback(
    (categoryId: string | null) => {
      trackCustomWearEvent('custom_wear_category_selected', { category: categoryId ?? 'all' });
      commit({ ...filters, category: categoryId, page: 1 });
    },
    [filters, commit]
  );

  const setPriceRange = useCallback(
    (min: number | null, max: number | null) =>
      commit({ ...filters, minPrice: min, maxPrice: max, page: 1 }),
    [filters, commit]
  );

  const toggleValue = useCallback(
    (key: MultiFilterKey, value: string) => {
      const next = toggleMultiValue(filters, key, value);
      trackCustomWearEvent('custom_wear_filter_applied', {
        filter: key,
        value,
        active: (next[key] as string[]).includes(value),
      });
      commit(next);
    },
    [filters, commit]
  );

  const clearChip = useCallback(
    (chip: ActiveFilterChip) => commit(removeChip(filters, chip)),
    [filters, commit]
  );

  const clearAll = useCallback(() => commit(clearAllFilters(filters)), [filters, commit]);

  return {
    filters,
    isPending,
    setMode,
    setSort,
    setSearch,
    setPage,
    setCategory,
    setPriceRange,
    toggleValue,
    clearChip,
    clearAll,
    hrefFor,
  };
}
