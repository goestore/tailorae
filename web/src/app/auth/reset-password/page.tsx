'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { AuthForm, AuthShell, type AuthField } from '@/components/auth';
import { LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';

const FIELDS: AuthField[] = [
  {
    name: 'password',
    label: 'New Password',
    type: 'password',
    placeholder: 'Choose a new password',
    required: true,
    autoComplete: 'new-password',
    minLength: 8,
    helpText: 'At least 8 characters.',
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

function ResetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The token arrives in the emailed link. Without it there is nothing to
  // verify against, so the form is not offered at all.
  const token = searchParams.get('token')?.trim() ?? '';

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isUnavailable, setIsUnavailable] = useState(false);

  const submit = async (data: Record<string, string>) => {
    setIsLoading(true);
    setError(undefined);
    try {
      // The API reads `password`. A `newPassword` was sent alongside it while
      // the route was still a stub and the field name unsettled; the route has
      // since landed and reads only this one.
      await apiClient.post('/auth/reset-password', {
        token,
        password: data.password,
      });
      toast.success('Password updated. Sign in with your new one.');
      router.push('/auth/login');
    } catch (err) {
      if (getApiErrorStatus(err) === 501) {
        setIsUnavailable(true);
      } else {
        setError(getApiErrorMessage(err, 'Could not reset your password. The link may have expired.'));
      }
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

  if (!token) {
    return (
      <AuthShell
        title="That link is incomplete"
        description="A reset link carries a one-time token, and this one has none."
      >
        <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
          Some mail clients break long links across lines. Copy the whole address from the email, or
          ask for a fresh one.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/auth/forgot-password" className="btn btn-primary btn-lg btn-block">
            Send a new link
          </Link>
          <Link href="/auth/login" className="btn btn-ghost btn-block">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" description="Choose something you have not used here before.">
      <AuthForm
        onSubmit={submit}
        fields={FIELDS}
        submitButtonText="Save new password"
        isLoading={isLoading}
        error={error}
      />
    </AuthShell>
  );
}

/**
 * Step two of the password reset, opened from the emailed link.
 *
 * `useSearchParams` opts the tree into client rendering, so the form sits
 * behind a Suspense boundary and the shell still prerenders.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-screen" size="lg" />}>
      <ResetPassword />
    </Suspense>
  );
}
