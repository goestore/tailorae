'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { AuthToggle, type AuthAudience } from './AuthToggle';
import { AppDispatch } from '@/store';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import {
  loginStart,
  loginSuccess,
  loginFailure,
  registerStart,
  registerFailure,
} from '@/store/slices/auth';
import { loadCart } from '@/store/slices/cart';
import { Cart } from '@/types';

/** Only allow internal redirect targets (e.g. "/cart"), never external URLs. */
const safeRedirect = (value: string | null, fallback: string): string => {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return fallback;
};

/**
 * Where each audience signs in. Both still point at the one legacy account
 * table; when the Kotlin API takes over, sellers move to their own realm
 * (`/seller/auth/*`, see docs/ACCOUNTS.md) and only this map changes.
 */
const ENDPOINTS: Record<AuthAudience, { login: string; register: string; home: string }> = {
  customer: { login: '/auth/login', register: '/auth/register', home: '/' },
  seller: { login: '/auth/login', register: '/auth/register', home: '/seller' },
};

export function AuthPage({
  defaultMode,
  audience = 'customer',
}: {
  defaultMode: 'signin' | 'signup';
  audience?: AuthAudience;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const endpoints = ENDPOINTS[audience];
  const redirectTo = safeRedirect(searchParams.get('redirect'), endpoints.home);

  // Where the confirmation link in the sign-up email lands.
  const verified = searchParams.get('verified');
  const verifiedNotice =
    verified === 'verified'
      ? { ok: true, text: 'Your email address is confirmed. Sign in to continue.' }
      : verified === 'already'
        ? { ok: true, text: 'This address was already confirmed. Sign in to continue.' }
        : verified === 'invalid'
          ? {
              ok: false,
              text: 'That confirmation link has expired or was already used. Sign in and send a new one from your account.',
            }
          : null;

  const completeLogin = async (user: unknown, token: string) => {
    localStorage.setItem('token', token);
    dispatch(loginSuccess({ user: user as never, token }));
    // Hydrate the cart so the header badge is immediately correct.
    try {
      const cartRes = await apiClient.get('/cart');
      const cart = cartRes.data?.data?.cart;
      if (cart) dispatch(loadCart(cart as unknown as Cart));
    } catch {
      /* non-fatal */
    }
    router.push(redirectTo);
  };

  const handleSignIn = async (data: Record<string, string>) => {
    setIsLoading(true);
    setError(undefined);
    dispatch(loginStart());
    try {
      const res = await apiClient.post(endpoints.login, {
        email: data.email,
        password: data.password,
      });
      const { user, token } = res.data?.data ?? {};
      if (!user || !token) throw new Error('Unexpected response from the server.');
      await completeLogin(user, token);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Sign in failed. Please try again.');
      dispatch(loginFailure(message));
      setError(message);
      setIsLoading(false);
    }
  };

  const handleSignUp = async (data: Record<string, string>) => {
    setIsLoading(true);
    setError(undefined);
    dispatch(registerStart());
    try {
      const res = await apiClient.post(endpoints.register, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
      });
      const { user, token } = res.data?.data ?? {};
      if (!user || !token) throw new Error('Unexpected response from the server.');
      await completeLogin(user, token);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Registration failed. Please try again.');
      dispatch(registerFailure(message));
      setError(message);
      setIsLoading(false);
    }
  };

  return (
    <>
      {verifiedNotice && (
        <div
          role="status"
          className="mx-auto mt-6 max-w-[480px] border px-4 py-3 text-[14px]"
          style={{
            borderColor: verifiedNotice.ok ? 'var(--brand)' : 'var(--sale)',
            background: verifiedNotice.ok ? 'var(--brand-soft)' : 'transparent',
            color: 'var(--ink)',
          }}
        >
          {verifiedNotice.text}
        </div>
      )}
      <AuthToggle
      audience={audience}
      defaultMode={defaultMode}
      isLoading={isLoading}
      error={error}
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
      onModeChange={() => setError(undefined)}
      />
    </>
  );
}
