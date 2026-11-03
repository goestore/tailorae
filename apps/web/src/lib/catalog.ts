/**
 * Catalog categories, matching the `Category.slug` values the backend actually
 * stores. Used by the footer links and the product filters.
 *
 * These are the only three that exist. An earlier list here invented finer
 * slugs ("t-shirts", "jerseys", "corporate-uniforms") that no Category row ever
 * had, so every link and filter built from it returned an empty page. Anything
 * finer-grained than these belongs in `config/catalog.ts`, which expresses
 * subcategories as a parent category plus a keyword match.
 */
export interface CatalogCategory {
  slug: string;
  name: string;
}

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { slug: 'womens', name: "Women's" },
  { slug: 'mens', name: "Men's" },
  { slug: 'kids', name: 'Kids' },
];
