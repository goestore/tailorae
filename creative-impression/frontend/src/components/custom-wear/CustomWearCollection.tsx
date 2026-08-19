'use client';

import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { buildActiveChips, countActiveFilters } from '@/lib/custom-wear/filters';
import { useCustomWearFilters } from '@/hooks/useCustomWearFilters';
import { hydrateWishlist } from '@/store/slices/customWear';
import type { HeroContent } from '@/config/custom-wear/content';
import type { CustomWearFilterState, ProductQueryResult, PurchaseMode } from '@/types/custom-wear';
import { ActiveFilterChips } from './ActiveFilterChips';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { CustomWearHero } from './CustomWearHero';
import { CustomWearToolbar } from './CustomWearToolbar';
import { FilterSidebar } from './FilterSidebar';
import { MobileFilterDrawer } from './MobileFilterDrawer';
import { Pagination } from './Pagination';
import { ProductGrid } from './ProductGrid';

export interface CustomWearCollectionProps {
  /** Computed on the server from the same query string the client parses. */
  result: ProductQueryResult;
  /** Filters implied by the route (kept out of the query string). */
  defaults?: Partial<CustomWearFilterState>;
  heading: string;
  description?: string;
  heroContent?: Partial<HeroContent>;
  breadcrumbs: Crumb[];
}

/**
 * Client shell for the collection page.
 *
 * Filtering is URL-driven: every control writes to the query string, the server
 * component re-runs the query, and this component renders the result it is
 * handed. That keeps the heavy work off the client and makes every view
 * shareable.
 */
export const CustomWearCollection: React.FC<CustomWearCollectionProps> = ({
  result,
  defaults = {},
  heading,
  description,
  heroContent,
  breadcrumbs,
}) => {
  const dispatch = useDispatch();
  const {
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
  } = useCustomWearFilters({ defaults });

  const [isDrawerOpen, setDrawerOpen] = useState(false);

  /**
   * Mode is mirrored locally so the toggle responds instantly; the URL update
   * follows. Re-syncing during render (rather than in an effect) keeps
   * back/forward navigation correct without a second paint.
   */
  const [mode, setLocalMode] = useState<PurchaseMode>(filters.mode);
  const [urlMode, setUrlMode] = useState<PurchaseMode>(filters.mode);
  if (urlMode !== filters.mode) {
    setUrlMode(filters.mode);
    setLocalMode(filters.mode);
  }

  useEffect(() => {
    dispatch(hydrateWishlist());
  }, [dispatch]);

  const handleModeChange = (next: PurchaseMode) => {
    setLocalMode(next);
    setMode(next);
  };

  const chips = buildActiveChips(filters);
  const activeFilterCount = countActiveFilters(filters);

  const rangeStart = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const rangeEnd = Math.min(result.page * result.pageSize, result.total);

  const sidebarProps = {
    filters,
    priceBounds: result.priceBounds,
    onToggleValue: toggleValue,
    onSelectCategory: setCategory,
    onPriceChange: setPriceRange,
    onClearAll: clearAll,
  };

  return (
    <>
      <CustomWearHero mode={mode} onModeChange={handleModeChange} content={heroContent} />

      <div
        className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-10"
        style={{ maxWidth: 'var(--cw-content-max)' }}
      >
        <Breadcrumbs items={breadcrumbs} className="mb-5" />

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <aside
            className="hidden flex-shrink-0 lg:block"
            style={{ width: 'var(--cw-sidebar-width)' }}
            aria-label="Product filters"
          >
            <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
              <FilterSidebar {...sidebarProps} />
            </div>
          </aside>

          {/* Results */}
          <div className="min-w-0 flex-1">
            <CustomWearToolbar
              heading={heading}
              description={description}
              total={result.total}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              search={filters.search}
              sort={filters.sort}
              activeFilterCount={activeFilterCount}
              onSearchChange={setSearch}
              onSortChange={setSort}
              onOpenFilters={() => setDrawerOpen(true)}
              isPending={isPending}
            />

            {chips.length > 0 && (
              <div className="mt-5">
                <ActiveFilterChips chips={chips} onRemove={clearChip} onClearAll={clearAll} />
              </div>
            )}

            <div className="mt-6">
              <ProductGrid
                products={result.products}
                mode={mode}
                isPending={isPending}
                onClearFilters={clearAll}
              />
            </div>

            {result.pageCount > 1 && (
              <div className="mt-10">
                <Pagination
                  page={result.page}
                  pageCount={result.pageCount}
                  onChange={(page) => {
                    setPage(page);
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <MobileFilterDrawer
        {...sidebarProps}
        isOpen={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        resultCount={result.total}
      />
    </>
  );
};
