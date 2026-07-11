'use client';

import React, { useState } from 'react';
import { AuthForm } from './AuthForm';
import { Card } from '@/components/common';

type AuthMode = 'signin' | 'signup';

interface AuthToggleProps {
  onSignIn?: (data: Record<string, string>) => Promise<void>;
  onSignUp?: (data: Record<string, string>) => Promise<void>;
}

export const AuthToggle: React.FC<AuthToggleProps> = ({
  onSignIn,
  onSignUp,
}) => {
  const [mode, setMode] = useState<AuthMode>('signin');

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
      name: 'fullName',
      label: 'Full Name',
      type: 'text' as const,
      placeholder: 'John Doe',
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
      name: 'phone',
      label: 'Phone Number',
      type: 'tel' as const,
      placeholder: '+91 9876543210',
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

  const handleSignInClick = () => {
    setMode('signin');
  };

  const handleSignUpClick = () => {
    setMode('signup');
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
        <Card className="p-8">
          {/* Toggle Buttons */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={handleSignInClick}
              className={`flex-1 py-2 px-4 font-semibold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={handleSignUpClick}
              className={`flex-1 py-2 px-4 font-semibold rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-yellow-400 text-black font-bold'
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
              />
            </div>
          )}
        </Card>
      </div>
    </main>
  );
};
