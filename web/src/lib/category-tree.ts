/**
 * The category tree, as the storefront reads it.
 *
 * Server-side only in practice (the root layout and the /c/ pages), fetched
 * with a 60-second revalidate and the `products` cache tag, which the backend
 * drops whenever an admin saves a category. A failure returns null so callers
 * fall back to the static navigation instead of rendering an empty header.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  displayOrder: number;
  /** Slugs from the department down, e.g. ["kids", "dresses"]. */
  path: string[];
  /** Template key, inherited from the parents. */
  listingTemplate: string | null;
  family: 'apparel' | 'general' | null;
  /** What the variant option is called for products here ("UK size"). */
  optionLabel: string | null;
  children: StoreCategory[];
}

export async function fetchCategoryTree(): Promise<StoreCategory[] | null> {
  try {
    const res = await fetch(`${API_BASE}/products/categories/list?tree=1`, {
      next: { revalidate: 60, tags: ['products'] },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const categories = json?.data?.categories;
    return Array.isArray(categories) ? (categories as StoreCategory[]) : null;
  } catch {
    return null;
  }
}

/** The category at /c/<slugs…>, with its ancestors (root first), or null. */
export function findCategoryByPath(
  tree: StoreCategory[],
  slugs: string[]
): { category: StoreCategory; ancestors: StoreCategory[] } | null {
  let level = tree;
  const trail: StoreCategory[] = [];
  for (const slug of slugs) {
    const next = level.find((c) => c.slug === slug);
    if (!next) return null;
    trail.push(next);
    level = next.children;
  }
  const category = trail.pop();
  return category ? { category, ancestors: trail } : null;
}

export const categoryHref = (category: Pick<StoreCategory, 'path' | 'slug'>) =>
  `/c/${(category.path?.length ? category.path : [category.slug]).join('/')}`;

/* ── Storefront URLs ──────────────────────────────────────────────────────
 *
 * Women, Men and Kids keep their established /products/<dept>/<sub> pages;
 * every other category lives at /c/<path>. Both are resolved against the live
 * tree, so a subcategory the admin adds under Women gets a page with no code
 * change.
 */

/** Departments served at /products/<slug>, in the header's order. */
export const APPAREL_DEPARTMENTS = ['womens', 'mens', 'kids'] as const;

const isApparel = (slug: string | undefined): boolean =>
  !!slug && (APPAREL_DEPARTMENTS as readonly string[]).includes(slug);

/**
 * URLs the Kids sections had before they were categories. They are linked
 * from search engines, saved carts and old emails, so they keep resolving —
 * and the categories keep linking to them, so nothing visible changes.
 */
const LEGACY_SEGMENTS: Record<string, Record<string, string>> = {
  kids: {
    'boys-polo-tshirt': 'kids-boys-polo-t-shirt',
    'boys-round-neck-tshirt': 'kids-boys-round-neck-t-shirt',
    'girl-polo-tshirt': 'kids-girls-polo-t-shirt',
    'girl-round-neck-tshirt': 'kids-girls-round-neck-t-shirt',
    'girl-tops': 'kids-girls-tops',
  },
};

const legacySegmentFor = (dept: string, slug: string): string | undefined =>
  Object.entries(LEGACY_SEGMENTS[dept] ?? {}).find(([, target]) => target === slug)?.[0];

/**
 * Where a category's page is. Apparel subcategories drop the department
 * prefix their globally-unique slug carries (womens-polo-t-shirt →
 * /products/womens/polo-t-shirt), however deep they sit.
 */
export function storeHref(category: Pick<StoreCategory, 'path' | 'slug'>): string {
  const path = category.path?.length ? category.path : [category.slug];
  const dept = path[0];
  if (!isApparel(dept)) return categoryHref(category);
  if (path.length === 1) return `/products/${dept}`;
  const slug = path[path.length - 1];
  const segment =
    legacySegmentFor(dept, slug) ?? (slug.startsWith(`${dept}-`) ? slug.slice(dept.length + 1) : slug);
  return `/products/${dept}/${segment}`;
}

const descendants = (node: StoreCategory, trail: StoreCategory[] = []): Array<{
  category: StoreCategory;
  ancestors: StoreCategory[];
}> =>
  node.children.flatMap((child) => [
    { category: child, ancestors: [...trail, node] },
    ...descendants(child, [...trail, node]),
  ]);

/**
 * The category at /products/<dept>/<segment>: an exact slug, the
 * department-prefixed slug, or a legacy Kids URL — at any depth under the
 * department. `segment` omitted resolves the department itself.
 */
export function findStoreCategory(
  tree: StoreCategory[],
  dept: string,
  segment?: string
): { category: StoreCategory; ancestors: StoreCategory[] } | null {
  const root = tree.find((c) => c.slug === dept);
  if (!root) return null;
  if (!segment) return { category: root, ancestors: [] };
  const all = descendants(root);
  const wanted = [segment, `${dept}-${segment}`, LEGACY_SEGMENTS[dept]?.[segment]].filter(Boolean);
  for (const slug of wanted) {
    const hit = all.find((entry) => entry.category.slug === slug);
    if (hit) return hit;
  }
  return null;
}

/** Every category in the tree, parents first. */
export const flattenStoreTree = (nodes: StoreCategory[]): StoreCategory[] =>
  nodes.flatMap((node) => [node, ...flattenStoreTree(node.children)]);

/* ── Homepage tiles ─────────────────────────────────────────────────────── */

export interface HomeCategoryTile {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  homeOrder: number;
  path: string[];
}

/**
 * Categories the admin marked "Show on homepage", in their homepage order.
 * Null when the API is unreachable, so the carousel can fall back to the
 * tiles compiled into config/home-categories.ts.
 */
export async function fetchHomeCategories(): Promise<HomeCategoryTile[] | null> {
  try {
    const res = await fetch(`${API_BASE}/products/categories/home`, {
      next: { revalidate: 60, tags: ['products'] },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const categories = json?.data?.categories;
    return Array.isArray(categories) ? (categories as HomeCategoryTile[]) : null;
  } catch {
    return null;
  }
}
