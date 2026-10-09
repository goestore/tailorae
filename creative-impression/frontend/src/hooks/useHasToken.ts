'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether a session token is in `localStorage`.
 *
 * Three states, and the third one matters: `null` means "not known yet" — the
 * server rendered this and has no way to see the browser's storage. Pages use
 * it to hold off on deciding between "your cart" and "please sign in", because
 * rendering the sign-in prompt first and correcting it a frame later is how a
 * signed-in shopper gets told to log in on every reload.
 *
 * Reading it through `useSyncExternalStore` rather than an effect keeps the
 * server and first client render in agreement, and subscribing to `storage`
 * means signing out in one tab updates the others instead of leaving a stale
 * cart on screen.
 */

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
};

const read = (): boolean => {
  try {
    return Boolean(localStorage.getItem('token'));
  } catch {
    // Storage can throw outright in a locked-down browser; no token is the
    // safe reading.
    return false;
  }
};

export function useHasToken(): boolean | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
