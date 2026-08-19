'use client';

import React from 'react';
import { CUSTOM_WEAR_FILTER_GROUPS } from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';
import { hasActiveFilters } from '@/lib/custom-wear/filters';
import type { CustomWearFilterState, MultiFilterKey } from '@/types/custom-wear';
import { CategoryFilter } from './filters/CategoryFilter';
import { CheckboxFilter, ChipFilter, SwatchFilter } from './filters/FilterControls';
import { FilterSection } from './filters/FilterSection';
import { PriceFilter } from './filters/PriceFilter';

export interface FilterSidebarProps {
  filters: CustomWearFilterState;
  priceBounds: { min: number; max: number };
  onToggleValue: (key: MultiFilterKey, value: string) => void;
  onSelectCategory: (categoryId: string | null) => void;
  onPriceChange: (min: number | null, max: number | null) => void;
  onClearAll: () => void;
  /** The drawer starts category groups collapsed to keep the sheet short. */
  compact?: boolean;
}

const CONTROLS = {
  swatch: SwatchFilter,
  chip: ChipFilter,
  checkbox: CheckboxFilter,
} as const;

/**
 * Renders the whole sidebar from `CUSTOM_WEAR_FILTER_GROUPS` — adding a filter
 * group is a config change, not a component change. Used as-is by both the
 * desktop rail and the mobile drawer.
 */
export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  priceBounds,
  onToggleValue,
  onSelectCategory,
  onPriceChange,
  onClearAll,
  compact = false,
}) => {
  const showClear = hasActiveFilters(filters);

  return (
    <div className="flex flex-col">
      {showClear && (
        <div className="flex items-center justify-between pb-3">
          <span
            style={{
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
              color: 'var(--cw-ink-subtle)',
            }}
          >
            Filters applied
          </span>
          <button
            suppressHydrationWarning
            type="button"
            onClick={onClearAll}
            className="underline transition-opacity hover:opacity-70"
            style={{
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
              fontWeight: 700,
              color: 'var(--cw-ink)',
            }}
          >
            {customWearContent.labels.clearAll}
          </button>
        </div>
      )}

      <div className="pb-4">
        <CategoryFilter
          selectedCategoryId={filters.category}
          onSelect={onSelectCategory}
          defaultExpandAll={!compact}
        />
      </div>

      {CUSTOM_WEAR_FILTER_GROUPS.map((group) => {
        const Control = CONTROLS[group.control];
        const selected = filters[group.key] as string[];
        return (
          <FilterSection
            key={group.key}
            title={group.title}
            defaultOpen={compact ? false : (group.defaultOpen ?? false)}
            activeCount={selected.length}
          >
            <Control
              options={group.options}
              selected={selected}
              onToggle={(value) => onToggleValue(group.key, value)}
              collapseAfter={group.collapseAfter}
              groupLabel={group.title}
            />
          </FilterSection>
        );
      })}

      <FilterSection
        title="Price"
        defaultOpen={!compact}
        activeCount={filters.minPrice !== null || filters.maxPrice !== null ? 1 : 0}
      >
        <PriceFilter
          bounds={priceBounds}
          minPrice={filters.minPrice}
          maxPrice={filters.maxPrice}
          onChange={onPriceChange}
        />
      </FilterSection>
    </div>
  );
};
