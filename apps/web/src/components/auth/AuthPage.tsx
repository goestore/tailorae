'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { AuthToggle, type AuthAudience } from './AuthToggle';
import { AppDispatch } from '@/store';
import { getApiErrorMessage } from '@/lib/api-utils';
import { registerCustomer, registerSeller, signIn } from '@/lib/auth-api';
import { getCart } from '@/lib/cart-api';
import type { Realm } from '@/lib/api-client';
import type { User } from '@/types';
import {
  loginStart,
  loginSuccess,
  loginFailure,
  registerStart,
  registerFailure,
} from '@/store/slices/auth';
import { loadCart } from '@/store/slices/cart';

/** Only allow internal redirect targets (e.g. "/cart"), never external URLs. */
const safeRedirect = (value: string | null, fallback: string): string => {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return fallback;
};

/**
 * Each audience is its own account realm (docs/ACCOUNTS.md): a shopper signs
 * in at `/auth/*`, a seller at `/seller/auth/*`, staff at `/admin/auth/*`. The
 * same email can hold an account in each, independently.
 */
const AUDIENCES: Record<AuthAudience, { realm: Realm; home: string }> = {
  customer: { realm: 'customer', home: '/' },
  seller: { realm: 'seller', home: '/seller' },
  staff: { realm: 'admin', home: '/admin' },
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

  const { realm, home } = AUDIENCES[audience];
  const redirectTo = safeRedirect(searchParams.get('redirect'), home);

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

  const completeLogin = async (user: User) => {
    dispatch(loginSuccess(user));
    // Hydrate the bag so the header badge is immediately correct.
    if (realm === 'customer') {
      try {
        dispatch(loadCart(await getCart()));
      } catch {
        /* non-fatal */
      }
    }
    router.push(redirectTo);
  };

  const handleSignIn = async (data: Record<string, string>) => {
    setIsLoading(true);
    setError(undefined);
    dispatch(loginStart());
    try {
      await completeLogin(await signIn(realm, data.email.trim(), data.password));
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
      const user =
        realm === 'seller'
          ? await registerSeller({
              fullName: data.fullName.trim(),
              phone: data.phone.trim(),
              email: data.email.trim(),
              password: data.password,
            })
          : await registerCustomer({
              firstName: data.firstName.trim(),
              lastName: data.lastName?.trim() || undefined,
              email: data.email.trim(),
              password: data.password,
              phone: data.phone?.trim() || undefined,
            });
      await completeLogin(user);
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
