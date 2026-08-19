/**
 * Recently viewed products for anonymous visitors.
 *
 * Stores product ids only — no personal data, no profiling — in localStorage
 * via the project's existing storage helpers.
 */

import { getStorageItem, setStorageItem } from '@/utils/helpers';

const STORAGE_KEY = 'cw:recently-viewed';
const MAX_ENTRIES = 12;

export function getRecentlyViewedIds(): string[] {
  const stored = getStorageItem<string[]>(STORAGE_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string').slice(0, MAX_ENTRIES);
}

/** Most recent first; the current product is stored but filtered out on read. */
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
