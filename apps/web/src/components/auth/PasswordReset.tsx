'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { AuthForm, type AuthField } from './AuthForm';
import { AuthShell } from './AuthShell';
import { REALMS, type Realm } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { PASSWORD_MIN_LENGTH, requestPasswordReset, resetPassword } from '@/lib/auth-api';

/**
 * The two password-reset steps, for any account realm. Each realm resets its
 * own accounts (`/auth/*`, `/seller/auth/*`, `/admin/auth/*`), so the pages
 * take the realm from their route (`/seller/…`) or from the `?realm=` the
 * emailed link carries.
 */

const REALM_PARAM: Record<string, Realm> = {
  customer: 'customer',
  seller: 'seller',
  admin: 'admin',
};

/** The realm a shared page serves: its own, else the link's `?realm=`, else customer. */
export function useResetRealm(fixed?: Realm): Realm {
  const searchParams = useSearchParams();
  return fixed ?? REALM_PARAM[searchParams.get('realm') ?? ''] ?? 'customer';
}

const forgotHref = (realm: Realm) =>
  realm === 'seller'
    ? '/seller/forgot-password'
    : realm === 'admin'
      ? '/auth/forgot-password?realm=admin'
      : '/auth/forgot-password';

const EMAIL_FIELDS: AuthField[] = [
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    placeholder: 'you@example.com',
    required: true,
    autoComplete: 'email',
    helpText: 'The address you signed up with.',
  },
];

const PASSWORD_FIELDS: AuthField[] = [
  {
    name: 'password',
    label: 'New Password',
    type: 'password',
    placeholder: 'Choose a new password',
    required: true,
    autoComplete: 'new-password',
    minLength: PASSWORD_MIN_LENGTH,
    helpText: `At least ${PASSWORD_MIN_LENGTH} characters.`,
  },
  {
    name: 'confirmPassword',
    label: 'Confirm Password',
    type: 'password',
    placeholder: 'Type it once more',
    required: true,
    autoComplete: 'new-password',
    matches: { field: 'password', message: 'The two passwords do not match' },
  },
];

const EYEBROW: Record<Realm, string | undefined> = {
  customer: undefined,
  seller: 'Seller Central',
  admin: 'Staff',
};

/** Step one: ask for the address and let the API mail a link to the reset page. */
export function ForgotPassword({ realm: fixed }: { realm?: Realm }) {
  const realm = useResetRealm(fixed);
  const signIn = REALMS[realm].signInPage;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const requestReset = async (data: Record<string, string>) => {
    const email = data.email.trim().toLowerCase();
    setIsLoading(true);
    setError(undefined);
    try {
      await requestPasswordReset(realm, email);
      setSentTo(email);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send a reset link. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthShell
        eyebrow={EYEBROW[realm]}
        title="Check your inbox"
        description="If we recognise that address, a link is on its way."
      >
        <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
          We have sent reset instructions to{' '}
          <span className="font-semibold text-ink">{sentTo}</span>. The link opens a page where you
          choose a new password. Give it a few minutes, and look in your spam folder before trying
          again.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href={signIn} className="btn btn-primary btn-lg btn-block">
            Back to sign in
          </Link>
          <button type="button" onClick={() => setSentTo(null)} className="btn btn-ghost btn-block">
            Use a different address
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={EYEBROW[realm]}
      title="Forgotten your password?"
      description="Give us the address on your account and we will send a link to set a new one."
    >
      <AuthForm
        onSubmit={requestReset}
        fields={EMAIL_FIELDS}
        submitButtonText="Send reset link"
        isLoading={isLoading}
        error={error}
        aside={
          <div className="-mt-1 text-right">
            <Link
              href={signIn}
              className="text-meta underline underline-offset-2 hover:text-ink"
              style={{ color: 'var(--ink-3)' }}
            >
              I remember it after all
            </Link>
          </div>
        }
      />
    </AuthShell>
  );
}

/** Step two, opened from the emailed link: `?token=…&realm=…`. */
export function ResetPassword({ realm: fixed }: { realm?: Realm }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const realm = useResetRealm(fixed);
  const signIn = REALMS[realm].signInPage;
  // The token arrives in the emailed link. Without it there is nothing to
  // verify against, so the form is not offered at all.
  const token = searchParams.get('token')?.trim() ?? '';

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (data: Record<string, string>) => {
    setIsLoading(true);
    setError(undefined);
    try {
      await resetPassword(realm, token, data.password);
      toast.success('Password updated. Sign in with your new one.');
      router.push(signIn);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not reset your password. The link may have expired.'));
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell
        eyebrow={EYEBROW[realm]}
        title="That link is incomplete"
        description="A reset link carries a one-time token, and this one has none."
      >
        <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
          Some mail clients break long links across lines. Copy the whole address from the email, or
          ask for a fresh one.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href={forgotHref(realm)} className="btn btn-primary btn-lg btn-block">
            Send a new link
          </Link>
          <Link href={signIn} className="btn btn-ghost btn-block">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={EYEBROW[realm]}
      title="Set a new password"
      description="Choose something you have not used here before."
    >
      <AuthForm
        onSubmit={submit}
        fields={PASSWORD_FIELDS}
        submitButtonText="Save new password"
        isLoading={isLoading}
        error={error}
      />
    </AuthShell>
  );
}
