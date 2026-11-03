'use client';

import { useSelector } from 'react-redux';
import type { RootState } from '@/store';

/**
 * Whether a shopper is signed in on the storefront.
 *
 * Three states, and the third one matters: `null` means "not known yet" — the
 * session lives in an httpOnly cookie, so the only way to know is the
 * `GET /auth/me` check the providers run on load. Pages use it to hold off on
 * deciding between "your cart" and "please sign in", because rendering the
 * sign-in prompt first and correcting it a frame later is how a signed-in
 * shopper gets told to log in on every reload.
 */
export function useSignedIn(): boolean | null {
  const { user, isInitialized, realm } = useSelector((state: RootState) => state.auth);
  if (!isInitialized || realm !== 'customer') return null;
  return Boolean(user);
}
