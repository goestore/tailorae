'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AuthForm, type AuthField } from './AuthForm';
import { AuthShell } from './AuthShell';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-api';

type AuthMode = 'signin' | 'signup';
export type AuthAudience = 'customer' | 'seller' | 'staff';

interface AuthToggleProps {
  /** Which tab is open initially ('/auth/login' → signin, '/auth/register' → signup). */
  defaultMode?: AuthMode;
  isLoading?: boolean;
  error?: string;
  onSignIn?: (data: Record<string, string>) => Promise<void>;
  onSignUp?: (data: Record<string, string>) => Promise<void>;
  /** Called whenever the user switches tabs (e.g. to clear a stale error). */
  onModeChange?: (mode: AuthMode) => void;
  /** Shoppers, sellers and staff each get their own wording; staff have no sign-up. */
  audience?: AuthAudience;
}

const CUSTOMER_LINK = (
  <>
    Shopping instead?{' '}
    <Link href="/auth/login" className="text-ink underline underline-offset-2">
      Customer sign in
    </Link>
  </>
);

const COPY: Record<
  AuthAudience,
  {
    eyebrow?: string;
    homeHref: string;
    title: Record<AuthMode, string>;
    description: Record<AuthMode, string>;
    footer: React.ReactNode;
    /** Where "Forgotten your password?" leads — the realm's own reset. */
    forgotHref: string;
    /** Staff accounts are issued by a super admin, never signed up for. */
    signUp: boolean;
  }
> = {
  customer: {
    homeHref: '/',
    forgotHref: '/auth/forgot-password',
    signUp: true,
    title: { signin: 'Welcome back', signup: 'Create an account' },
    description: {
      signin: 'Sign in to manage your orders and saved details.',
      signup: 'A faster way to manage orders and custom work.',
    },
    footer: (
      <>
        Selling on TAILORAE?{' '}
        <Link href="/seller/login" className="text-ink underline underline-offset-2">
          Seller sign in
        </Link>
      </>
    ),
  },
  seller: {
    eyebrow: 'Seller Central',
    homeHref: '/sell',
    forgotHref: '/seller/forgot-password',
    signUp: true,
    title: { signin: 'Sign in to your shop', signup: 'Start selling' },
    description: {
      signin: 'Manage your listings, orders and payouts.',
      signup: 'Create your seller account. You will add your business details next.',
    },
    footer: CUSTOMER_LINK,
  },
  staff: {
    eyebrow: 'Staff',
    homeHref: '/',
    forgotHref: '/auth/forgot-password?realm=admin',
    signUp: false,
    title: { signin: 'Sign in to the console', signup: 'Sign in to the console' },
    description: {
      signin: 'For the TAILORAE team. Accounts are issued by an administrator.',
      signup: 'For the TAILORAE team. Accounts are issued by an administrator.',
    },
    footer: CUSTOMER_LINK,
  },
};

const EMAIL_FIELD: AuthField = {
  name: 'email',
  label: 'Email Address',
  type: 'email',
  placeholder: 'you@example.com',
  required: true,
  autoComplete: 'email',
};

const SIGN_IN_FIELDS: AuthField[] = [
  EMAIL_FIELD,
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Enter your password',
    required: true,
    autoComplete: 'current-password',
  },
];

// `minLength` mirrors the API's own rule, so its ten-character floor is
// enforced before the request rather than reported back as a server error.
const NEW_PASSWORD_FIELDS: AuthField[] = [
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Create a strong password',
    required: true,
    autoComplete: 'new-password',
    minLength: PASSWORD_MIN_LENGTH,
    helpText: `At least ${PASSWORD_MIN_LENGTH} characters — a short phrase works well.`,
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

const CUSTOMER_SIGN_UP_FIELDS: AuthField[] = [
  {
    name: 'firstName',
    label: 'First Name',
    type: 'text',
    placeholder: 'First name',
    required: true,
    autoComplete: 'given-name',
  },
  {
    name: 'lastName',
    label: 'Last Name',
    type: 'text',
    placeholder: 'Last name',
    required: true,
    autoComplete: 'family-name',
  },
  EMAIL_FIELD,
  {
    name: 'phone',
    label: 'Mobile Number (optional)',
    type: 'tel',
    placeholder: '10-digit mobile number',
    autoComplete: 'tel',
  },
  ...NEW_PASSWORD_FIELDS,
];

/** A seller account is a person: their full name, and a phone that gets a code to confirm. */
const SELLER_SIGN_UP_FIELDS: AuthField[] = [
  {
    name: 'fullName',
    label: 'Full Name',
    type: 'text',
    placeholder: 'Your full name',
    required: true,
    autoComplete: 'name',
  },
  EMAIL_FIELD,
  {
    name: 'phone',
    label: 'Mobile Number',
    type: 'tel',
    placeholder: '10-digit mobile number',
    required: true,
    autoComplete: 'tel',
    helpText: 'We send a code to this number to confirm it.',
  },
  ...NEW_PASSWORD_FIELDS,
];

export const AuthToggle: React.FC<AuthToggleProps> = ({
  defaultMode = 'signin',
  isLoading = false,
  error,
  onSignIn,
  onSignUp,
  onModeChange,
  audience = 'customer',
}) => {
  const copy = COPY[audience];
  const [mode, setMode] = useState<AuthMode>(copy.signUp ? defaultMode : 'signin');
  const signUpFields = audience === 'seller' ? SELLER_SIGN_UP_FIELDS : CUSTOMER_SIGN_UP_FIELDS;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    onModeChange?.(nextMode);
  };

  const handleFormSubmit = async (data: Record<string, string>) => {
    if (mode === 'signin' && onSignIn) {
      await onSignIn(data);
    } else if (mode === 'signup' && onSignUp) {
      await onSignUp(data);
    }
  };

  const tabs = (
    <div className="mb-8 grid grid-cols-2 gap-px bg-line">
      {(['signin', 'signup'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => switchMode(tab)}
          aria-pressed={mode === tab}
          className={`px-4 py-3 text-sm transition-colors ${
            mode === tab ? 'bg-ink text-white' : 'bg-surface text-ink-2 hover:bg-surface-2'
          }`}
        >
          {tab === 'signin' ? 'Sign In' : 'Sign Up'}
        </button>
      ))}
    </div>
  );

  return (
    <AuthShell
      nav={copy.signUp ? tabs : undefined}
      eyebrow={copy.eyebrow}
      homeHref={copy.homeHref}
      title={copy.title[mode]}
      description={copy.description[mode]}
      footer={copy.footer}
    >
      {/* Remounted per mode so a half-typed password never carries across. */}
      <AuthForm
        key={mode}
        onSubmit={handleFormSubmit}
        fields={mode === 'signin' ? SIGN_IN_FIELDS : signUpFields}
        submitButtonText={mode === 'signin' ? 'Sign In' : 'Create Account'}
        isLoading={isLoading}
        error={error}
        aside={
          mode === 'signin' ? (
            <div className="-mt-1 text-right">
              <Link
                href={copy.forgotHref}
                className="text-meta underline underline-offset-2 hover:text-ink"
                style={{ color: 'var(--ink-3)' }}
              >
                Forgotten your password?
              </Link>
            </div>
          ) : null
        }
      />
    </AuthShell>
  );
};
