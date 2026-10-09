import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProductListing } from '@/components/product';
import { LoadingSpinner } from '@/components/common';
import { fetchProductsPage } from '@/lib/server-products';
import { siteUrl } from '@/lib/site-url';

/**
 * The full catalogue.
 *
 * A Server Component wrapper around the shared listing: it resolves the title
 * and canonical for whatever view the search params describe, and renders page
 * one on the server. Everything interactive still lives in ProductListing, so
 * this page and the section pages cannot drift apart.
 *
 * Until now this was a client component with no initial data, which meant the
 * site's most commercial URL served HTML whose entire body was a spinner —
 * products only appeared after the bundle downloaded, hydrated and made a round
 * trip. That is what a crawler saw, and what a shopper on a slow connection
 * waited for.
 */

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Search params arrive as `string | string[]`; every filter here takes one value. */
const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const titleCase = (value: string): string =>
  value.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const category = one(params.category);
  const q = one(params.q);
  const brand = one(params.brand);
  const onSale = one(params.onSale);

  let title = 'All Products';
  let description =
    'The full Creative Impression catalogue — shirts, polos, t-shirts and custom wear, made to order.';
  let canonical = `${siteUrl()}/products`;

  if (q) {
    title = `Search: ${q}`;
    description = `Products matching “${q}” at Creative Impression.`;
  } else if (category) {
    const label = titleCase(decodeURIComponent(category));
    title = label;
    description = `Shop ${label.toLowerCase()} from Creative Impression.`;
    canonical = `${canonical}?category=${encodeURIComponent(category)}`;
  } else if (brand) {
    const label = titleCase(decodeURIComponent(brand));
    title = label;
    description = `${label} at Creative Impression.`;
    canonical = `${canonical}?brand=${encodeURIComponent(brand)}`;
  } else if (onSale === '1') {
    title = 'Sale';
    description = 'Genuine markdowns across the Creative Impression catalogue.';
    canonical = `${canonical}?onSale=1`;
  }

  return {
    title: `${title} | Creative Impression`,
    description,
    alternates: { canonical },
    // A search-result page has no business competing with the category pages
    // in the index, and there is one of them per query anyone ever typed.
    ...(q ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ProductsCatalogPage({ searchParams }: PageProps) {
  const params = await searchParams;

  /**
   * The filter set here has to match what ProductListing computes on its first
   * render from the same search params. If they disagree it discards this
   * result and fetches again, which is worse than not having done it at all.
   */
  const initial = await fetchProductsPage({
    category: one(params.category),
    q: one(params.q),
    color: one(params.color),
    brand: one(params.brand),
    sortBy: one(params.sortBy),
    minPrice: Number(one(params.minPrice)) || undefined,
    maxPrice: Number(one(params.maxPrice)) || undefined,
    // `onSale` and `inStock`, spelled the way ProductListing reads them from
    // the URL. Using the API's own `sale`/`1` names here would have the server
    // render an unfiltered grid that the client then keeps, because it skips
    // its first fetch on the strength of this data.
    sale: one(params.onSale) === '1',
    inStock: one(params.inStock) === '1',
    page: 1,
  });

  return (
    <Suspense fallback={<LoadingSpinner className="min-h-[50vh]" size="lg" />}>
      <ProductListing
        title="All Products"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Products' }]}
        initialProducts={initial?.products}
        initialTotal={initial?.total}
        initialReflectsParams
      />
    </Suspense>
  );
}
