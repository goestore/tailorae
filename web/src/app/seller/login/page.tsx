'use client';

import React, { Suspense } from 'react';
import { AuthPage } from '@/components/auth';
import { LoadingSpinner } from '@/components/common';

export default function SellerLoginPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-screen" size="lg" />}>
      <AuthPage audience="seller" defaultMode="signin" />
    </Suspense>
  );
}
