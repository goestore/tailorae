/**
 * The category tiles the home page can show.
 *
 * Moved out of `CategoryCarousel` so the admin picker and the carousel read one
 * list: the picker offers exactly the tiles that exist, and a chosen id always
 * resolves to something renderable. Ids are the tile's destination path, which
 * makes them stable and readable in stored content — unlike the positional
 * "1", "2", "3" they used to carry, which would have silently re-pointed every
 * saved selection the first time a tile was inserted.
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
 * Applies a curated selection to the tiles.
 *
 * An empty selection means "not curated" and shows everything, which is what
 * keeps an untouched field from emptying the carousel. Ids that no longer
 * match a tile are dropped rather than rendering a hole.
 */
export function selectCategoryTiles(picks: readonly string[] | undefined): CategoryTile[] {
  if (!picks || picks.length === 0) return CATEGORY_TILES;
  const byId = new Map(CATEGORY_TILES.map((tile) => [tile.id, tile]));
  return picks
    .map((id) => byId.get(id))
    .filter((tile): tile is CategoryTile => tile !== undefined);
}
