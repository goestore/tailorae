'use client';

import React, { Suspense } from 'react';
import { ResetPassword } from '@/components/auth';
import { LoadingSpinner } from '@/components/common';

/** A seller's password reset, opened from the emailed link (`?token=…&realm=seller`). */
export default function SellerResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-screen" size="lg" />}>
      <ResetPassword realm="seller" />
    </Suspense>
  );
}
