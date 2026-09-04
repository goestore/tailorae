/**
 * Recently viewed catalog products.
 *
 * Ids only — no personal data, no profiling — in localStorage via the project
 * storage helpers. Custom Wear keeps its own list under its own key
 * (`lib/custom-wear/recently-viewed`) because the two catalogues do not share
 * product ids, and merging them would produce a rail with dead links in it.
 */

import { getStorageItem, setStorageItem } from '@/utils/helpers';

const STORAGE_KEY = 'ci:recently-viewed';
const MAX_ENTRIES = 12;

export function getRecentlyViewedIds(): string[] {
  const stored = getStorageItem<string[]>(STORAGE_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string').slice(0, MAX_ENTRIES);
}

/** Most recent first. The current product is stored, and filtered out on read. */
export function recordRecentlyViewed(productId: string): string[] {
  const next = [productId, ...getRecentlyViewedIds().filter((id) => id !== productId)].slice(
    0,
    MAX_ENTRIES
  );
  setStorageItem(STORAGE_KEY, next);
  return next;
}

export function clearRecentlyViewed(): void {
  setStorageItem(STORAGE_KEY, []);
}
