'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AuthForm, type AuthField } from './AuthForm';
import { AuthShell } from './AuthShell';

type AuthMode = 'signin' | 'signup';

interface AuthToggleProps {
  /** Which tab is open initially ('/auth/login' → signin, '/auth/register' → signup). */
  defaultMode?: AuthMode;
  isLoading?: boolean;
  error?: string;
  onSignIn?: (data: Record<string, string>) => Promise<void>;
  onSignUp?: (data: Record<string, string>) => Promise<void>;
  /** Called whenever the user switches tabs (e.g. to clear a stale error). */
  onModeChange?: (mode: AuthMode) => void;
}

const SIGN_IN_FIELDS: AuthField[] = [
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    placeholder: 'you@example.com',
    required: true,
    autoComplete: 'email',
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Enter your password',
    required: true,
    autoComplete: 'current-password',
  },
];

// `minLength` mirrors the API's own rule, so an eight-character floor is
// enforced before the request rather than reported back as a server error.
const SIGN_UP_FIELDS: AuthField[] = [
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
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    placeholder: 'you@example.com',
    required: true,
    autoComplete: 'email',
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Create a strong password',
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

export const AuthToggle: React.FC<AuthToggleProps> = ({
  defaultMode = 'signin',
  isLoading = false,
  error,
  onSignIn,
  onSignUp,
  onModeChange,
}) => {
  const [mode, setMode] = useState<AuthMode>(defaultMode);

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
      nav={tabs}
      title={mode === 'signin' ? 'Welcome back' : 'Create an account'}
      description={
        mode === 'signin'
          ? 'Sign in to manage your orders and saved details.'
          : 'A faster way to manage orders and custom work.'
      }
    >
      {/* Remounted per mode so a half-typed password never carries across. */}
      <AuthForm
        key={mode}
        onSubmit={handleFormSubmit}
        fields={mode === 'signin' ? SIGN_IN_FIELDS : SIGN_UP_FIELDS}
        submitButtonText={mode === 'signin' ? 'Sign In' : 'Create Account'}
        isLoading={isLoading}
        error={error}
        aside={
          mode === 'signin' ? (
            <div className="-mt-1 text-right">
              <Link
                href="/auth/forgot-password"
                className="text-[13px] underline underline-offset-2 hover:text-ink"
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
