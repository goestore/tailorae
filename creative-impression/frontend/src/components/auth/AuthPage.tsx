'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { AuthToggle } from './AuthToggle';
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
const safeRedirect = (value: string | null): string => {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/';
};

export function AuthPage({ defaultMode }: { defaultMode: 'signin' | 'signup' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const redirectTo = safeRedirect(searchParams.get('redirect'));

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
      const res = await apiClient.post('/auth/login', {
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
      const res = await apiClient.post('/auth/register', {
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
    <AuthToggle
      defaultMode={defaultMode}
      isLoading={isLoading}
      error={error}
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
      onModeChange={() => setError(undefined)}
    />
  );
}
