import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/common';
import { ProductThumb } from '@/components/product';
import { apiBase } from '@/lib/site-url';
import type { Brand } from '@/types';

export const metadata: Metadata = {
  title: 'Shop by Brand | Creative Impression',
  description:
    'Every label we stock, in one place — browse the full range from each brand we carry.',
  alternates: { canonical: '/brands' },
};

/** Brands change far less often than stock does. */
export const revalidate = 3600;

/**
 * Read on the server so the brand list is in the HTML.
 *
 * A brand index is exactly the kind of page a crawler should be able to read
 * without running JavaScript — it is how a search engine discovers every brand
 * page beneath it.
 */
async function fetchBrands(): Promise<Brand[]> {
  try {
    const response = await fetch(`${apiBase()}/products/brands/list`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600, tags: ['brands'] },
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return payload?.data?.brands ?? [];
  } catch (error) {
    console.warn('[brands] index unavailable:', (error as Error).message);
    return [];
  }
}

export default async function BrandsPage() {
  const brands = await fetchBrands();

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Brands' }]} />

        <header className="mt-6 border-b border-line pb-6">
          <h1
            className="m-0 text-ink"
            style={{
              fontSize: 'clamp(28px, 4vw, 42px)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            Shop by brand
          </h1>
          <p className="mt-2 max-w-[60ch] text-[15px]" style={{ color: 'var(--ink-2)' }}>
            {brands.length > 0
              ? `${brands.length} ${brands.length === 1 ? 'label' : 'labels'} currently in stock.`
              : 'Brands appear here as soon as they have something in stock.'}
          </p>
        </header>

        {brands.length === 0 ? (
          <div className="mt-10 border border-line bg-surface-2 px-6 py-14 text-center">
            <p className="m-0 text-lg text-ink">No brands yet</p>
            <p className="mx-auto mt-2 max-w-[48ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Once products are tagged with a brand in the admin, each one gets a page here.
            </p>
            <Link href="/products" className="btn btn-primary mt-6">
              Browse the catalogue
            </Link>
          </div>
        ) : (
          <ul className="mt-8 grid list-none grid-cols-2 gap-x-[var(--card-gap)] gap-y-[var(--card-row-gap)] p-0 sm:grid-cols-3 lg:grid-cols-4">
            {brands.map((brand) => (
              <li key={brand.id}>
                <Link
                  href={`/brands/${brand.slug}`}
                  className="group flex h-full flex-col border border-line no-underline transition-colors hover:border-[var(--ink-3)]"
                >
                  <div
                    className="relative flex items-center justify-center overflow-hidden border-b border-line bg-surface-2"
                    style={{ aspectRatio: '16 / 9' }}
                  >
                    {brand.logo ? (
                      // `contain`, not `cover`: a logo cropped to fill its tile
                      // is a mangled logo.
                      <ProductThumb
                        src={brand.logo}
                        alt={brand.name}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-contain p-5"
                      />
                    ) : (
                      <span
                        className="text-[22px] font-bold uppercase tracking-[0.08em]"
                        style={{ color: 'var(--border-strong)' }}
                      >
                        {brand.name.slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="m-0 text-[14px] font-semibold text-ink">{brand.name}</p>
                    {brand._count && (
                      <p className="m-0 mt-0.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>
                        {brand._count.products}{' '}
                        {brand._count.products === 1 ? 'product' : 'products'}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
