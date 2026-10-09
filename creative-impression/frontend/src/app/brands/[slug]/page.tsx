import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LoadingSpinner } from '@/components/common';
import { ProductListing } from '@/components/product';
import { apiBase, absoluteUrl } from '@/lib/site-url';
import type { Brand, Product } from '@/types';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** One page of this brand's products, plus the brand itself. */
async function fetchBrandPage(
  slug: string
): Promise<{ brand: Brand; products: Product[]; total: number } | null> {
  try {
    const brandResponse = await fetch(
      `${apiBase()}/products/brands/${encodeURIComponent(slug)}`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 3600, tags: ['brands', `brand:${slug}`] },
      }
    );
    if (!brandResponse.ok) return null;
    const brand: Brand | null = (await brandResponse.json())?.data?.brand ?? null;
    if (!brand) return null;

    const listResponse = await fetch(
      `${apiBase()}/products?brand=${encodeURIComponent(brand.slug)}&limit=24`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 300 },
      }
    );
    const payload = listResponse.ok ? await listResponse.json() : null;
    const products: Product[] = payload?.data?.products ?? [];
    const total = payload?.data?.pagination?.total ?? products.length;

    return { brand, products, total };
  } catch (error) {
    console.warn(`[brands] ${slug} unavailable:`, (error as Error).message);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchBrandPage(slug);
  if (!data) return { title: 'Brand | Creative Impression' };

  const { brand } = data;
  const title = brand.metaTitle?.trim() || `${brand.name} | Creative Impression`;
  const description =
    brand.metaDescription?.trim() ||
    brand.description?.trim() ||
    `Shop the full ${brand.name} range at Creative Impression.`;

  return {
    title,
    description,
    alternates: { canonical: `/brands/${brand.slug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: absoluteUrl(`/brands/${brand.slug}`),
      ...(brand.banner || brand.logo
        ? { images: [{ url: absoluteUrl(brand.banner || brand.logo!), alt: brand.name }] }
        : {}),
    },
  };
}

/**
 * A brand's own storefront.
 *
 * Reuses `ProductListing` rather than reimplementing a grid, so sorting,
 * filtering, load-more and the empty state behave exactly as they do
 * everywhere else. `baseQuery` scopes it permanently to this brand, which is
 * also what hides the brand facet — a brand page cannot be filtered to a
 * different brand.
 */
export default async function BrandPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await fetchBrandPage(slug);
  if (!data) notFound();

  const { brand, products, total } = data;

  return (
    <>
      {brand.description && (
        <div className="container-max pt-[var(--section-y)]">
          <p
            className="m-0 max-w-[70ch] text-[15px]"
            style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}
          >
            {brand.description}
          </p>
        </div>
      )}

      <Suspense fallback={<LoadingSpinner className="min-h-[50vh]" size="lg" />}>
        <ProductListing
          title={brand.name}
          crumbs={[
            { label: 'Home', href: '/' },
            { label: 'Brands', href: '/brands' },
            { label: brand.name },
          ]}
          baseQuery={{ brand: brand.slug }}
          initialProducts={products}
          initialTotal={total}
        />
      </Suspense>
    </>
  );
}
