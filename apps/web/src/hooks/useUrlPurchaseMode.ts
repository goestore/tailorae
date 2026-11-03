'use client';

import { useSyncExternalStore } from 'react';
import type { PurchaseMode } from '@/types/custom-wear';

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
};

const getClientSnapshot = (): PurchaseMode =>
  new URLSearchParams(window.location.search).get('mode') === 'quote' ? 'quote' : 'shop';

/** Statically rendered HTML always starts in shop mode. */
const getServerSnapshot = (): PurchaseMode => 'shop';

/**
 * Reads `?mode=` from the URL without `useSearchParams`.
 *
 * On a statically prerendered route, `useSearchParams` opts the entire client
 * subtree out of prerendering, so the page would ship with no server HTML.
 * `useSyncExternalStore` keeps the prerender intact: the server snapshot is
 * used for the static HTML, the real URL takes over on hydration, and
 * back/forward navigation stays in sync via `popstate`.
 */
export function useUrlPurchaseMode(): PurchaseMode {
  // All three arguments are module-level constants, so the store never resubscribes.
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
