'use client';

import React, { Suspense } from 'react';
import { ForgotPassword } from '@/components/auth';
import { LoadingSpinner } from '@/components/common';

/** Step one of a seller's password reset: mails a link to `/seller/reset-password`. */
export default function SellerForgotPasswordPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-screen" size="lg" />}>
      <ForgotPassword realm="seller" />
    </Suspense>
  );
}
