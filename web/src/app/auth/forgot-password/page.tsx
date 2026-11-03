'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AuthForm, AuthShell, type AuthField } from '@/components/auth';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';

const FIELDS: AuthField[] = [
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

/**
 * Step one of the password reset: ask for the address and let the API mail a
 * link to `/auth/reset-password`.
 *
 * The endpoint is a 501 stub until an email service is wired up, so that
 * status is handled as its own screen. Telling someone the reset is not
 * available yet and where to go instead is honest; leaving them to submit a
 * form that silently cannot work is not.
 */
export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const requestReset = async (data: Record<string, string>) => {
    const email = data.email.trim().toLowerCase();
    setIsLoading(true);
    setError(undefined);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSentTo(email);
    } catch (err) {
      if (getApiErrorStatus(err) === 501) {
        setIsUnavailable(true);
      } else {
        setError(getApiErrorMessage(err, 'Could not send a reset link. Please try again.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isUnavailable) {
    return (
      <AuthShell
        title="Not available yet"
        description="Resetting a password by email is not switched on yet."
      >
        <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
          Get in touch and we will verify who you are and reset it for you. Quote the email address
          on the account so we can find it.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/info/contact" className="btn btn-primary btn-lg btn-block">
            Contact support
          </Link>
          <Link href="/auth/login" className="btn btn-ghost btn-block">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your inbox" description="If we recognise that address, a link is on its way.">
        <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
          We have sent reset instructions to{' '}
          <span className="font-semibold text-ink">{sentTo}</span>. The link opens a page where you
          choose a new password. Give it a few minutes, and look in your spam folder before trying
          again.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/auth/login" className="btn btn-primary btn-lg btn-block">
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
      title="Forgotten your password?"
      description="Give us the address on your account and we will send a link to set a new one."
    >
      <AuthForm
        onSubmit={requestReset}
        fields={FIELDS}
        submitButtonText="Send reset link"
        isLoading={isLoading}
        error={error}
        aside={
          <div className="-mt-1 text-right">
            <Link
              href="/auth/login"
              className="text-[13px] underline underline-offset-2 hover:text-ink"
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
