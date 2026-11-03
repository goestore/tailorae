'use client';

import React, { Suspense } from 'react';
import { ResetPassword } from '@/components/auth';
import { LoadingSpinner } from '@/components/common';

/**
 * Step two of the password reset, opened from the emailed link
 * (`?token=…&realm=customer|admin`).
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
