'use client';

import React, { Suspense } from 'react';
import { ForgotPassword } from '@/components/auth';
import { LoadingSpinner } from '@/components/common';

/**
 * Step one of the password reset. Serves shoppers, and staff via
 * `?realm=admin`; sellers have their own copy at `/seller/forgot-password`.
 */
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-screen" size="lg" />}>
      <ForgotPassword />
    </Suspense>
  );
}
