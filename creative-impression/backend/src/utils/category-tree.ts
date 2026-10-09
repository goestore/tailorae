/**
 * The category tree, in memory.
 *
 * Categories are a parent/child table of a few dozen rows, so every question
 * about the tree (which listing template applies, which categories a page
 * covers, would this move make a loop) is answered by reading the whole table
 * once and walking it here, rather than by recursive SQL.
 */

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  displayOrder: number;
  isActive: boolean;
  image: string | null;
  description?: string | null;
  listingTemplate: string | null;
  commissionRate: number | null;
  /** Homepage "Explore all categories" tile, ordered by homeOrder. */
  showOnHome?: boolean;
  homeOrder?: number;
}

export interface CategoryNode extends CategoryRow {
  depth: number;
  /** Own template, else the nearest ancestor's. */
  resolvedTemplate: string | null;
  /** Slugs from the root down to this category, for /c/<path> URLs. */
  path: string[];
  children: CategoryNode[];
}

const byOrder = (a: CategoryRow, b: CategoryRow) =>
  a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);

/**
 * Nest flat rows. A row whose parent is missing (deleted, or filtered out as
 * inactive) becomes a root rather than vanishing, and a row caught in a loop
 * written by hand in the database is dropped instead of recursing forever.
 */
export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const ids = new Set(rows.map((r) => r.id));
  const childrenOf = new Map<string | null, CategoryRow[]>();
  for (const row of rows) {
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), row]);
  }
  const seen = new Set<string>();
  const build = (row: CategoryRow, depth: number, inherited: string | null, path: string[]): CategoryNode => {
    seen.add(row.id);
    const resolvedTemplate = row.listingTemplate ?? inherited;
    const ownPath = [...path, row.slug];
    return {
      ...row,
      depth,
      resolvedTemplate,
      path: ownPath,
      children: (childrenOf.get(row.id) ?? [])
        .filter((child) => !seen.has(child.id))
        .sort(byOrder)
        .map((child) => build(child, depth + 1, resolvedTemplate, ownPath)),
    };
  };
  return (childrenOf.get(null) ?? []).sort(byOrder).map((row) => build(row, 0, null, []));
}

/** Depth-first, parents before children: the order a nested picker lists them. */
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/** The category's id and every id below it. */
export function descendantIds(rows: CategoryRow[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i += 1) {
    for (const row of rows) {
      if (row.parentId === out[i] && !out.includes(row.id)) out.push(row.id);
    }
  }
  return out;
}

/** True when making `parentId` the parent of `id` would put `id` inside itself. */
export function wouldCreateCycle(rows: CategoryRow[], id: string, parentId: string | null): boolean {
  if (!parentId) return false;
  return descendantIds(rows, id).includes(parentId);
}

/** The nearest template on the way up from this category, or null. */
export function resolveTemplate(rows: CategoryRow[], id: string | null | undefined): string | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const visited = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !visited.has(current.id)) {
    if (current.listingTemplate) return current.listingTemplate;
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}

export const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
  displayOrder: true,
  isActive: true,
  image: true,
  description: true,
  listingTemplate: true,
  commissionRate: true,
  showOnHome: true,
  homeOrder: true,
} as const;

/**
 * The ids a `?category=` value covers: the category matched by slug or id,
 * and everything nested under it, so /c/footwear lists sneakers filed under
 * Footwear › Sneakers. An unknown value covers nothing (not everything).
 */
export function categoryScope(rows: CategoryRow[], slugOrId: string): string[] {
  const root = rows.find((r) => r.slug === slugOrId || r.id === slugOrId);
  return root ? descendantIds(rows, root.id) : [];
}
