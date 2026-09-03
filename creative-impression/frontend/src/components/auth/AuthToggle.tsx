'use client';

import React, { useState } from 'react';
import { AuthForm } from './AuthForm';
import { Card } from '@/components/common';

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

export const AuthToggle: React.FC<AuthToggleProps> = ({
  defaultMode = 'signin',
  isLoading = false,
  error,
  onSignIn,
  onSignUp,
  onModeChange,
}) => {
  const [mode, setMode] = useState<AuthMode>(defaultMode);

  const signInFields = [
    {
      name: 'email',
      label: 'Email Address',
      type: 'email' as const,
      placeholder: 'you@example.com',
      required: true,
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password' as const,
      placeholder: 'Enter your password',
      required: true,
    },
  ];

  const signUpFields = [
    {
      name: 'firstName',
      label: 'First Name',
      type: 'text' as const,
      placeholder: 'First name',
      required: true,
    },
    {
      name: 'lastName',
      label: 'Last Name',
      type: 'text' as const,
      placeholder: 'Last name',
      required: true,
    },
    {
      name: 'email',
      label: 'Email Address',
      type: 'email' as const,
      placeholder: 'you@example.com',
      required: true,
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password' as const,
      placeholder: 'Create a strong password',
      required: true,
    },
  ];

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

  return (
    <main className="auth-shell flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10 md:py-16">
      <div className="w-full max-w-md">
        <Card className="auth-card p-6 md:p-9">
          <p className="mb-7 text-center text-[11px] uppercase tracking-[0.16em] text-[var(--brand-700)]">Creative Impression</p>
          <div className="mb-8 grid grid-cols-2 gap-px bg-line">
            <button
              onClick={() => switchMode('signin')}
              className={`px-4 py-3 text-sm transition-colors ${
                mode === 'signin'
                  ? 'bg-ink text-white'
                  : 'bg-white text-ink-2 hover:bg-surface-2'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchMode('signup')}
              className={`px-4 py-3 text-sm transition-colors ${
                mode === 'signup'
                  ? 'bg-ink text-white'
                  : 'bg-white text-ink-2 hover:bg-surface-2'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form Content */}
          {mode === 'signin' && (
            <div>
              <h1 className="mb-2 text-center text-3xl">Welcome back</h1>
              <p className="mb-8 text-center text-ink-3">Sign in to manage your orders and saved details.</p>

              <AuthForm
                onSubmit={handleFormSubmit}
                fields={signInFields}
                submitButtonText="Sign In"
                isLoading={isLoading}
                error={error}
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <h1 className="mb-2 text-center text-3xl">Create an account</h1>
              <p className="mb-8 text-center text-ink-3">A faster way to manage orders and custom work.</p>

              <AuthForm
                onSubmit={handleFormSubmit}
                fields={signUpFields}
                submitButtonText="Create Account"
                isLoading={isLoading}
                error={error}
              />
            </div>
          )}
        </Card>
      </div>
    </main>
  );
};
