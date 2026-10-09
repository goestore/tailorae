'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, SkeletonList } from '@/components/common';
import { ProductCard, RecentlyViewed } from '@/components/product';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { RootState } from '@/store';
import { WishlistItem } from '@/types';

export default function WishlistPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Redirect once session-restore has resolved with no user — the same guard
  // the dashboard uses, so a refresh does not bounce a signed-in shopper.
  useEffect(() => {
    if (isInitialized && !user) {
      router.replace('/auth/login?redirect=/wishlist');
    }
  }, [isInitialized, user, router]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      apiClient
        .get('/users/wishlist')
        .then((res) => setItems(res.data?.data?.wishlist ?? []))
        .catch((err) => toast.error(getApiErrorMessage(err, 'Could not load your wishlist.')))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const remove = async (productId: string) => {
    setRemovingId(productId);
    // Optimistic: the row disappears immediately and is put back only if the
    // request fails, so a slow network does not make the button feel dead.
    const previous = items;
    setItems((current) => current.filter((item) => item.productId !== productId));
    try {
      await apiClient.delete(`/users/wishlist/${productId}`);
      toast.success('Removed from wishlist');
    } catch (err) {
      setItems(previous);
      toast.error(getApiErrorMessage(err, 'Could not remove that item.'));
    } finally {
      setRemovingId(null);
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return (
      <main className="section-y">
        <div className="container-max flex justify-center py-20">
          <SkeletonList rows={3} />
        </div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Wishlist' }]} />

        <header className="mt-6 border-b border-line pb-6">
          <h1
            className="m-0 text-ink"
            style={{
              fontSize: 'clamp(28px, 4vw, 42px)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            Wishlist
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
            {items.length > 0
              ? `${items.length} saved ${items.length === 1 ? 'piece' : 'pieces'}`
              : 'Nothing saved yet'}
          </p>
        </header>

        {items.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-x-[var(--card-gap)] gap-y-[var(--card-row-gap)] md:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="relative">
                <ProductCard product={item.product} />
                <button
                  type="button"
                  onClick={() => remove(item.productId)}
                  disabled={removingId === item.productId}
                  aria-label={`Remove ${item.product.name} from wishlist`}
                  className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center border border-line bg-white/95 text-lg leading-none text-ink transition-colors hover:border-[var(--ink-3)] disabled:opacity-40"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-10">
            <div className="border border-line bg-surface-2 px-6 py-14 text-center">
              <p className="m-0 text-lg text-ink">Your wishlist is empty</p>
              <p className="mx-auto mt-2 max-w-[46ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
                Tap the heart on any product to keep it here while you decide.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/products" className="btn btn-primary">
                  Browse the catalogue
                </Link>
                <Link href="/products/new-arrivals" className="btn btn-outline">
                  New arrivals
                </Link>
              </div>
            </div>

            {/* A recovery path rather than a dead end. */}
            <div className="mt-12">
              <RecentlyViewed heading="Recently viewed" />
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-10 flex justify-center">
            <Link href="/products">
              <Button variant="outline">Continue shopping</Button>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
