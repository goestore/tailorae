'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  createCategory,
  discontinueProduct,
  formatMoney,
  listCategories,
  listProducts,
  setFeatured,
  slugify,
  type AdminCategory,
  type AdminProduct,
} from '@/lib/admin-products';
import { cn } from '@/utils/helpers';
import { LABEL_VOICE } from './ContentField';

/**
 * The catalog listing — every product, with the actions that do not need the
 * full form: publish state, featured flag, discontinuing.
 *
 * Search runs on the server, so it reaches the whole catalog rather than
 * filtering the page that happens to be loaded. Counts are of the loaded page
 * and say so; a number that silently means "of the first 20" is worse than no
 * number.
 */

const previewable = (value: string): boolean => value !== '' && /^[^"'()\s]+$/.test(value);

const Thumb: React.FC<{ product: AdminProduct }> = ({ product }) => {
  const url = Array.isArray(product.images) ? product.images[0] : undefined;
  return (
    <span
      aria-hidden="true"
      className="block h-12 w-12 shrink-0 border border-line bg-surface-2 bg-cover bg-center"
      style={url && previewable(url) ? { backgroundImage: `url("${url}")` } : undefined}
    />
  );
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-primary-500 text-ink',
  DRAFT: 'border border-line-strong text-ink-3',
  INACTIVE: 'border border-line-strong text-ink-3',
  DISCONTINUED: 'border border-line-strong text-ink-3',
};

const TAG = 'inline-flex items-center px-1.5 py-[2px] text-[10px] font-bold uppercase leading-none tracking-[0.08em]';

export const ProductList: React.FC = () => {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  /**
   * Fetches a page. Deliberately touches no state before its first await, so
   * the mount effect below can call it without a synchronous setState — the
   * spinner is already showing because `loading` starts true.
   */
  const fetchPage = useCallback(async (nextPage: number, term: string) => {
    try {
      const result = await listProducts({ search: term || undefined, page: nextPage, limit: 20 });
      setError(null);
      setProducts(result.products);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
      setPage(result.pagination.page);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /** What every button calls: same fetch, plus the spinner. */
  const load = useCallback(
    (nextPage: number, term: string) => {
      setLoading(true);
      return fetchPage(nextPage, term);
    },
    [fetchPage]
  );

  /** Same shape as fetchPage: nothing set until after the await. */
  const loadCategories = useCallback(async () => {
    try {
      setCategories(await listCategories());
    } catch {
      // The product form surfaces this properly; here it only dims a count.
    }
  }, []);

  /*
   * The catalog lives behind an admin-only endpoint, so it cannot be read
   * during the server render, and there is no user action to hang the first
   * fetch on — arriving at the page is the event. Both calls set state only
   * after their await; the rule flags the reachable setState in `finally` and
   * cannot tell this apart from a cascading-render mistake.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(1, '');
    void loadCategories();
  }, [fetchPage, loadCategories]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setApplied(search.trim());
    void load(1, search.trim());
  };

  const toggleFeatured = async (product: AdminProduct) => {
    setBusyId(product.id);
    setError(null);
    try {
      await setFeatured(product.id, !product.isFeatured);
      setProducts((current) =>
        current.map((entry) =>
          entry.id === product.id ? { ...entry, isFeatured: !product.isFeatured } : entry
        )
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (product: AdminProduct) => {
    setBusyId(product.id);
    setError(null);
    try {
      await discontinueProduct(product.id);
      setConfirming(null);
      await load(page, applied);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (name === '' || addingCategory) return;
    setAddingCategory(true);
    setError(null);
    try {
      const created = await createCategory({ name, slug: slugify(name) });
      setCategories((current) => [...current, created]);
      setNewCategory('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAddingCategory(false);
    }
  };

  const live = products.filter((product) => product.status === 'ACTIVE').length;
  const hidden = products.length - live;
  const outOfStock = products.filter((product) => (product.quantity ?? 0) <= 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2">
          <span className="flex flex-col gap-1.5">
            <label htmlFor="product-search" className={LABEL_VOICE}>
              Search
            </label>
            <input
              id="product-search"
              type="search"
              value={search}
              placeholder="Name, SKU or slug"
              className="text-sm"
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
          <button type="submit" className="btn btn-sm btn-outline">
            Search
          </button>
          {applied !== '' && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setSearch('');
                setApplied('');
                void load(1, '');
              }}
            >
              Clear
            </button>
          )}
        </form>

        <Link href="/admin/products/new" className="btn btn-sm btn-primary">
          Add product
        </Link>
      </div>

      {error && (
        <p role="alert" className="alert alert-error text-sm">
          {error}
        </p>
      )}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
        <span>
          <strong className="text-ink">{total}</strong> product{total === 1 ? '' : 's'}
          {applied !== '' && <> matching “{applied}”</>}
        </span>
        {products.length > 0 && (
          <span className={LABEL_VOICE}>
            on this page: {live} live · {hidden} hidden · {outOfStock} out of stock
          </span>
        )}
      </p>

      {loading && <p className="text-sm text-ink-3">Loading the catalog…</p>}

      {!loading && products.length === 0 && (
        <div className="border border-dashed border-line-strong bg-surface-2 p-6 text-center">
          <p className="text-sm text-ink-2">
            {applied !== '' ? 'No products match that search.' : 'No products yet.'}
          </p>
          {applied === '' && (
            <Link href="/admin/products/new" className="btn btn-sm btn-primary mt-3">
              Add your first product
            </Link>
          )}
        </div>
      )}

      {products.length > 0 && (
        <ul className="flex flex-col gap-2">
          {products.map((product) => {
            const busy = busyId === product.id;
            return (
              <li key={product.id} className="border border-line bg-surface">
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <Thumb product={product} />

                  <span className="flex min-w-0 flex-[2_1_16rem] flex-col">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="truncate text-sm font-semibold text-ink hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className={cn(LABEL_VOICE, 'truncate')}>
                      {product.sku} · {product.category?.name ?? 'Uncategorised'}
                    </span>
                  </span>

                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm text-ink">{formatMoney(product.price)}</span>
                    {product.originalPrice !== null &&
                      product.originalPrice > product.price && (
                        <span className={cn(LABEL_VOICE, 'line-through')}>
                          {formatMoney(product.originalPrice)}
                        </span>
                      )}
                  </span>

                  <span className="flex min-w-0 flex-col">
                    <span
                      className={cn(
                        'text-sm',
                        (product.quantity ?? 0) <= 0 ? 'text-red-600' : 'text-ink-2'
                      )}
                    >
                      {(product.quantity ?? 0) <= 0 ? 'Out of stock' : `${product.quantity} in stock`}
                    </span>
                  </span>

                  <span className={cn(TAG, STATUS_TONE[product.status] ?? STATUS_TONE.DRAFT)}>
                    {product.status}
                  </span>

                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-ink-2">
                      <input
                        type="checkbox"
                        checked={product.isFeatured}
                        disabled={busy}
                        className="h-4 w-4 accent-[var(--brand)]"
                        onChange={() => void toggleFeatured(product)}
                      />
                      Featured
                    </label>

                    <Link
                      href={`/admin/products/${product.id}`}
                      className="btn btn-sm btn-outline"
                    >
                      Edit
                    </Link>

                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busy}
                      onClick={() => setConfirming(product.id)}
                    >
                      Discontinue
                    </button>
                  </span>
                </div>

                {confirming === product.id && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-3 py-2.5">
                    <p className="text-sm text-ink">
                      Discontinue “{product.name}”? It leaves the shop but stays in the catalog
                      and in past orders, and can be set back to ACTIVE.
                    </p>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setConfirming(null)}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => void remove(product)}
                      >
                        {busy ? 'Working…' : 'Discontinue'}
                      </button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1, applied)}
          >
            Previous
          </button>
          <span className={LABEL_VOICE}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={page >= totalPages || loading}
            onClick={() => void load(page + 1, applied)}
          >
            Next
          </button>
        </div>
      )}

      <section className="border border-line bg-surface">
        <header className="border-b border-line bg-surface-2 px-4 py-2.5">
          <h2 className={cn(LABEL_VOICE, 'text-ink')}>Categories</h2>
        </header>
        <div className="flex flex-col gap-3 p-4">
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id} className={cn(TAG, 'border border-line-strong text-ink-2')}>
                {category.name}
                {category._count && <> · {category._count.products}</>}
              </li>
            ))}
            {categories.length === 0 && <li className="text-sm text-ink-3">None yet.</li>}
          </ul>

          <div className="flex flex-wrap items-end gap-2">
            <span className="flex flex-col gap-1.5">
              <label htmlFor="new-category" className={LABEL_VOICE}>
                New category
              </label>
              <input
                id="new-category"
                type="text"
                value={newCategory}
                placeholder="Accessories"
                className="text-sm"
                onChange={(event) => setNewCategory(event.target.value)}
              />
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={addingCategory || newCategory.trim() === ''}
              onClick={() => void addCategory()}
            >
              {addingCategory ? 'Adding…' : 'Add category'}
            </button>
            {newCategory.trim() !== '' && (
              <span className={LABEL_VOICE}>URL: /{slugify(newCategory)}</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
