'use client';

import { useSyncExternalStore } from 'react';

/**
 * The last few things this browser searched for.
 *
 * Per browser, deliberately: recent searches are a convenience, not an account
 * feature, and a shopper who has not signed in still deserves them. Nothing
 * here is sent anywhere.
 *
 * Read through `useSyncExternalStore` rather than an effect, the way
 * `useHasToken` reads the session token. Setting state from an effect to pull
 * something out of `localStorage` renders the empty list first and corrects it
 * a frame later — a visible flash — and this codebase forbids it outright
 * (`react-hooks/set-state-in-effect`). The store below gives React a server
 * snapshot it can render into HTML and a client snapshot it knows is allowed
 * to differ, so there is no mismatch and no second render to see.
 */

const STORAGE_KEY = 'ci.recent-searches';

/** Enough to be useful in a dropdown; more than this is a history page. */
const MAX_RECENT = 6;

/** Shorter than this is a keystroke, not a search worth remembering. */
const MIN_LENGTH = 2;

/**
 * One frozen empty array, reused. `getSnapshot` must return the same reference
 * when nothing has changed or React re-renders forever.
 */
const EMPTY: readonly string[] = Object.freeze([]);

const listeners = new Set<() => void>();

let snapshot: readonly string[] = EMPTY;
/** The raw string `snapshot` was parsed from, so an unchanged store is cheap. */
let snapshotRaw: string | null = null;

const parse = (raw: string | null): readonly string[] => {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const terms = parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, MAX_RECENT);
    return terms.length > 0 ? Object.freeze(terms) : EMPTY;
  } catch {
    // Someone else's key, or a half-written value. An empty history is the
    // harmless reading.
    return EMPTY;
  }
};

const readStorage = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can throw outright in a locked-down browser.
    return null;
  }
};

const getSnapshot = (): readonly string[] => {
  const raw = readStorage();
  if (raw === snapshotRaw) return snapshot;
  snapshotRaw = raw;
  snapshot = parse(raw);
  return snapshot;
};

/** The server has no browser storage, so it has no history to render. */
const getServerSnapshot = (): readonly string[] => EMPTY;

const emit = (): void => {
  for (const listener of listeners) listener();
};

/**
 * `storage` covers the other tabs; the local set covers this one, because a
 * tab never hears its own `storage` event.
 */
const subscribe = (onStoreChange: () => void): (() => void) => {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
};

const commit = (terms: readonly string[]): void => {
  const next = terms.length > 0 ? Object.freeze([...terms]) : EMPTY;
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Private browsing or a full quota. The list still works for this session;
    // it simply will not outlive the tab.
  }
  snapshot = next;
  snapshotRaw = raw;
  emit();
};

/** Collapse the whitespace a paste brings with it, so " polo  shirt " is one entry. */
const normalise = (term: string): string => term.trim().replace(/\s+/g, ' ');

/**
 * Record a search. Most recent first, case-insensitively de-duplicated, so
 * searching "Polo" after "polo" moves the entry rather than adding a twin.
 */
export const rememberSearch = (term: string): void => {
  const value = normalise(term);
  if (value.length < MIN_LENGTH) return;

  const current = getSnapshot();
  const withoutDuplicate = current.filter(
    (entry) => entry.toLowerCase() !== value.toLowerCase()
  );
  commit([value, ...withoutDuplicate].slice(0, MAX_RECENT));
};

/** Drop one entry — the small cross beside a row. */
export const forgetSearch = (term: string): void => {
  const value = normalise(term).toLowerCase();
  const current = getSnapshot();
  const next = current.filter((entry) => entry.toLowerCase() !== value);
  if (next.length !== current.length) commit(next);
};

/** Drop the lot. */
export const clearRecentSearches = (): void => {
  if (getSnapshot().length > 0) commit(EMPTY);
};

/** The current history. Empty on the server and on the first client render. */
export function useRecentSearches(): readonly string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
