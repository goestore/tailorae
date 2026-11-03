import React from 'react';
import { notFound } from 'next/navigation';
import { lookupProduct } from '@/lib/server-products';
import ProductDetailClient from './ProductDetailClient';

/**
 * One product.
 *
 * A Server Component shell: it resolves the product before the HTML is sent, so
 * a crawler and a link preview see the real page and a shopper on a slow
 * connection gets content rather than a spinner. Everything interactive — the
 * gallery, the variant picker, add-to-cart — lives in ProductDetailClient,
 * which takes this product as its starting state and skips the fetch it would
 * otherwise have made on mount.
 *
 * `fetchProduct` is wrapped in React's `cache`, and the sibling layout calls it
 * for the metadata, so the two share one request per render rather than hitting
 * the API twice.
 */

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * A product page is worth caching, but not indefinitely: price and stock change,
 * and the tag lets an admin edit clear it immediately rather than waiting out
 * the window.
 */
export const revalidate = 300;

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { preview } = await searchParams;
  const { status, product } = await lookupProduct(id);

  /**
   * A product the catalogue says is gone is a 404 here rather than in the
   * browser, so a crawler gets the right status instead of a 200 carrying an
   * error message.
   *
   * 'unavailable' is deliberately not a 404: the API being slow or restarting
   * would otherwise take every product out of the index for the length of a
   * deploy. That case renders with no initial product and the client fetches,
   * exactly as it did before.
   */
  /**
   * A draft product is a 404 to anyone unauthenticated, and this server render
   * carries no session — so an admin following a preview link would get a hard
   * 404 on their own unpublished product. `?preview=1` hands the page to the
   * client instead, which fetches with the admin's token and either renders the
   * draft or shows not-found itself.
   *
   * Not a security hole: the API still decides. An anonymous visitor adding the
   * parameter gets the same 404, one step later.
   */
  if (status === 'missing' && preview !== '1') notFound();

  return <ProductDetailClient idOrSlug={id} initialProduct={product} />;
}
