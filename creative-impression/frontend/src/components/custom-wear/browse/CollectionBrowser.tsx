'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CUSTOM_WEAR_CATEGORY_GROUPS,
  CUSTOM_WEAR_FILTER_GROUPS,
  SORT_OPTIONS,
  categoryHref,
  getCategoryById,
} from '@/config/custom-wear/taxonomy';
import { useCollectionFilters } from '@/hooks/useCollectionFilters';
import type { CustomWearFilterState, ProductQueryResult, SortId } from '@/types/custom-wear';
import { Breadcrumbs, type Crumb } from '../Breadcrumbs';
import { CustomWearProductCard } from '../CustomWearProductCard';
import { FilterMenu } from './FilterMenu';

export interface CollectionBrowserProps {
  result: ProductQueryResult;
  /** Filters the route already implies; kept out of the query string. */
  defaults?: Partial<CustomWearFilterState>;
  heading: string;
  breadcrumbs: Crumb[];
}

/** Groups worth a menu on the bar. The rest were noise on a catalogue this size. */
const BAR_GROUPS = ['productType', 'color', 'size', 'fabric', 'method'] as const;

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The Custom Wear browse page.
 *
 * A category strip, a single row of filter menus, then products edge to edge.
 * The previous page spent a fixed 248px column on a permanently expanded filter
 * sidebar — a quarter of the width on every screen, showing fifteen category
 * links and nine filter groups at once. Here the categories read as one line of
 * links and each filter collapses behind its own button, which leaves the whole
 * page for the thing people came to look at.
 */
export const CollectionBrowser: React.FC<CollectionBrowserProps> = ({
  result,
  defaults = {},
  heading,
  breadcrumbs,
}) => {
  const {
    filters,
    isPending,
    chips,
    toggle,
    setSearch,
    setSort,
    setPage,
    clearChip,
    clearAll,
  } = useCollectionFilters({ defaults });

  const [draft, setDraft] = useState(filters.search);
  const [committed, setCommitted] = useState(filters.search);

  // Re-sync when the URL changes underneath us (back button, Clear all).
  if (committed !== filters.search) {
    setCommitted(filters.search);
    setDraft(filters.search);
  }

  useEffect(() => {
    if (draft === committed) return undefined;
    const timer = window.setTimeout(() => setSearch(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, committed, setSearch]);

  const activeCategory = getCategoryById(filters.category);
  const activeGender = activeCategory?.gender ?? defaults.gender?.[0];
  const group = CUSTOM_WEAR_CATEGORY_GROUPS.find((entry) => entry.gender === activeGender);

  const rangeStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const rangeEnd = Math.min(result.page * result.pageSize, result.total);
  const hasMore = result.page < result.pageCount;

  return (
    <div className="cw-browse">
      <div className="cw-browse-inner">
        <Breadcrumbs items={breadcrumbs} className="mb-4" />

        <header className="cw-browse-head">
          <h1>{heading}</h1>
        </header>

        {/* Categories — one line of links, not a rail. */}
        {group && (
          <nav className="cw-cats" aria-label="Categories">
            <Link
              href={`/custom-wear/${group.genderSlug}`}
              className="cw-cat"
              data-active={!activeCategory ? 'true' : undefined}
            >
              All {group.label}
            </Link>
            {group.categories.map((category) => (
              <Link
                key={category.id}
                href={categoryHref(category)}
                className="cw-cat"
                data-active={category.id === filters.category ? 'true' : undefined}
              >
                {category.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Filter bar */}
        <div className="cw-bar">
          <div className="cw-bar-search">
            <label htmlFor="cw-q" className="sr-only">
              Search Custom Wear
            </label>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.5-4.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
              />
            </svg>
            <input
              suppressHydrationWarning
              id="cw-q"
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search"
              autoComplete="off"
            />
          </div>

          <div className="cw-bar-menus">
            {BAR_GROUPS.map((key) => {
              const config = CUSTOM_WEAR_FILTER_GROUPS.find((entry) => entry.key === key);
              if (!config) return null;
              return (
                <FilterMenu
                  key={key}
                  label={config.title}
                  options={config.options}
                  selected={filters[key] as string[]}
                  onToggle={(value) => toggle(key, value)}
                  variant={config.control === 'swatch' ? 'swatch' : 'list'}
                />
              );
            })}
          </div>

          <div className="cw-bar-sort">
            <label htmlFor="cw-sort" className="cw-bar-sort-label">
              Sort
            </label>
            <select
              suppressHydrationWarning
              id="cw-sort"
              value={filters.sort}
              onChange={(event) => setSort(event.target.value as SortId)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* What is applied, and how many matched — one line. */}
        <div className="cw-applied">
          <div className="cw-applied-chips">
            {chips.map((chip) => (
              <button
                suppressHydrationWarning
                key={`${chip.key}-${chip.value}`}
                type="button"
                onClick={() => clearChip(chip)}
                className="cw-applied-chip"
              >
                {chip.label}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
            {chips.length > 0 && (
              <button
                suppressHydrationWarning
                type="button"
                onClick={clearAll}
                className="cw-applied-clear"
              >
                Clear all
              </button>
            )}
          </div>

          <p aria-live="polite" className="cw-applied-count" data-pending={isPending ? 'true' : undefined}>
            {result.total === 0
              ? 'No products'
              : `${rangeStart}–${rangeEnd} of ${result.total}`}
          </p>
        </div>

        {/* Results */}
        {result.products.length === 0 ? (
          <div className="cw-empty">
            <p>Nothing matches those filters.</p>
            <button
              suppressHydrationWarning
              type="button"
              onClick={clearAll}
              className="cw-cta cw-cta--accent"
            >
              Clear all
            </button>
          </div>
        ) : (
          <div className="cw-browse-grid" data-pending={isPending ? 'true' : undefined}>
            {result.products.map((product, index) => (
              <CustomWearProductCard
                key={product.id}
                product={product}
                mode={filters.mode}
                priority={index < 5}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="cw-more">
            <button
              suppressHydrationWarning
              type="button"
              onClick={() => setPage(result.page + 1)}
              disabled={isPending}
              className="cw-cta cw-cta--outline"
            >
              {isPending ? 'Loading…' : 'Show more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
