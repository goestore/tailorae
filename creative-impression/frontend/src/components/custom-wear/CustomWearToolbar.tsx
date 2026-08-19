'use client';

import React, { useEffect, useState } from 'react';
import { SORT_OPTIONS } from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';
import type { SortId } from '@/types/custom-wear';

export interface CustomWearToolbarProps {
  heading: string;
  description?: string;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  search: string;
  sort: SortId;
  activeFilterCount: number;
  onSearchChange: (value: string) => void;
  onSortChange: (sort: SortId) => void;
  onOpenFilters: () => void;
  isPending?: boolean;
}

const SEARCH_DEBOUNCE_MS = 350;

/** Collection heading, result count, search, sort, and the mobile Filters button. */
export const CustomWearToolbar: React.FC<CustomWearToolbarProps> = ({
  heading,
  description,
  total,
  rangeStart,
  rangeEnd,
  search,
  sort,
  activeFilterCount,
  onSearchChange,
  onSortChange,
  onOpenFilters,
  isPending = false,
}) => {
  const [draft, setDraft] = useState(search);
  const [committedSearch, setCommittedSearch] = useState(search);

  // Keep the input in step with the URL (back button, Clear All, chip removal).
  if (committedSearch !== search) {
    setCommittedSearch(search);
    setDraft(search);
  }

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (draft === committedSearch) return undefined;
    const timer = window.setTimeout(() => onSearchChange(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, committedSearch, onSearchChange]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--cw-font-heading)',
              fontSize: 'var(--cw-fs-page)',
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: '-0.015em',
              color: 'var(--cw-ink)',
            }}
          >
            {heading}
          </h1>
          {description && (
            <p
              className="mt-2"
              style={{
                margin: '8px 0 0',
                maxWidth: '640px',
                color: 'var(--cw-ink-subtle)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-small)',
                lineHeight: 1.6,
              }}
            >
              {description}
            </p>
          )}
          <p
            aria-live="polite"
            style={{
              margin: '10px 0 0',
              color: 'var(--cw-ink-muted)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
              opacity: isPending ? 0.55 : 1,
            }}
          >
            {total === 0
              ? 'Showing 0 products'
              : `Showing ${rangeStart}–${rangeEnd} of ${total} product${total === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-shrink-0">
          <div className="relative w-full sm:w-[260px]">
            <label htmlFor="cw-search" className="sr-only">
              {customWearContent.labels.searchPlaceholder}
            </label>
            <input
              suppressHydrationWarning
              id="cw-search"
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={customWearContent.labels.searchPlaceholder}
              className="w-full"
              style={{ paddingLeft: '36px' }}
              autoComplete="off"
            />
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{ color: 'var(--cw-ink-subtle)' }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.5-4.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
              />
            </svg>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="cw-sort"
              className="whitespace-nowrap"
              style={{
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-micro)',
                fontWeight: 600,
                color: 'var(--cw-ink-muted)',
              }}
            >
              {customWearContent.labels.sortLabel}
            </label>
            <select
              suppressHydrationWarning
              id="cw-sort"
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SortId)}
              className="min-w-[168px]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            suppressHydrationWarning
            type="button"
            onClick={onOpenFilters}
            className="cw-cta cw-cta--outline inline-flex items-center justify-center gap-2 lg:hidden"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M6 12h12M10 18h4" />
            </svg>
            {customWearContent.labels.filters}
            {activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
        </div>
      </div>
    </div>
  );
};
