/**
 * Catalog categories (real slugs from the backend database).
 * Used by the header nav, footer links, and product filters.
 */
export interface CatalogCategory {
  slug: string;
  name: string;
}

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { slug: 't-shirts', name: 'T-Shirts' },
  { slug: 'polo', name: 'Polo' },
  { slug: 'round-neck', name: 'Round Neck' },
  { slug: 'formal-shirts', name: 'Formal Shirts' },
  { slug: 'casual-shirts', name: 'Casual Shirts' },
  { slug: 'hoodies-sweatshirts', name: 'Hoodies & Sweatshirts' },
  { slug: 'pullover-hoodies', name: 'Pullover Hoodies' },
  { slug: 'zipper-hoodies', name: 'Zipper Hoodies' },
  { slug: 'jerseys', name: 'Jerseys' },
  { slug: 'corporate-uniforms', name: 'Corporate Uniforms' },
  { slug: 'industrial-workwear', name: 'Industrial Workwear' },
  { slug: 'caps', name: 'Caps' },
  { slug: 'backpacks', name: 'Backpacks' },
  { slug: 'tote-bags', name: 'Tote Bags' },
  { slug: 'gift-sets', name: 'Gift Sets' },
];
