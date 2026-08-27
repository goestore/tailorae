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
    <main className="min-h-screen flex items-center justify-center py-8 md:py-12">
      <div className="w-full max-w-md">
        <Card className="p-5">
          {/* Toggle Buttons */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={() => switchMode('signin')}
              className={`flex-1 py-2 px-4 font-semibold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-primary-500 text-black font-bold'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchMode('signup')}
              className={`flex-1 py-2 px-4 font-semibold rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-primary-500 text-black font-bold'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form Content */}
          {mode === 'signin' && (
            <div>
              <h1 className="text-3xl font-bold text-center mb-2">Welcome Back</h1>
              <p className="text-center text-gray-600 mb-8">Sign in to your account</p>

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
              <h1 className="text-3xl font-bold text-center mb-2">Create Account</h1>
              <p className="text-center text-gray-600 mb-8">Join us and start shopping</p>

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
