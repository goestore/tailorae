'use client';

import React from 'react';
import { AuthToggle } from '@/components/auth';

export default function LoginPage() {
  const handleSignIn = async (data: Record<string, string>) => {
    console.log('Login attempt:', data);
    // TODO: Implement login logic
  };

  const handleSignUp = async (data: Record<string, string>) => {
    console.log('Registration attempt:', data);
    // TODO: Implement registration logic
  };

  return (
    <AuthToggle
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
    />
  );
}
