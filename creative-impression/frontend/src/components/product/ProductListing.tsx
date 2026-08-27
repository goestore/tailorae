'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { CATALOG_CATEGORIES } from '@/lib/catalog';
import { Product } from '@/types';
import { ProductGrid } from './ProductGrid';
import { ProductFilters, ProductFilterValues, SORT_OPTIONS } from './ProductFilters';

/**
 * The API caps `limit` at 50, and the keyword narrowing below has to run on the
 * client, so the listing works from one page of at most 50 and paginates that.
 * Past 50 matches in a single section this needs real server-side paging.
 */
const FETCH_LIMIT = 50;
const PAGE_SIZE = 12;

export interface Crumb {
  label: string;
  href?: string;
}

interface ActiveFilter {
  label: string;
  /** Parameters to blank when the chip is dismissed. */
  clear: Record<string, string>;
}

export interface ListingChip {
  label: string;
  href: string;
  active?: boolean;
}

export interface ProductListingProps {
  title: string;
  crumbs?: Crumb[];
  /** Sibling-section shortcuts rendered above the results. */
  chips?: ListingChip[];
  /** Query the section is permanently scoped to, e.g. `{ category: 'mens' }`. */
  baseQuery?: Record<string, string>;
  /** Keyword narrowing for subcategories — see config/catalog.ts. */
  match?: string[];
  exclude?: string[];
  /** Server-rendered first page, so the products are in the HTML for crawlers. */
  initialProducts?: Product[];
}

/**
 * The one product listing on the site. Section pages and the full catalog both
 * render this, so sort, filters, breadcrumbs, empty states and pagination
 * behave identically wherever a shopper arrives from.
 *
 * All controls live in the URL, which makes any filtered view shareable and
 * makes the browser's back button step through filter changes.
 */
