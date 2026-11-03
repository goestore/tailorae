'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { LoadingSpinner } from '@/components/common';
import { ListingForm } from '@/components/catalog/listing-form';
import { useSeller } from '@/components/seller/SellerContext';
import { discontinueSellerProduct, getSellerProduct, type SellerProductDetail } from '@/lib/seller-api';
import { NoShopYet, NotForRole, Notice, sellingClosedText } from '../../_components/ui';

/**
 * Editing one of the seller's own listings.
 *
 * Read and saved through `/seller/products/:id`, which answers 404 rather than
 * 403 for a listing belonging to another shop, so ids cannot be probed. The
 * public product route is no use here: it hides anything not live, which is
 * the state of every draft its own author most needs to open.
 */
export default function EditSellerProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { me, can } = useSeller();
  const shop = me?.shop ?? null;
  const allowed = Boolean(shop) && can('CATALOG');

  const [product, setProduct] = useState<SellerProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getSellerProduct(id)
        .then((row) => {
          setProduct(row);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    [id]
  );

  useEffect(() => {
    if (allowed && id) void load();
  }, [allowed, id, load]);

  if (!shop) return <NoShopYet />;
  if (!can('CATALOG')) return <NotForRole what="the catalogue" />;
  if (isLoading) return <LoadingSpinner className="min-h-[50vh]" size="lg" />;

  const canSell = shop.status === 'APPROVED';

  const discontinue = async () => {
    if (!product) return;
    if (!window.confirm(`Take ${product.name} off the shop? It stays in past orders.`)) return;
    setIsRemoving(true);
    try {
      await discontinueSellerProduct(product.id);
      toast.success(`${product.name} taken off the shop.`);
      router.push('/seller/products');
    } catch (err) {
      toast.error((err as Error).message);
      setIsRemoving(false);
    }
  };

  if (!product) {
    return (
      <main className="section-y">
        <div className="container-max">
          {error && <p className="alert alert-error text-sm">{error}</p>}
          <p className="mt-4 text-[15px]" style={{ color: 'var(--ink-2)' }}>
            That listing is not one of yours, or it no longer exists.{' '}
            <Link href="/seller/products" className="underline underline-offset-2">
              Back to your products
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  const live = product.status === 'ACTIVE' && product.moderationStatus === 'APPROVED';

  return (
    <main className="section-y">
      <div className="container-max">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div className="min-w-0">
            <h1
              className="m-0 truncate text-ink"
              style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', lineHeight: 1.05, letterSpacing: '-0.03em' }}
            >
              {product.name}
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              <span className="font-mono">{product.sku}</span>
              {' · '}
              {product.moderationStatus === 'PENDING'
                ? 'in review'
                : product.moderationStatus === 'REJECTED'
                  ? 'sent back'
                  : product.status.toLowerCase()}
              {product.category ? ` · ${product.category.name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {live && shop.status === 'APPROVED' && (
              <Link href={`/products/${product.slug}`} className="btn btn-outline btn-sm">
                View in shop
              </Link>
            )}
            <Link href="/seller/products" className="btn btn-outline btn-sm">
              All products
            </Link>
          </div>
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        {canSell ? (
          <>
            <div className="mt-6">
              <ListingForm
                mode="seller"
                productId={product.id}
                onSaved={(saved) =>
                  setProduct((p) =>
                    p
                      ? {
                          ...p,
                          status: saved.status as SellerProductDetail['status'],
                          moderationStatus: (saved.moderationStatus ??
                            p.moderationStatus) as SellerProductDetail['moderationStatus'],
                        }
                      : p
                  )
                }
              />
            </div>

            <div className="mt-8 border-t border-line pt-6">
              <button
                type="button"
                onClick={discontinue}
                disabled={isRemoving}
                className="text-meta underline underline-offset-2 disabled:opacity-40"
                style={{ color: 'var(--sale)' }}
              >
                Take off the shop
              </button>
            </div>
          </>
        ) : (
          <Notice title="Listings cannot be changed right now" tone="alert">
            {sellingClosedText(shop)}
          </Notice>
        )}
      </div>
    </main>
  );
}
