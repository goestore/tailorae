import { storeHref, type HomeCategoryTile } from '@/lib/category-tree';

/**
 * The home page's "Explore all categories" tiles.
 *
 * The live tiles are categories the admin marks "Show on homepage" (with an
 * image and an order) in Admin › Categories — see `tilesFromCategories`.
 * `CATEGORY_TILES` below is what the band showed before that, kept as the
 * fallback for when the API is unreachable, so the band never renders empty.
 */
export interface CategoryTile {
  id: string;
  name: string;
  image: string;
  link: string;
}

export const CATEGORY_TILES: CategoryTile[] = [
  {
    id: 'womens/polo-t-shirt',
    name: "Women's Polo T-Shirt",
    image: '/images/Women Polo T-Shirt.webp',
    link: '/products/womens/polo-t-shirt',
  },
  {
    id: 'mens/polo-t-shirt',
    name: "Men's Polo T-Shirt",
    image: '/images/Mens Polo T-Shirt.webp',
    link: '/products/mens/polo-t-shirt',
  },
  {
    id: 'womens/tops-tunics',
    name: "Women's Tops",
    image: '/images/Women Top.webp',
    link: '/products/womens/tops-tunics',
  },
  {
    id: 'mens/round-neck-tshirts',
    name: "Men's Round Neck T-Shirt",
    image: '/images/Round Neck T-Shirt.webp',
    link: '/products/mens/round-neck-tshirts',
  },
  {
    id: 'kids/boys-polo-tshirt',
    name: "Boy's Polo T-Shirt",
    image: '/images/Boys Polo T-Shirts.webp',
    link: '/products/kids/boys-polo-tshirt',
  },
  {
    id: 'mens/shirts',
    name: "Men's Shirt",
    image: '/images/Mens Shirt.webp',
    link: '/products/mens/shirts',
  },
  {
    id: 'kids/boys-round-neck-tshirt',
    name: "Boy's Round Neck T-Shirt",
    image: '/images/WINTER.webp',
    link: '/products/kids/boys-round-neck-tshirt',
  },
  {
    id: 'kids/girl-polo-tshirt',
    name: "Girl's Polo T-Shirt",
    image: '/images/WINTER.webp',
    link: '/products/kids/girl-polo-tshirt',
  },
  {
    id: 'kids/girl-tops',
    name: "Girl's Top",
    image: '/images/WINTER.webp',
    link: '/products/kids/girl-tops',
  },
  {
    id: 'custom-wear',
    name: 'Custom Wear',
    image: '/images/WINTER.webp',
    link: '/customization',
  },
  {
    id: 'womens/plus-size',
    name: 'Plus Size',
    image: '/images/WINTER.webp',
    link: '/products/womens/plus-size',
  },
];

/**
 * Custom Wear is a page, not a category, so it cannot be marked on the
 * categories screen. It keeps its tile in code, slotted in by `homeOrder`
 * among the category tiles (10 = where it has always sat, before Plus Size).
 */
export const CUSTOM_WEAR_TILE: CategoryTile & { homeOrder: number } = {
  ...CATEGORY_TILES.find((tile) => tile.id === 'custom-wear')!,
  homeOrder: 10,
};

/**
 * The captions the tiles carried before they were categories. A subcategory
 * is named for its place in the tree ("Polo T-Shirts" under Women), which
 * reads ambiguously on its own in a row of tiles. Each entry applies only
 * while the category still has the name it was migrated with, so renaming the
 * category in the admin takes over the tile caption too.
 */
const LEGACY_TILE_CAPTIONS: Record<string, { name: string; caption: string }> = {
  'womens-polo-t-shirt': { name: 'Polo T-Shirts', caption: "Women's Polo T-Shirt" },
  'mens-polo-t-shirt': { name: 'Polo T-Shirts', caption: "Men's Polo T-Shirt" },
  'womens-tops-tunics': { name: 'Tops & Tunics', caption: "Women's Tops" },
  'mens-round-neck-tshirts': { name: 'Round Neck T-Shirts', caption: "Men's Round Neck T-Shirt" },
  'kids-boys-polo-t-shirt': { name: 'Polo T-Shirts', caption: "Boy's Polo T-Shirt" },
  'mens-shirts': { name: 'Shirts', caption: "Men's Shirt" },
  'kids-boys-round-neck-t-shirt': { name: 'Round Neck T-Shirts', caption: "Boy's Round Neck T-Shirt" },
  'kids-girls-polo-t-shirt': { name: 'Polo T-Shirts', caption: "Girl's Polo T-Shirt" },
  'kids-girls-tops': { name: 'Tops', caption: "Girl's Top" },
};

/** Shown when a category is on the homepage without an image yet. */
const PLACEHOLDER_IMAGE = '/images/WINTER.webp';

/** The admin-managed tiles, in homepage order, with Custom Wear in its slot. */
export function tilesFromCategories(categories: readonly HomeCategoryTile[]): CategoryTile[] {
  const tiles = categories.map((category) => {
    const legacy = LEGACY_TILE_CAPTIONS[category.slug];
    return {
      id: category.slug,
      name: legacy && legacy.name === category.name ? legacy.caption : category.name,
      image: category.image || PLACEHOLDER_IMAGE,
      link: storeHref(category),
      homeOrder: category.homeOrder,
    };
  });
  // Stable: a category sharing Custom Wear's order goes first.
  const at = tiles.findIndex((tile) => tile.homeOrder > CUSTOM_WEAR_TILE.homeOrder);
  const ordered = at === -1 ? [...tiles, CUSTOM_WEAR_TILE] : [...tiles.slice(0, at), CUSTOM_WEAR_TILE, ...tiles.slice(at)];
  return ordered.map(({ id, name, image, link }) => ({ id, name, image, link }));
}
