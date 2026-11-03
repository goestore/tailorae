'use client';

import { ReactNode, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Provider, useDispatch } from 'react-redux';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { store, AppDispatch } from '@/store';
import type { Realm } from '@/lib/api-client';
import { fetchSession } from '@/lib/auth-api';
import { getCart } from '@/lib/cart-api';
import { sessionCheckStarted, sessionResolved } from '@/store/slices/auth';
import { clearCart, loadCart } from '@/store/slices/cart';
import { hydrateQuoteLines } from '@/store/slices/customWear';

/** Which account realm a page of the web app belongs to. */
export function realmOfPage(pathname: string | null): Realm {
  const path = pathname ?? '/';
  if (path === '/seller' || path.startsWith('/seller/')) return 'seller';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  return 'customer';
}

/**
 * Restores the session for the area being viewed: the storefront asks the
 * customer realm, `/seller` the seller realm and `/admin` the staff realm, each
 * with a silent `GET …/auth/me` (the cookie is httpOnly, so asking is the only
 * way to know). A visitor without a session just gets `user: null` — never a
 * redirect. Moving to another area re-checks, because a shopper session says
 * nothing about a seller one.
 */
function SessionInit() {
  const dispatch = useDispatch<AppDispatch>();
  const realm = realmOfPage(usePathname());

  useEffect(() => {
    // Custom-wear lines are kept in their own slice and storage key, so the
    // server-cart `loadCart` below replaces only payable lines and never wipes
    // them. Hydrated for guests too, so the header badge counts them.
    dispatch(hydrateQuoteLines());
  }, [dispatch]);

  useEffect(() => {
    // Already answered for this realm (or set by signing in just now).
    const current = store.getState().auth;
    if (current.realm === realm && current.isInitialized) return;
    let cancelled = false;
    dispatch(sessionCheckStarted(realm));

    // The bag only exists for shoppers; fired alongside /me rather than after
    // it, so restoring a session costs one round trip, not two.
    const cartPromise = realm === 'customer' ? getCart().catch(() => null) : Promise.resolve(null);

    fetchSession(realm).then(async (user) => {
      if (cancelled) return;
      dispatch(sessionResolved({ realm, user }));
      const cart = await cartPromise;
      if (cancelled) return;
      if (user && cart) dispatch(loadCart(cart));
      else if (!user) dispatch(clearCart());
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch, realm]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
      },
    },
  }), []);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <SessionInit />
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: { background: '#171717', color: '#ffffff', borderRadius: '0px' },
            success: { iconTheme: { primary: '#FECC00', secondary: '#171717' } },
            error: { iconTheme: { primary: '#B42318', secondary: '#171717' } },
          }}
        />
      </QueryClientProvider>
    </Provider>
  );
}
