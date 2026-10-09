import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/common';
import { apiBase } from '@/lib/site-url';
import type { Seller } from '@/types';

export const metadata: Metadata = {
  title: 'Sellers | Creative Impression',
  description: 'Every shop selling on Creative Impression, and what each one stocks.',
  alternates: { canonical: '/sellers' },
};

export const revalidate = 600;

async function fetchSellers(): Promise<Seller[]> {
  try {
    const response = await fetch(`${apiBase()}/products/sellers/list`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 600, tags: ['sellers'] },
    });
    if (!response.ok) return [];
    return (await response.json())?.data?.sellers ?? [];
  } catch (error) {
    console.warn('[sellers] index unavailable:', (error as Error).message);
    return [];
  }
}

export default async function SellersPage() {
  const sellers = await fetchSellers();

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Sellers' }]} />

        <header className="mt-6 border-b border-line pb-6">
          <h1
            className="m-0 text-ink"
            style={{
              fontSize: 'clamp(28px, 4vw, 42px)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            Sellers
          </h1>
          <p className="mt-2 max-w-[62ch] text-[15px]" style={{ color: 'var(--ink-2)' }}>
            {sellers.length > 0
              ? `${sellers.length} ${sellers.length === 1 ? 'shop' : 'shops'} currently selling here. Each one ships and supports its own orders.`
              : 'Shops appear here once they are verified and have something in stock.'}
          </p>
        </header>

        {sellers.length === 0 ? (
          <div className="mt-10 border border-line bg-surface-2 px-6 py-14 text-center">
            <p className="m-0 text-lg text-ink">No sellers yet</p>
            <p className="mx-auto mt-2 max-w-[52ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Everything in the catalogue is currently house stock. Sellers are approved from
              Admin &rarr; Customers, and their listings show up here.
            </p>
            <Link href="/products" className="btn btn-primary mt-6">
              Browse the catalogue
            </Link>
          </div>
        ) : (
          <ul className="mt-8 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {sellers.map((seller) => {
              const hasRating =
                typeof seller.rating === 'number' && (seller.ratingCount ?? 0) > 0;
              return (
                <li key={seller.id}>
                  <Link
                    href={`/sellers/${seller.shopSlug}`}
                    className="flex h-full flex-col border border-line p-5 no-underline transition-colors hover:border-[var(--ink-3)]"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[16px] font-semibold text-ink">{seller.shopName}</span>
                      {seller.isVerified && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-[0.1em]"
                          style={{ color: 'var(--success, #1B7F4B)' }}
                        >
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                      {seller._count?.products ?? 0}{' '}
                      {(seller._count?.products ?? 0) === 1 ? 'product' : 'products'}
                      {hasRating ? ` · ★ ${seller.rating!.toFixed(1)}` : ''}
                    </p>
                    {seller.shopDescription && (
                      <p
                        className="m-0 mt-3 line-clamp-3 text-[13.5px]"
                        style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}
                      >
                        {seller.shopDescription}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
