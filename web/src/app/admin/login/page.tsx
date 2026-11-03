'use client';

import React, { Suspense } from 'react';
import { AuthPage } from '@/components/auth';
import { LoadingSpinner } from '@/components/common';

/** Staff sign-in for the admin console (`/admin/auth/login`). No sign-up: staff are invited. */
export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-screen" size="lg" />}>
      <AuthPage audience="staff" defaultMode="signin" />
    </Suspense>
  );
}
