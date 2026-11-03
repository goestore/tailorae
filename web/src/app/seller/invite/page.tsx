'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { Button, LoadingSpinner, Logo } from '@/components/common';
import { signOut } from '@/lib/auth-api';
import { ROLE_LABELS, acceptInvite, setActiveSeller, type Membership } from '@/lib/seller-api';
import type { AppDispatch, RootState } from '@/store';
import { logout } from '@/store/slices/auth';

/**
 * Where the "you have been invited" email lands (`/seller/invite?token=…`).
 *
 * The invite is addressed to an email, and only a seller account with that
 * email can accept it. So: signed out, the page offers to sign in or create
 * a seller account and brings the person back here; signed in, one button
 * joins the shop (`POST /seller/invites/accept`) and opens it.
 */
function InviteAcceptance() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<Membership | null>(null);

  const here = `/seller/invite?token=${encodeURIComponent(token)}`;
  const back = encodeURIComponent(here);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const membership = await acceptInvite(token);
      setJoined(membership);
      // Open the shop just joined, not whichever one the person had before.
      setActiveSeller(membership.sellerId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchAccount = async () => {
    await signOut('seller');
    setActiveSeller(null);
    dispatch(logout());
    router.push(`/seller/login?redirect=${back}`);
  };

  let body: React.ReactNode;
  if (!token) {
    body = (
      <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>
        This link is missing its invite code. Open the link from the email again, or ask the shop to send a new
        invite.
      </p>
    );
  } else if (!isInitialized) {
    body = <LoadingSpinner className="min-h-[20vh]" />;
  } else if (joined) {
    body = (
      <>
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          You have joined <strong className="text-ink">{joined.shopName}</strong> as{' '}
          {ROLE_LABELS[joined.role].toLowerCase()}.
        </p>
        <Link href="/seller" className="btn btn-primary mt-5">
          Open Seller Central
        </Link>
      </>
    );
  } else if (!user) {
    body = (
      <>
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          Sign in with the seller account for the email address the invite was sent to — or create one with that
          address. You will come straight back here to join.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/seller/login?redirect=${back}`} className="btn btn-primary">
            Sign in
          </Link>
          <Link href={`/seller/register?redirect=${back}`} className="btn btn-outline">
            Create a seller account
          </Link>
        </div>
        <p className="m-0 mt-4 text-meta" style={{ color: 'var(--ink-3)' }}>
          A seller account is separate from a shopping account, even with the same email.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <p className="m-0 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          You are signed in as <strong className="text-ink">{user.email}</strong>. Join the shop that invited you?
        </p>
        {error && <p className="alert alert-error mt-4 text-sm">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button loading={busy} onClick={accept}>
            Join the shop
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void switchAccount()}>
            Use another account
          </Button>
        </div>
      </>
    );
  }

  return (
    <main className="section-y">
      <div className="mx-auto px-4" style={{ maxWidth: '560px' }}>
        <Link href="/seller" aria-label="Seller Central" className="inline-block">
          <Logo alt="TAILORAE" className="h-[14px]" />
        </Link>
        <div className="mt-6 border border-line bg-surface-2 p-6 md:p-8">
          <h1 className="m-0 text-ink" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
            Join a shop on TAILORAE
          </h1>
          <div className="mt-3">{body}</div>
        </div>
      </div>
    </main>
  );
}

export default function SellerInvitePage() {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-screen" size="lg" />}>
      <InviteAcceptance />
    </Suspense>
  );
}
