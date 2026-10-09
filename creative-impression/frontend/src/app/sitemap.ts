import type { MetadataRoute } from 'next';
import { CATALOG_SECTIONS } from '@/config/catalog';
import { CUSTOM_WEAR_CATEGORIES, categoryHref } from '@/config/custom-wear/taxonomy';
import { CUSTOM_WEAR_PRODUCTS } from '@/data/custom-wear/products';
import { absoluteUrl, apiBase } from '@/lib/site-url';
import { fetchCategoryTree, flattenStoreTree, storeHref } from '@/lib/category-tree';

/** Re-read hourly. Products come and go far more often than the page list does. */
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

const entry = (
  path: string,
  priority: number,
  changeFrequency: Entry['changeFrequency'],
  lastModified?: string | Date
): Entry => ({
  url: absoluteUrl(path),
  priority,
  changeFrequency,
  ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
});

/**
 * Editorial and reference pages. Deliberately excludes everything in
 * `robots.ts`'s disallow list: cart, checkout, account, invoices and the
 * wishlist are either private or meaningless without a session, and listing a
 * page here that robots.txt blocks is a contradiction a crawler reports as an
 * error.
 *
 * `/stories` is also absent — it carries `noindex` until it has articles on it,
 * and submitting a page for indexing while telling it not to index is the same
 * contradiction.
 */
const STATIC_PAGES: Array<[string, number, Entry['changeFrequency']]> = [
  ['/', 1, 'daily'],
  ['/products', 0.9, 'daily'],
  ['/brands', 0.7, 'weekly'],
  ['/sellers', 0.7, 'weekly'],
  ['/custom-wear', 0.9, 'weekly'],
  ['/b2b', 0.8, 'monthly'],
  ['/customization', 0.8, 'monthly'],
  ['/info/about', 0.6, 'yearly'],
  ['/info/contact', 0.6, 'yearly'],
  ['/faq', 0.6, 'monthly'],
  ['/size-guide', 0.6, 'yearly'],
  ['/care', 0.5, 'yearly'],
  ['/shipping', 0.4, 'yearly'],
  ['/return-policy', 0.4, 'yearly'],
  ['/refund-policy', 0.4, 'yearly'],
  ['/track-order', 0.4, 'yearly'],
  ['/privacy', 0.2, 'yearly'],
  ['/terms', 0.2, 'yearly'],
  ['/cookies-policy', 0.2, 'yearly'],
];

interface SitemapBrand {
  slug: string;
}

/**
 * Brands with something in stock. The index page links to all of them, but a
 * sitemap entry is what gets each brand page crawled on its own schedule.
 */
async function fetchBrands(): Promise<SitemapBrand[]> {
  try {
    const response = await fetch(`${apiBase()}/products/brands/list`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    return (await response.json())?.data?.brands ?? [];
  } catch (error) {
    console.warn('[sitemap] brands unavailable:', (error as Error).message);
    return [];
  }
}

interface SitemapSeller {
  shopSlug: string;
}

/** Shops with live stock. Each gets its own crawlable storefront. */
async function fetchSellers(): Promise<SitemapSeller[]> {
  try {
    const response = await fetch(`${apiBase()}/products/sellers/list`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    return (await response.json())?.data?.sellers ?? [];
  } catch (error) {
    console.warn('[sitemap] sellers unavailable:', (error as Error).message);
    return [];
  }
}

interface SitemapProduct {
  id: string;
  slug?: string | null;
  updatedAt?: string;
}

/**
 * Every active product, a page at a time.
 *
 * The list endpoint caps `limit` at 50, so this walks pages rather than asking
 * for everything at once. The ceiling is a guard against an unbounded loop if
 * the API ever stops advancing `page` — a sitemap is capped at 50,000 URLs
 * anyway, and a catalogue past this size wants a sitemap index, not a taller
 * loop here.
 */
async function fetchProducts(): Promise<SitemapProduct[]> {
  const PAGE_SIZE = 50;
  const MAX_PAGES = 40;
  const products: SitemapProduct[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let batch: SitemapProduct[] = [];
    try {
      const response = await fetch(
        `${apiBase()}/products?page=${page}&limit=${PAGE_SIZE}`,
        { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
      );
      if (!response.ok) break;
      const payload = await response.json();
      batch = payload?.data?.products ?? [];
    } catch (error) {
      // A sitemap missing its products is recoverable — the static pages still
      // publish and the next revalidation tries again. A build that dies
      // because the API was briefly down is not.
      console.warn(`[sitemap] product page ${page} unavailable:`, (error as Error).message);
      break;
    }

    products.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return products;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: Entry[] = STATIC_PAGES.map(([path, priority, frequency]) =>
    entry(path, priority, frequency)
  );

  // New Arrivals / Sale, then every category at its storefront URL — the
  // taxonomy the navigation and the footer both link to.
  for (const section of CATALOG_SECTIONS) {
    entries.push(entry(`/products/${section.slug}`, 0.8, 'daily'));
  }
  for (const category of flattenStoreTree((await fetchCategoryTree()) ?? [])) {
    entries.push(entry(storeHref(category), category.path.length === 1 ? 0.8 : 0.7, 'weekly'));
  }

  // Custom Wear is static data, so these never depend on the API being up.
  for (const category of CUSTOM_WEAR_CATEGORIES) {
    entries.push(entry(categoryHref(category), 0.7, 'weekly'));
  }
  for (const product of CUSTOM_WEAR_PRODUCTS) {
    entries.push(entry(`/custom-wear/product/${product.slug}`, 0.6, 'weekly'));
  }

  for (const brand of await fetchBrands()) {
    if (brand.slug) entries.push(entry(`/brands/${brand.slug}`, 0.6, 'weekly'));
  }

  for (const seller of await fetchSellers()) {
    if (seller.shopSlug) entries.push(entry(`/sellers/${seller.shopSlug}`, 0.6, 'weekly'));
  }

  for (const product of await fetchProducts()) {
    const ref = product.slug || product.id;
    if (!ref) continue;
    entries.push(entry(`/products/${ref}`, 0.7, 'weekly', product.updatedAt));
  }

  return entries;
}
