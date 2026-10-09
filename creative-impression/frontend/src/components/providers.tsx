'use client';

import { ReactNode, useEffect, useMemo } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { store, AppDispatch } from '@/store';
import { apiClient } from '@/lib/api-client';
import { restoreSession, sessionInitialized } from '@/store/slices/auth';
import { loadCart } from '@/store/slices/cart';
import { hydrateQuoteLines } from '@/store/slices/customWear';
import { Cart } from '@/types';

/**
 * On mount: if a token exists in localStorage, restore the session via
 * GET /auth/me and hydrate the cart. A 401 is handled by the apiClient
 * interceptor (clears the token).
 */
function SessionInit() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    // Custom-wear lines are kept in their own slice and storage key, so the
    // server-cart `loadCart` below replaces only payable lines and never wipes
    // them. Hydrated for guests too, so the header badge counts them.
    dispatch(hydrateQuoteLines());

    const token = localStorage.getItem('token');
    if (!token) {
      dispatch(sessionInitialized());
      return;
    }

    let cancelled = false;

    // Both requests only need the token, which we already have — so fire them
    // together rather than nesting /cart inside /auth/me's callback. That
    // nesting made session restore take two serial round-trips.
    const mePromise = apiClient.get('/auth/me');
    const cartPromise = apiClient.get('/cart').catch(() => null);

    mePromise
      .then(async (res) => {
        if (cancelled) return;
        const user = res.data?.data?.user;
        if (!user) {
          dispatch(sessionInitialized());
          return;
        }
        dispatch(restoreSession({ user, token }));

        // Hydrate the cart so the header badge is live.
        const cartRes = await cartPromise;
        if (cancelled) return;
        const cart = cartRes?.data?.data?.cart;
        if (cart) dispatch(loadCart(cart as unknown as Cart));
      })
      .catch(() => {
        if (!cancelled) dispatch(sessionInitialized());
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

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
            success: { iconTheme: { primary: '#FBB602', secondary: '#171717' } },
            error: { iconTheme: { primary: '#B42318', secondary: '#171717' } },
          }}
        />
      </QueryClientProvider>
    </Provider>
  );
}
