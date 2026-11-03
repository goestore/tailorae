'use client';

/**
 * Client-side filter state for the Custom Wear browse page.
 *
 * The query string stays the single source of truth, so every view is
 * shareable and the back button restores exactly what was on screen. Writes go
 * through `router.replace` inside a transition: no history entry per checkbox,
 * no scroll jump, and `isPending` drives the loading treatment while the server
 * re-queries.
 *
 * Route-implied filters (the gender on `/custom-wear/men`, the category on a
 * type route) arrive as `defaults` and are deliberately kept OUT of the URL —
 * they are already expressed by the path, and repeating them makes for ugly,
 * redundant links.
 */

import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { QUERY_KEYS, parseFilters, serializeFilters } from '@/lib/custom-wear/url-state';
import type { CustomWearFilterState, MultiFilterKey, SortId } from '@/types/custom-wear';

export interface UseCollectionFiltersOptions {
  defaults?: Partial<CustomWearFilterState>;
}

export interface ActiveChip {
  key: MultiFilterKey | 'search' | 'price';
  value: string;
  label: string;
}

export interface UseCollectionFiltersResult {
  filters: CustomWearFilterState;
  isPending: boolean;
  chips: ActiveChip[];
  activeCount: number;
  toggle: (key: MultiFilterKey, value: string) => void;
  setSearch: (value: string) => void;
  setSort: (value: SortId) => void;
  setPage: (value: number) => void;
  setPrice: (min: number | null, max: number | null) => void;
  clearChip: (chip: ActiveChip) => void;
  clearAll: () => void;
}

const MULTI_KEYS: MultiFilterKey[] = [
  'gender',
  'productType',
  'color',
  'size',
  'fabric',
  'gsm',
  'method',
  'location',
  'moq',
];

export function useCollectionFilters({
  defaults = {},
}: UseCollectionFiltersOptions = {}): UseCollectionFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // `defaults` is a fresh literal each render; key the memo on its content.
  const defaultsKey = JSON.stringify(defaults);
  const stableDefaults = useMemo(
    () => JSON.parse(defaultsKey) as Partial<CustomWearFilterState>,
    [defaultsKey]
  );

  const filters = useMemo(
    () => parseFilters(searchParams, stableDefaults),
    [searchParams, stableDefaults]
  );

  const commit = useCallback(
    (next: CustomWearFilterState) => {
      const query = serializeFilters(next, stableDefaults);
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [router, pathname, stableDefaults]
  );

  /** Any change to what is being matched sends the reader back to page one. */
  const commitFromPageOne = useCallback(
    (patch: Partial<CustomWearFilterState>) => commit({ ...filters, ...patch, page: 1 }),
    [commit, filters]
  );

  const toggle = useCallback(
    (key: MultiFilterKey, value: string) => {
      const current = filters[key] as string[];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      commitFromPageOne({ [key]: next } as Partial<CustomWearFilterState>);
    },
    [filters, commitFromPageOne]
  );

  const setSearch = useCallback(
    (value: string) => commitFromPageOne({ search: value }),
    [commitFromPageOne]
  );

  const setSort = useCallback((value: SortId) => commitFromPageOne({ sort: value }), [
    commitFromPageOne,
  ]);

  const setPrice = useCallback(
    (min: number | null, max: number | null) => commitFromPageOne({ minPrice: min, maxPrice: max }),
    [commitFromPageOne]
  );

  // Paging is the one change that keeps its place rather than resetting it.
  const setPage = useCallback((value: number) => commit({ ...filters, page: value }), [
    commit,
    filters,
  ]);

  const chips = useMemo<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];

    MULTI_KEYS.forEach((key) => {
      // A value the route already implies is not something the reader chose,
      // so it gets no chip and cannot be cleared into an invalid state.
      const implied = (stableDefaults[key] as string[] | undefined) ?? [];
      (filters[key] as string[])
        .filter((value) => !implied.includes(value))
        .forEach((value) => out.push({ key, value, label: labelFor(key, value) }));
    });

    if (filters.search.trim()) {
      out.push({ key: 'search', value: filters.search, label: `“${filters.search}”` });
    }

    if (filters.minPrice !== null || filters.maxPrice !== null) {
      const min = filters.minPrice ?? 0;
      const max = filters.maxPrice;
      out.push({
        key: 'price',
        value: 'price',
        label: max === null ? `₹${min}+` : `₹${min} – ₹${max}`,
      });
    }

    return out;
  }, [filters, stableDefaults]);

  const clearChip = useCallback(
    (chip: ActiveChip) => {
      if (chip.key === 'search') return void setSearch('');
      if (chip.key === 'price') return void setPrice(null, null);
      return void toggle(chip.key, chip.value);
    },
    [setSearch, setPrice, toggle]
  );

  const clearAll = useCallback(() => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [router, pathname]);

  return {
    filters,
    isPending,
    chips,
    activeCount: chips.length,
    toggle,
    setSearch,
    setSort,
    setPage,
    setPrice,
    clearChip,
    clearAll,
  };
}

/** Human label for a chip, resolved from the filter group that owns the value. */
function labelFor(key: MultiFilterKey, value: string): string {
  const group = FILTER_LABELS[key];
  return group?.[value] ?? value;
}

// Built once from the taxonomy so a chip never shows a raw slug.
import { CUSTOM_WEAR_FILTER_GROUPS } from '@/config/custom-wear/taxonomy';

const FILTER_LABELS: Partial<Record<MultiFilterKey, Record<string, string>>> = Object.fromEntries(
  CUSTOM_WEAR_FILTER_GROUPS.map((group) => [
    group.key,
    Object.fromEntries(group.options.map((option) => [option.id, option.label])),
  ])
);

export { QUERY_KEYS };
