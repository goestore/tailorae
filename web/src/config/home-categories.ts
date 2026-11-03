import { storeHref, type HomeCategoryTile } from '@/lib/category-tree';

/**
 * The home page's "Explore all categories" tiles.
 *
 * Tiles are the categories the admin marks "Show on homepage" (with an image
 * and an order) in Admin › Categories. Nothing is compiled in: a store with no
 * homepage categories shows no band, rather than tiles for stock it does not
 * carry. A category without an image yet gets the branded placeholder.
 */
export interface CategoryTile {
  id: string;
  name: string;
  /** Empty while the admin has not chosen an image. */
  image: string;
  link: string;
}

/** The admin-managed tiles, in homepage order. */
export function tilesFromCategories(categories: readonly HomeCategoryTile[]): CategoryTile[] {
  return [...categories]
    .sort((a, b) => a.homeOrder - b.homeOrder)
    .map((category) => ({
      id: category.slug,
      name: category.name,
      image: category.image || '',
      link: storeHref(category),
    }));
}
