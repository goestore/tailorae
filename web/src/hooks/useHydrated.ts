'use client';

import { useSyncExternalStore } from 'react';

/**
 * False on the server and during the first client render, true afterwards.
 *
 * For UI that depends on something the server cannot know — a signed-in user,
 * a wishlist, anything read from `localStorage`. Rendering that state directly
 * is a hydration mismatch: the server has no session, and the client's session
 * restore can land part-way through hydration, so React finds a `<button>`
 * where the HTML says `<a>` and throws the subtree away.
 *
 * `useSyncExternalStore` is the sanctioned way to express this. Its server
 * snapshot is what the HTML was built from and its client snapshot is what
 * follows, so React knows the two are meant to differ instead of treating it
 * as a bug. A mounted flag set from an effect does the same job, but React
 * cannot tell that apart from an ordinary render loop.
 */

/** Nothing to subscribe to: the value changes exactly once, at hydration. */
const subscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
