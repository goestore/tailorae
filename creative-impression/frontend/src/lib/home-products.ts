import type { Product } from '@/types';
import type { BestSellingProduct } from '@/components/home/BestSellingSlider';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

/**
 * Server-side product loading for curated home-page sections.
 *
 * Every function here answers the same question in a different shape: given
 * what the admin picked, which products should this band show? A curated
 * selection is exact — those products, that order. An empty selection means
 * the band was never curated, so it falls back to the automatic behaviour it
 * had before any of this existed.
 *
 * Nothing throws. The home page must render when the backend is down, and a
 * section with no products simply does not appear.
 */

async function get(path: string): Promise<Product[]> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      // Matches the existing featured-products cadence. Publishing a new
      // selection changes the content tag, not this, so a curated list can lag
      // by up to a minute — acceptable for a shop window, and it keeps the
      // home page off the database on every request.
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const products = json?.data?.products;
    return Array.isArray(products) ? (products as Product[]) : [];
  } catch {
    return [];
  }
}

/**
 * The products a curated section should show.
 *
 * `picks` is the ordered list of ids the admin chose; the API preserves that
 * order and drops anything that no longer exists. With no picks, `fallback` is
 * the query the section used to run for itself.
 */
export async function loadSectionProducts(
  picks: readonly string[] | undefined,
  fallback: string
): Promise<Product[]> {
  if (picks && picks.length > 0) {
    return get(`/products?ids=${picks.map(encodeURIComponent).join(',')}`);
  }
  return get(fallback);
}

const currency = (value: number): string => `₹${value.toLocaleString('en-IN')}`;

/**
 * Maps a catalog product onto the card shape the Best Selling rail renders.
 *
 * The rail was built around hand-written cards, so it wants pre-formatted
 * strings rather than numbers. Formatting here keeps that component unchanged
 * and means the money is rendered once, on the server, in one place.
 */
export function toBestSellingCard(product: Product): BestSellingProduct {
  const images = Array.isArray(product.images) ? product.images : [];
  const original =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price
      ? product.originalPrice
      : undefined;

  const discount =
    original !== undefined ? Math.round(((original - product.price) / original) * 100) : 0;

  return {
    id: product.id,
    name: product.name,
    image: typeof images[0] === 'string' ? images[0] : '',
    link: `/products/${product.id}`,
    sellingPrice: currency(product.price),
    mrp: original !== undefined ? currency(original) : undefined,
    // A "0% off" badge is worse than none.
    discount: discount > 0 ? `${discount}% off` : undefined,
  };
}