export const ProductListing: React.FC<ProductListingProps> = ({
  title,
  crumbs = [],
  chips = [],
  baseQuery,
  match,
  exclude,
  initialProducts = [],
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values: ProductFilterValues = {
    category: searchParams.get('category') ?? '',
    minPrice: searchParams.get('minPrice') ?? '',
    maxPrice: searchParams.get('maxPrice') ?? '',
    sortBy: searchParams.get('sortBy') ?? '',
    q: searchParams.get('q') ?? '',
    inStock: searchParams.get('inStock') ?? '',
    onSale: searchParams.get('onSale') ?? '',
  };
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [fetched, setFetched] = useState<Product[]>(initialProducts);
  // Start loading when there is nothing to show yet, so the first paint is a
  // skeleton. Starting at false rendered "Nothing matches those filters" for
  // the moment before the effect fired — an empty state on a page that had not
  // asked the API anything yet.
  const [isLoading, setIsLoading] = useState(initialProducts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The server already rendered an unfiltered first page; don't immediately
  // re-request it on mount and flash a skeleton over identical content.
  const hasParams = Array.from(searchParams.keys()).length > 0;
  const skipFirstFetch = useRef(initialProducts.length > 0 && !hasParams);

  const queryKey = JSON.stringify([baseQuery, values]);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params: Record<string, string | number> = { limit: FETCH_LIMIT, ...baseQuery };
    if (values.category && !baseQuery?.category) params.category = values.category;
    if (values.q) params.search = values.q;
    if (values.sortBy) params.sortBy = values.sortBy;
    if (values.minPrice) params.minPrice = values.minPrice;
    if (values.maxPrice) params.maxPrice = values.maxPrice;
    if (values.onSale === '1') params.onSale = 'true';

    apiClient
      .get('/products', { params })
      .then((res) => {
        if (cancelled) return;
        setFetched(res.data?.data?.products ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetched([]);
        setError(getApiErrorMessage(err, 'Failed to load products.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  /**
   * Narrowing the API cannot express: subcategory keywords (a kurti is a tunic)
   * and stock, which is not a query parameter.
   */
  const results = useMemo(() => {
    let list = fetched;

    if (match) {
      list = list.filter((product) => {
        const name = product.name.toLowerCase();
        return (
          match.some((term) => name.includes(term)) &&
          !(exclude ?? []).some((term) => name.includes(term))
        );
      });
    }

    if (values.inStock === '1') list = list.filter((product) => product.quantity > 0);

    return list;
  }, [fetched, match, exclude, values.inStock]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  /** Merge changes into the URL; an empty value drops the parameter. */
  const updateParams = (changed: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changed).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (resetPage) next.delete('page');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const pageHref = (target: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (target > 1) next.set('page', String(target));
    else next.delete('page');
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const categoryName = CATALOG_CATEGORIES.find((c) => c.slug === values.category)?.name;

  /**
   * A price band writes both minPrice and maxPrice, so it reads back as one
   * chip that clears both — two chips for one click would be confusing.
   */
  const priceLabel = (() => {
    const { minPrice: min, maxPrice: max } = values;
    if (!min && !max) return null;
    if (min && max) return `₹${min} – ₹${max}`;
    return max ? `Under ₹${max}` : `₹${min} and above`;
  })();

  /** One dismissible chip per active refinement. */
  const showCategoryChip = !baseQuery?.category && Boolean(values.category);
  const filterCandidates: (ActiveFilter | null)[] = [
    values.q ? { label: `“${values.q}”`, clear: { q: '' } } : null,
    showCategoryChip
      ? { label: categoryName ?? values.category ?? '', clear: { category: '' } }
      : null,
    priceLabel ? { label: priceLabel, clear: { minPrice: '', maxPrice: '' } } : null,
    values.inStock === '1' ? { label: 'In stock', clear: { inStock: '' } } : null,
    values.onSale === '1' ? { label: 'On sale', clear: { onSale: '' } } : null,
  ];
  const activeFilters = filterCandidates.filter((entry): entry is ActiveFilter => entry !== null);

  const clearAll = () =>
    updateParams({
      category: '',
      minPrice: '',
      maxPrice: '',
      sortBy: '',
      q: '',
      inStock: '',
      onSale: '',
    });

  const filterPanel = (
    <ProductFilters
      values={values}
      onChange={(changed) => updateParams(changed)}
      showCategories={!baseQuery?.category}
    />
  );

  return (
    <div className="section-y">
      <div className="container-max">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-ink-3">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((crumb, index) => (
                <li key={crumb.label} className="flex items-center gap-1.5">
                  {index > 0 && <span aria-hidden="true">/</span>}
                  {crumb.href ? (
                    <Link href={crumb.href} className="transition-colors hover:text-ink">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-ink">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* One header row: title, sibling links and the result controls. Each of
            these had its own full-width band before, which pushed the first
            product about 200px down the page for three short elements. They wrap
            onto further lines only when the viewport actually needs it.

            The section blurb is deliberately not rendered — it repeats the
            heading, and still feeds the page's meta description. */}
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line pb-3">
          <h1 className="heading-rule">{title}</h1>

          {/* The strip scrolls rather than wraps. Wrapping meant every section
              added to config/catalog.ts grew the header by another line and
              pushed the products further down; scrolling holds it at one line
              no matter how many there are. `min-w-0` is what lets a flex child
              shrink below its content and actually scroll. */}
          {chips.length > 0 && (
            <div className="order-3 w-full min-w-0 overflow-x-auto scrollbar-hide lg:order-none lg:w-auto lg:flex-1">
              <div className="flex w-max gap-1.5">
                {chips.map((chip) => (
                  <Link
                    key={chip.href}
                    href={chip.href}
                    aria-current={chip.active ? 'page' : undefined}
                    className={`whitespace-nowrap border px-2.5 py-1 text-[12px] font-medium no-underline transition-colors ${
                      chip.active
                        ? 'border-ink bg-ink text-white'
                        : 'border-line text-ink-2 hover:border-ink hover:text-ink'
                    }`}
                  >
                    {chip.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p className="ml-auto text-[13px] text-ink-3">
            {isLoading
              ? 'Loading…'
              : `${results.length} ${results.length === 1 ? 'product' : 'products'}`}
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const input = new FormData(event.currentTarget).get('q');
              updateParams({ q: String(input ?? '').trim() });
            }}
            className="order-last w-full sm:order-none sm:w-auto"
          >
            <input
              name="q"
              type="search"
              defaultValue={values.q}
              placeholder="Search these products"
              aria-label="Search within results"
              className="h-9 w-full text-[13px] sm:w-48"
            />
          </form>

          <label className="flex items-center gap-2 text-[13px] text-ink-3">
            <span className="hidden sm:inline">Sort</span>
            <select
              value={values.sortBy || 'newest'}
              onChange={(event) => updateParams({ sortBy: event.target.value })}
              aria-label="Sort products"
              className="h-9 w-auto text-[13px]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="btn btn-outline btn-sm lg:hidden"
          >
            Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ''}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24">{filterPanel}</div>
          </aside>

          <div>
            {filtersOpen && (
              <div className="mb-4 border border-line p-4 lg:hidden">{filterPanel}</div>
            )}

            {activeFilters.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {activeFilters.map((filter) => (
                  <button
                    key={filter.label}
                    type="button"
                    onClick={() => updateParams(filter.clear)}
                    className="inline-flex items-center gap-1.5 border border-line px-3 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
                    aria-label={`Remove filter ${filter.label}`}
                  >
                    {filter.label}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[13px] font-medium text-ink-3 underline transition-colors hover:text-ink"
                >
                  Clear all
                </button>
              </div>
            )}

            {error ? (
              <div className="alert alert-error">{error}</div>
            ) : (
              <>
                <ProductGrid products={visible} columns={4} loading={isLoading} />

                {!isLoading && results.length === 0 && (
                  <div className="border-t border-line py-16 text-center">
                    <p className="text-ink">Nothing matches those filters.</p>
                    <p className="mt-2 text-[13px] text-ink-3">
                      Try widening the price range or clearing a filter.
                    </p>
                    {activeFilters.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAll}
                        className="btn btn-primary btn-sm mt-6"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                )}

                {!isLoading && totalPages > 1 && (
                  <nav
                    className="mt-8 flex flex-wrap items-center justify-center gap-2"
                    aria-label="Pagination"
                  >
                    {currentPage > 1 && (
                      <Link href={pageHref(currentPage - 1)} className="btn btn-outline btn-sm">
                        Previous
                      </Link>
                    )}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((target) => (
                      <Link
                        key={target}
                        href={pageHref(target)}
                        aria-current={target === currentPage ? 'page' : undefined}
                        className={`btn btn-sm ${target === currentPage ? 'btn-secondary' : 'btn-outline'}`}
                      >
                        {target}
                      </Link>
                    ))}
                    {currentPage < totalPages && (
                      <Link href={pageHref(currentPage + 1)} className="btn btn-outline btn-sm">
                        Next
                      </Link>
                    )}
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
