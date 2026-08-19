'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ProductGrid, ProductFilters, ProductFilterValues } from '@/components/product';
import { LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { CATALOG_CATEGORIES } from '@/lib/catalog';
import { Product } from '@/types';

const PAGE_SIZE = 12;

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function ProductsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const category = searchParams.get('category') ?? '';
  const search = searchParams.get('search') ?? '';
  const sortBy = searchParams.get('sortBy') ?? '';
  const minPrice = searchParams.get('minPrice') ?? '';
  const maxPrice = searchParams.get('maxPrice') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
    if (category) params.category = category;
    if (search) params.search = search;
    if (sortBy) params.sortBy = sortBy;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;

    apiClient
      .get('/products', { params })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setProducts(data?.products ?? []);
        setPagination(data?.pagination ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setProducts([]);
        setPagination(null);
        setError(getApiErrorMessage(err, 'Failed to load products.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, search, sortBy, minPrice, maxPrice, page]);

  /** Merge changed params into the URL; empty values remove the param. Resets page. */
  const updateParams = (
    changed: Partial<ProductFilterValues> & { search?: string; page?: string },
    resetPage = true
  ) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changed).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (resetPage) next.delete('page');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const pageHref = (target: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (target > 1) next.set('page', String(target));
    else next.delete('page');
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const activeCategoryName = CATALOG_CATEGORIES.find((c) => c.slug === category)?.name;
  const heading = search
    ? `Search results for "${search}"`
    : activeCategoryName ?? 'Our Products';

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-4xl font-bold">{heading}</h1>
          {!isLoading && pagination && (
            <p className="text-sm text-neutral-500">
              {pagination.total} {pagination.total === 1 ? 'product' : 'products'} found
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="md:col-span-1">
            <ProductFilters
              values={{ category, minPrice, maxPrice, sortBy }}
              onChange={(changed) => updateParams(changed)}
            />
          </div>

          {/* Products Grid */}
          <div className="md:col-span-3">
            {error ? (
              <div className="alert alert-error">
                {error}
              </div>
            ) : (
              <>
                <ProductGrid products={products} columns={3} loading={isLoading} />

                {!isLoading && products.length === 0 && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() =>
                        updateParams({
                          category: '',
                          search: '',
                          minPrice: '',
                          maxPrice: '',
                          sortBy: '',
                        })
                      }
                      className="text-sm font-medium text-primary-700 hover:underline"
                    >
                      Clear filters and browse the full catalog
                    </button>
                  </div>
                )}

                {/* Pagination */}
                {!isLoading && pagination && pagination.totalPages > 1 && (
                  <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
                    {page > 1 && (
                      <Link
                        href={pageHref(page - 1)}
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
                      >
                        Previous
                      </Link>
                    )}
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                      <Link
                        key={p}
                        href={pageHref(p)}
                        aria-current={p === page ? 'page' : undefined}
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${
                          p === page
                            ? 'bg-primary-500 text-black'
                            : 'border border-neutral-300 hover:bg-neutral-50'
                        }`}
                      >
                        {p}
                      </Link>
                    ))}
                    {page < pagination.totalPages && (
                      <Link
                        href={pageHref(page + 1)}
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
                      >
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
    </main>
  );
}

export default function ProductsCatalogPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-[50vh]" size="lg" />}>
      <ProductsContent />
    </Suspense>
  );
}
