/**
 * Storefront listing sections that are not categories.
 *
 * New Arrivals and Sale are views over the whole catalogue (newest first,
 * everything reduced), so they are declared here with the /api/products query
 * that fills them. Departments and their subcategories are NOT here any more:
 * Women / Men / Kids and everything under them are real Category rows, managed
 * in the admin and resolved from the live tree (see lib/category-tree.ts and
 * components/product/DepartmentListing.tsx).
 */
export interface CatalogSection {
  /** URL segment. */
  slug: string;
  title: string;
  description: string;
  /** Query parameters passed straight to GET /products. */
  query: Record<string, string>;
}

export const CATALOG_SECTIONS: CatalogSection[] = [
  {
    slug: 'new-arrivals',
    title: 'New Arrivals',
    description: 'The latest additions to the collection, newest first.',
    query: { sortBy: 'newest' },
  },
  {
    slug: 'sale',
    title: 'Sale',
    description: 'Everything currently reduced.',
    query: { onSale: 'true' },
  },
];

export const findSection = (slug: string): CatalogSection | undefined =>
  CATALOG_SECTIONS.find((s) => s.slug === slug);
