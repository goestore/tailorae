'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getApiErrorMessage } from '@/lib/api-utils';
import { CATALOG_CATEGORIES } from '@/lib/catalog';
import {
  getBrands,
  getColors,
  getFacets,
  getProductsPage,
  parseColourParam,
  type ColourFacet,
  type Facets,
} from '@/lib/products-api';
import { Brand, Product } from '@/types';
import { ProductGrid } from './ProductGrid';
import { ProductFilters, ProductFilterValues, SORT_OPTIONS } from './ProductFilters';

/**
 * Every refinement — including the subcategory keywords and stock — is now
 * applied by the API, so one page is a real page of the whole match set and
 * the count above the grid describes the catalogue rather than one fetch.
 * Pages accumulate behind a Load more button, the way 9impression's shop does.
 */
const PAGE_SIZE = 24;

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
  /**
   * True when `initialProducts` was fetched using the page's search params, not
   * just its base scope. The server and the client then agree on what is on
   * screen, so the first fetch can be skipped whatever the params say.
   *
   * False (the default) means the server rendered the section's unfiltered
   * first page, and an arrival carrying filters must still fetch.
   */
  initialReflectsParams?: boolean;
  /**
   * Total the server's filter set matched. Without it the listing would take
   * the first page for the whole catalogue and never offer Load more.
   */
  initialTotal?: number;
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
  initialTotal,
  initialReflectsParams = false,
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
    color: searchParams.get('color') ?? '',
    brand: searchParams.get('brand') ?? '',
    inStock: searchParams.get('inStock') ?? '',
    onSale: searchParams.get('onSale') ?? '',
    size: searchParams.get('size') ?? '',
    ageGroup: searchParams.get('ageGroup') ?? '',
  };
  // Template attribute facets ride along as attr_<key> (attr_upperMaterial).
  const attributeFilters: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith('attr_') && value) {
      values[key] = value;
      attributeFilters[key.slice(5)] = value;
    }
  });

  const [fetched, setFetched] = useState<Product[]>(initialProducts);
  const [total, setTotal] = useState(initialTotal ?? initialProducts.length);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [colorFacets, setColorFacets] = useState<ColourFacet[]>([]);
  const [brandFacets, setBrandFacets] = useState<Brand[]>([]);
  const [facets, setFacets] = useState<Facets>({ sizes: [], ageGroups: [] });
  // Start loading when there is nothing to show yet, so the first paint is a
  // skeleton. Starting at false rendered "Nothing matches those filters" for
  // the moment before the effect fired — an empty state on a page that had not
  // asked the API anything yet.
  const [isLoading, setIsLoading] = useState(initialProducts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The server already rendered the first page; don't immediately re-request it
  // on mount and flash a skeleton over identical content. When the server did
  // not take the params into account, an arrival carrying any still has to
  // fetch — otherwise a shared filtered link would show the unfiltered grid.
  const hasParams = Array.from(searchParams.keys()).length > 0;
  const skipFirstFetch = useRef(
    initialProducts.length > 0 && (initialReflectsParams || !hasParams)
  );

  /**
   * The filter set sent to the API. `baseQuery` is the section's permanent
   * scope, so it wins over anything the shopper could set — a men's section
   * cannot be filtered into womenswear.
   */
  const serverFilters = {
    category: baseQuery?.category || values.category || undefined,
    // A section can declare its own default order (new arrivals is newest
    // first); an explicit choice by the shopper still wins over it.
    sortBy: values.sortBy || baseQuery?.sortBy || undefined,
    q: values.q || undefined,
    color: values.color || undefined,
    brand: baseQuery?.brand || values.brand || undefined,
    vendor: baseQuery?.vendor || undefined,
    minPrice: values.minPrice ? Number(values.minPrice) : undefined,
    maxPrice: values.maxPrice ? Number(values.maxPrice) : undefined,
    sale: values.onSale === '1' || baseQuery?.onSale === 'true',
    newest: baseQuery?.newest === 'true',
    inStock: values.inStock === '1',
    size: values.size || undefined,
    ageGroup: values.ageGroup || undefined,
    audience: baseQuery?.audience || undefined,
    attributes: attributeFilters,
    match,
    exclude,
  };

  const queryKey = JSON.stringify([baseQuery, values, match, exclude]);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getProductsPage({ ...serverFilters, page: 1, limit: PAGE_SIZE })
      .then(({ products, total: matched }) => {
        if (cancelled) return;
        setFetched(products);
        setTotal(matched);
        setPage(1);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetched([]);
        setTotal(0);
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

  // Colour families present in this category. They do not depend on the other
  // filters, so they are read once per category; a failure just hides the group.
  const colourCategory = baseQuery?.category || values.category || '';
  useEffect(() => {
    let cancelled = false;
    getColors(colourCategory || undefined)
      .then((list) => {
        if (!cancelled) setColorFacets(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [colourCategory]);

  useEffect(() => {
    let cancelled = false;
    getBrands()
      .then((list) => {
        if (!cancelled) setBrandFacets(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Sizes and age groups depend on the category: the Kids page offers baby and
  // kids sizes, not the whole chart.
  const facetCategory = serverFilters.category;
  useEffect(() => {
    let cancelled = false;
    getFacets(facetCategory)
      .then((next) => {
        if (!cancelled) setFacets(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [facetCategory]);

  /** Append the next page rather than replacing what is already on screen. */
  const loadMore = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const next = page + 1;
      const { products } = await getProductsPage({
        ...serverFilters,
        page: next,
        limit: PAGE_SIZE,
      });
      setFetched((current) => [...current, ...products]);
      setPage(next);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load more products.'));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const results = fetched;

  /** Merge changes into the URL; an empty value drops the parameter. */
  const updateParams = (changed: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changed).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    // Paging is now "load more" rather than numbered pages, so a stale `page`
    // in the URL would mean nothing. Dropped whenever a filter changes.
    next.delete('page');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
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
    // One chip per chosen colour family, each removable on its own.
    ...parseColourParam(values.color).map((slug) => ({
      label: colorFacets.find((f) => f.slug === slug)?.name ?? slug,
      clear: {
        color: parseColourParam(values.color)
          .filter((s) => s !== slug)
          .join(','),
      },
    })),
    values.size
      ? { label: `${facets.optionLabel ?? 'Size'} ${values.size}`, clear: { size: '' } }
      : null,
    ...Object.entries(attributeFilters).map(([key, value]) => ({
      label: `${facets.attributes?.find((a) => a.key === key)?.label ?? key}: ${value}`,
      clear: { [`attr_${key}`]: '' },
    })),
    values.ageGroup
      ? {
          label: facets.ageGroups.find((a) => a.value === values.ageGroup)?.label ?? values.ageGroup,
          clear: { ageGroup: '' },
        }
      : null,
    values.brand && !baseQuery?.brand
      ? {
          label: brandFacets.find((b) => b.slug === values.brand)?.name ?? values.brand,
          clear: { brand: '' },
        }
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
      color: '',
      brand: '',
      inStock: '',
      onSale: '',
      size: '',
      ageGroup: '',
      ...Object.fromEntries(Object.keys(attributeFilters).map((key) => [`attr_${key}`, ''])),
    });

  const filterPanel = (
    <ProductFilters
      values={values}
      onChange={(changed) => updateParams(changed)}
      showCategories={!baseQuery?.category}
      colors={colorFacets}
      brands={baseQuery?.brand ? [] : brandFacets}
      facets={baseQuery?.audience ? { ...facets, ageGroups: [] } : facets}
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
                        ? 'border-[var(--brand)] bg-[var(--brand)] font-semibold text-ink'
                        : 'border-line text-ink-2 hover:border-ink hover:text-ink'
                    }`}
                  >
                    {chip.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* The total the filters match, not the number fetched so far. */}
          <p className="ml-auto text-[13px] text-ink-3">
            {isLoading ? 'Loading…' : `${total} ${total === 1 ? 'product' : 'products'}`}
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
                <ProductGrid
                  products={results}
                  columns={4}
                  loading={isLoading}
                  selectedColor={values.color}
                />

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

                {!isLoading && results.length < total && (
                  <div className="mt-10 flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="btn btn-outline btn-lg"
                    >
                      {isLoadingMore ? 'Loading…' : 'Load more'}
                    </button>
                    <p className="m-0 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                      Showing {results.length} of {total}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
