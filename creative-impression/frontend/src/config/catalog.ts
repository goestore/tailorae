/**
 * Storefront section taxonomy.
 *
 * Every entry in the header navigation maps to one section here, and each
 * section declares the /api/products query that populates it. Subcategories do
 * not exist as Category rows in the database, so they are expressed as a parent
 * category plus a keyword — which the products API already supports via its
 * `search` parameter. Adding real subcategory records later only requires
 * swapping `search` for `category` in these entries.
 */
export interface CatalogSection {
  /** URL segment. */
  slug: string;
  title: string;
  description: string;
  /** Query parameters passed straight to GET /products. */
  query: Record<string, string>;
  /**
   * Optional name match applied after fetching. The products API only supports a
   * single `search` term, but a subcategory usually spans several words (a kurti
   * is a tunic), so matching happens here instead: a product qualifies if its
   * name contains ANY `match` term and NO `exclude` term.
   */
  match?: string[];
  exclude?: string[];
  children?: CatalogSection[];
}

const child = (
  slug: string,
  title: string,
  category: string,
  match: string[],
  description: string,
  exclude?: string[]
): CatalogSection => ({
  slug,
  title,
  description,
  query: { category },
  match,
  ...(exclude ? { exclude } : {}),
});

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
  {
    slug: 'womens',
    title: "Women's",
    description: 'Polos, tops, tees and tunics for women.',
    query: { category: 'womens' },
    children: [
      child('polo-t-shirt', "Women's Polo T-Shirts", 'womens', ['polo'], 'Cotton piqué polos, cut for a woman’s fit.'),
      child('tops-tunics', 'Tops & Tunics', 'womens', ['top', 'tunic', 'kurti', 'anarkali'], 'Everyday tops and longer-line tunics.'),
      child('round-neck-tshirts', 'Round Neck T-Shirts', 'womens', ['round neck', 't-shirt', 'tee'], 'Classic crew-neck tees.'),
      child('plus-size', 'Plus Size', 'womens', ['plus'], 'Extended sizing across the range.'),
    ],
  },
  {
    slug: 'mens',
    title: "Men's",
    description: 'Polos, shirts and tees for men.',
    query: { category: 'mens' },
    children: [
      child('polo-t-shirt', "Men's Polo T-Shirts", 'mens', ['polo'], 'Piqué and interlock polos for work and weekend.'),
      child('round-neck-tshirts', 'Round Neck T-Shirts', 'mens', ['round neck', 't-shirt', 'tee'], 'Crew-neck tees in a regular fit.'),
      // 'shirt' would also catch 't-shirt', hence the exclusion.
      child('shirts', 'Shirts', 'mens', ['shirt', 'chino'], 'Formal and casual shirting.', ['t-shirt', 'tee', 'polo']),
    ],
  },
  {
    slug: 'kids',
    title: 'Kids',
    description: 'Polos, tees and party wear for children.',
    query: { category: 'kids' },
    children: [
      child('boys-polo-tshirt', "Boys' Polo T-Shirts", 'kids', ['polo'], 'Hard-wearing polos for boys.'),
      child('boys-round-neck-tshirt', "Boys' Round Neck T-Shirts", 'kids', ['tee', 't-shirt'], 'Everyday crew-neck tees for boys.'),
      child('girl-polo-tshirt', "Girls' Polo T-Shirts", 'kids', ['polo'], 'Soft-touch polos for girls.'),
      child('girl-round-neck-tshirt', "Girls' Round Neck T-Shirts", 'kids', ['tee', 't-shirt'], 'Everyday crew-neck tees for girls.'),
      child('girl-tops', "Girls' Tops", 'kids', ['top', 'frock', 'dress'], 'Tops, frocks and party wear.'),
    ],
  },
];

export const findSection = (slug: string): CatalogSection | undefined =>
  CATALOG_SECTIONS.find((s) => s.slug === slug);

export const findChild = (parent: string, sub: string): CatalogSection | undefined =>
  findSection(parent)?.children?.find((c) => c.slug === sub);
