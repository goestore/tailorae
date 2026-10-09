'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, LoadingSpinner } from '@/components/common';
import { ProductThumb } from '@/components/product';
import { getSellerProducts, updateSellerProduct, type SellerProduct } from '@/lib/seller-api';
import { formatCurrency } from '@/utils/helpers';
import { RootState } from '@/store';

/**
 * A seller's own catalogue.
 *
 * Shows drafts and discontinued listings as well as live ones — this is the
 * seller's working view, not the shop page, and a product missing from the
 * storefront is exactly what they need to be able to find.
 *
 * Stock and visibility are changed from the table rather than by opening each
 * listing: restocking after a delivery and taking a run of things live are what
 * a seller does here most often, and neither is worth a page each. Both save
 * through the public `PUT /api/products/:id`, which admits a VENDOR and refuses
 * anything that is not their own; the links used to point into the admin
 * console, which is admin-only and answered 403.
 */

/** What the quick action does next, given where a listing is now. */
const NEXT_VISIBILITY: Record<string, { status: 'ACTIVE' | 'INACTIVE'; label: string }> = {
  DRAFT: { status: 'ACTIVE', label: 'Put live' },
  INACTIVE: { status: 'ACTIVE', label: 'Put live' },
  DISCONTINUED: { status: 'ACTIVE', label: 'Relist' },
  ACTIVE: { status: 'INACTIVE', label: 'Hide' },
};

export default function SellerProductsPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Only the stock cells that have been typed in are held here; the rest read
   * straight off the product. Seeding this from the fetched rows would mean
   * copying server state into component state and then keeping the two in step.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/seller/products');
  }, [isInitialized, user, router]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      getSellerProducts()
        .then((rows) => {
          setProducts(rows);
          setDrafts({});
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const saveStock = async (product: SellerProduct) => {
    const raw = drafts[product.id] ?? '';
    const quantity = raw.trim() === '' ? 0 : Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error('Stock has to be a whole number.');
      return;
    }

    setBusyId(product.id);
    try {
      await updateSellerProduct(product.id, { quantity });
      toast.success(`${product.name} — stock set to ${quantity}.`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      // Cleared whatever happened: leaving it set outlives the request and
      // disables the row's other action until the page is reloaded.
      setBusyId(null);
    }
  };

  const setVisibility = async (product: SellerProduct) => {
    const next = NEXT_VISIBILITY[product.status];
    if (!next) return;

    setBusyId(product.id);
    try {
      await updateSellerProduct(product.id, { status: next.status });
      toast.success(
        next.status !== 'ACTIVE'
          ? `${product.name} is hidden.`
          : product.moderationStatus === 'APPROVED'
            ? `${product.name} is live.`
            : `${product.name} will go live once our team approves it.`
      );
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Sell', href: '/seller' },
            { label: 'Products' },
          ]}
        />

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1
              className="m-0 text-ink"
              style={{
                fontSize: 'clamp(26px, 3.6vw, 38px)',
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              My products
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              {products.length} {products.length === 1 ? 'listing' : 'listings'}, live or not.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/seller/products/new" className="btn btn-primary btn-sm">
              List a product
            </Link>
            <Link href="/seller" className="btn btn-outline btn-sm">
              Back to dashboard
            </Link>
          </div>
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        {products.length === 0 ? (
          <div className="mt-10 border border-line bg-surface-2 px-6 py-14 text-center">
            <p className="m-0 text-lg text-ink">Nothing listed yet</p>
            <p className="mx-auto mt-2 max-w-[46ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Add your first product and it will appear here.
            </p>
            <Link href="/seller/products/new" className="btn btn-primary mt-6">
              List a product
            </Link>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
                  {['Product', 'SKU', 'Price', 'Stock', 'Status', ''].map((head) => (
                    <th
                      key={head}
                      scope="col"
                      className="py-3 pr-4 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const draft = drafts[product.id];
                  const stockDirty = draft !== undefined && draft !== String(product.quantity);
                  const next = NEXT_VISIBILITY[product.status];

                  return (
                    <tr key={product.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <ProductThumb
                            src={product.thumbnail}
                            alt={product.name}
                            className="h-10 w-10 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/seller/products/${product.id}`}
                              className="m-0 block truncate text-[14px] font-medium text-ink hover:underline"
                            >
                              {product.name}
                            </Link>
                            <p className="m-0 text-[12px]" style={{ color: 'var(--ink-3)' }}>
                              {[product.brand?.name, product.category?.name]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td
                        className="py-3 pr-4 font-mono text-[12px]"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        {product.sku}
                      </td>
                      <td className="py-3 pr-4 text-[13.5px] text-ink">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          min={0}
                          step="1"
                          inputMode="numeric"
                          aria-label={`Stock for ${product.name}`}
                          value={draft ?? String(product.quantity)}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [product.id]: event.target.value,
                            }))
                          }
                          className="w-[80px] rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[13.5px] text-black focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          style={
                            product.quantity > 0 ? undefined : { borderColor: 'var(--sale)' }
                          }
                        />
                      </td>
                      <td className="py-3 pr-4 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                        {product.status.toLowerCase()}
                        {product.moderationStatus === 'PENDING' && (
                          <span
                            className="mt-1 block w-fit px-1.5 py-0.5 text-[11px] font-semibold"
                            style={{ background: 'var(--brand-soft)', color: 'var(--ink)' }}
                          >
                            In review
                          </span>
                        )}
                        {product.moderationStatus === 'REJECTED' && (
                          <span className="mt-1 block max-w-[220px] text-[11.5px]" style={{ color: 'var(--sale)' }}>
                            <strong>Needs changes:</strong> {product.moderationNote}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-3 text-[13px]">
                          {stockDirty ? (
                            <button
                              type="button"
                              onClick={() => saveStock(product)}
                              disabled={busyId === product.id}
                              className="font-semibold text-ink underline underline-offset-2 disabled:opacity-40"
                            >
                              Save stock
                            </button>
                          ) : (
                            <>
                              <Link
                                href={`/seller/products/${product.id}`}
                                className="underline underline-offset-2"
                                style={{ color: 'var(--ink-3)' }}
                              >
                                Edit
                              </Link>
                              {next && (
                                <button
                                  type="button"
                                  onClick={() => setVisibility(product)}
                                  disabled={busyId === product.id}
                                  className="underline underline-offset-2 disabled:opacity-40"
                                  style={{ color: 'var(--ink-3)' }}
                                >
                                  {next.label}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
