/**
 * Which commission rate applies to a line on an order.
 *
 * Three places can set a rate, most specific first:
 *
 *   1. the seller's own override (`VendorProfile.commissionRate`) — a deal
 *      negotiated with one shop beats everything else;
 *   2. the item's category, walking up the parents until one sets a rate, so
 *      "Kids > Dresses" inherits from "Kids" unless it says otherwise;
 *   3. the platform default (SystemSetting `commission.defaultRate`).
 *
 * House stock — no vendor — is always zero: there is no third party to take a
 * cut from.
 *
 * Null means "not set" at every level, and zero is a real rate. Reading a null
 * override as `?? 0` is exactly the bug this module replaces: it charged every
 * shop without an override nothing at all.
 *
 * No database import here. The caller hands in a way to read categories, so the
 * rules are unit tested without Prisma and the same resolver runs inside a
 * checkout transaction.
 */

import type { Prisma } from '@prisma/client';

/** The two columns of a category the walk needs. */
export interface CategoryRateRow {
  parentId: string | null;
  commissionRate: number | null;
}

/** Reads one category by id; null when it does not exist. */
export type CategoryLoader = (categoryId: string) => Promise<CategoryRateRow | null>;

/** A Prisma client or transaction, narrowed to the one model this module reads. */
export type CategoryClient = Pick<Prisma.TransactionClient, 'category'>;

/**
 * A category chain deeper than this is a cycle in the data, not a real tree.
 * Stopping beats hanging a checkout on a bad `parentId`.
 */
const MAX_DEPTH = 16;

/** A rate a person could have meant: a finite percentage from 0 to 100. */
const isRate = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

/**
 * The pure rule, once every input has been read.
 *
 * Exported for the tests and for any caller that already has the category rate
 * in hand.
 */
export function pickCommissionRate(input: {
  vendorId: string | null;
  vendorOverride: number | null | undefined;
  categoryRate: number | null | undefined;
  defaultRate: number;
}): number {
  if (!input.vendorId) return 0;
  if (isRate(input.vendorOverride)) return input.vendorOverride;
  if (isRate(input.categoryRate)) return input.categoryRate;
  return isRate(input.defaultRate) ? input.defaultRate : 0;
}

/**
 * Resolves rates for many lines with each category read at most once.
 *
 * An order of twenty items from one department would otherwise walk the same
 * three-level chain twenty times. The cache holds the *resolved* rate per
 * category (including "nothing set" as null), so siblings share their parent's
 * lookup too.
 */
export function createCommissionResolver(load: CategoryLoader, defaultRate: number) {
  const resolved = new Map<string, number | null>();

  /** Nearest rate set on this category or an ancestor, or null. */
  async function categoryRate(categoryId: string | null | undefined): Promise<number | null> {
    if (!categoryId) return null;
    if (resolved.has(categoryId)) return resolved.get(categoryId)!;

    // Walk up, remembering the path so every category on it can be cached with
    // the answer once it is found.
    const path: string[] = [];
    let cursor: string | null = categoryId;
    let rate: number | null = null;

    while (cursor && path.length < MAX_DEPTH) {
      if (resolved.has(cursor)) {
        rate = resolved.get(cursor)!;
        break;
      }
      if (path.includes(cursor)) break; // cycle
      path.push(cursor);

      const row = await load(cursor);
      if (!row) break;
      if (isRate(row.commissionRate)) {
        rate = row.commissionRate;
        break;
      }
      cursor = row.parentId;
    }

    for (const id of path) resolved.set(id, rate);
    return rate;
  }

  return {
    categoryRate,
    /** The rate for one line: override, else category chain, else default. */
    async rateFor(
      vendorId: string | null,
      vendorOverride: number | null | undefined,
      categoryId: string | null | undefined
    ): Promise<number> {
      // House stock and overridden shops never need the category read.
      if (!vendorId || isRate(vendorOverride)) {
        return pickCommissionRate({ vendorId, vendorOverride, categoryRate: null, defaultRate });
      }
      return pickCommissionRate({
        vendorId,
        vendorOverride,
        categoryRate: await categoryRate(categoryId),
        defaultRate,
      });
    },
  };
}

/** A loader over a Prisma client or transaction. */
export function prismaCategoryLoader(db: CategoryClient): CategoryLoader {
  return (categoryId) =>
    db.category.findUnique({
      where: { id: categoryId },
      select: { parentId: true, commissionRate: true },
    });
}

/**
 * One-off resolution for a single item. For an order's worth of lines, build a
 * resolver once with `createCommissionResolver` so the category reads are shared.
 */
export async function resolveCommissionRate(
  vendor: { id: string; commissionRate: number | null } | null,
  categoryId: string | null | undefined,
  options: { db: CategoryClient; defaultRate: number }
): Promise<number> {
  const resolver = createCommissionResolver(prismaCategoryLoader(options.db), options.defaultRate);
  return resolver.rateFor(vendor?.id ?? null, vendor?.commissionRate ?? null, categoryId);
}
