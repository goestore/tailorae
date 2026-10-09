'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { Breadcrumbs, LoadingSpinner } from '@/components/common';
import { ListingForm } from '@/components/catalog/listing-form';
import { getMyShop, type MyShop } from '@/lib/seller-api';
import { RootState } from '@/store';

/**
 * Listing something new.
 *
 * This exists because every "List a product" link in the seller area pointed at
 * `/admin/products/new`, which is behind an admin-only guard: a seller was
 * dropped into the admin console's dark shell — Payouts, Customers, Sellers,
 * Site Layout and all — and then refused by the API. The form saves through the
 * public `POST /api/products`, which admits a VENDOR and takes the owning shop
 * from the session, so a seller cannot list under anybody else's name.
 */
export default function NewSellerProductPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [shop, setShop] = useState<MyShop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/seller/products/new');
  }, [isInitialized, user, router]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      getMyShop()
        .then((myShop) => {
          setShop(myShop);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  if (!shop) {
    return (
      <main className="section-y">
        <div className="container-max">
          {error && <p className="alert alert-error text-sm">{error}</p>}
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            You do not have a seller account yet.{' '}
            <Link href="/seller" className="underline underline-offset-2">
              Set one up
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Sell', href: '/seller' },
            { label: 'Products', href: '/seller/products' },
            { label: 'New' },
          ]}
        />

        <header className="mt-6 border-b border-line pb-6">
          <h1
            className="m-0 text-ink"
            style={{
              fontSize: 'clamp(26px, 3.6vw, 38px)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            List a product
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
            {shop.isVerified
              ? 'Pick the article type first. Save a draft any time; new listings go live once our team has reviewed them.'
              : 'Your shop is still being reviewed, so nothing goes on sale yet — but everything you list now is ready for the moment it is approved.'}
          </p>
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        <div className="mt-6">
          <ListingForm mode="seller" />
        </div>
      </div>
    </main>
  );
}
