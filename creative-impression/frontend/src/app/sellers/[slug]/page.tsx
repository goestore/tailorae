import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LoadingSpinner } from '@/components/common';
import { ProductListing } from '@/components/product';
import { apiBase, absoluteUrl } from '@/lib/site-url';
import type { Product, Seller } from '@/types';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** The shop and its first page of listings. */
async function fetchSellerPage(
  slug: string
): Promise<{ seller: Seller; products: Product[]; total: number } | null> {
  try {
    const sellerResponse = await fetch(`${apiBase()}/products/sellers/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 600, tags: ['sellers', `seller:${slug}`] },
    });
    if (!sellerResponse.ok) return null;
    const seller: Seller | null = (await sellerResponse.json())?.data?.seller ?? null;
    if (!seller) return null;

    const listResponse = await fetch(
      `${apiBase()}/products?vendor=${encodeURIComponent(seller.shopSlug)}&limit=24`,
      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000), next: { revalidate: 300 } }
    );
    const payload = listResponse.ok ? await listResponse.json() : null;
    const products: Product[] = payload?.data?.products ?? [];
    const total = payload?.data?.pagination?.total ?? products.length;

    return { seller, products, total };
  } catch (error) {
    console.warn(`[sellers] ${slug} unavailable:`, (error as Error).message);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchSellerPage(slug);
  if (!data) return { title: 'Seller | Creative Impression' };

  const { seller } = data;
  const title = `${seller.shopName} | Creative Impression`;
  const description =
    seller.shopDescription?.trim() ||
    `Shop the full range from ${seller.shopName} on Creative Impression.`;

  return {
    title,
    description,
    alternates: { canonical: `/sellers/${seller.shopSlug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: absoluteUrl(`/sellers/${seller.shopSlug}`),
      ...(seller.shopBanner || seller.shopImage
        ? { images: [{ url: absoluteUrl(seller.shopBanner || seller.shopImage!), alt: seller.shopName }] }
        : {}),
    },
  };
}

/**
 * A seller's storefront.
 *
 * Reuses `ProductListing` so sorting, filtering and load-more behave exactly
 * as they do everywhere else; `baseQuery` scopes it permanently to this shop,
 * which is also what stops a shopper filtering their way into another seller's
 * catalogue from here.
 */
export default async function SellerPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await fetchSellerPage(slug);
  if (!data) notFound();

  const { seller, products, total } = data;
  const hasRating = typeof seller.rating === 'number' && (seller.ratingCount ?? 0) > 0;

  return (
    <>
      <section className="container-max pt-[var(--section-y)]">
        <div className="border border-line bg-surface-2 p-5 md:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2
              className="m-0 text-ink"
              style={{ fontSize: 'clamp(20px, 2.4vw, 26px)', letterSpacing: '-0.02em' }}
            >
              {seller.shopName}
            </h2>
            {seller.isVerified && (
              <span
                className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
                style={{ color: 'var(--success, #1B7F4B)' }}
              >
                Verified seller
              </span>
            )}
          </div>

          <p className="m-0 mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            {total} {total === 1 ? 'product' : 'products'}
            {hasRating ? ` · ★ ${seller.rating!.toFixed(1)} from ${seller.ratingCount} ratings` : ''}
            {seller.createdAt
              ? ` · selling since ${new Date(seller.createdAt).toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                })}`
              : ''}
          </p>

          {seller.shopDescription && (
            <p
              className="m-0 mt-3 max-w-[70ch] text-[15px]"
              style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}
            >
              {seller.shopDescription}
            </p>
          )}
        </div>
      </section>

      <Suspense fallback={<LoadingSpinner className="min-h-[50vh]" size="lg" />}>
        <ProductListing
          title={`${seller.shopName} — all products`}
          crumbs={[
            { label: 'Home', href: '/' },
            { label: 'Sellers', href: '/sellers' },
            { label: seller.shopName },
          ]}
          baseQuery={{ vendor: seller.shopSlug }}
          initialProducts={products}
          initialTotal={total}
        />
      </Suspense>
    </>
  );
}
