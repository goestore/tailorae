'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { RootState } from '@/store';
import { WishlistItem } from '@/types';

export interface WishlistButtonProps {
  productId: string;
  productName?: string;
  /** `button` for the product page, `icon` for a compact heart on a card. */
  variant?: 'button' | 'icon';
  className?: string;
}

const Heart: React.FC<{ filled: boolean; className?: string }> = ({ filled, className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.8 6.6a5.1 5.1 0 0 0-7.2 0L12 8.2l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2l1.6 1.6L12 22.6l7.2-7.2 1.6-1.6a5.1 5.1 0 0 0 0-7.2Z" />
  </svg>
);

/**
 * Save / unsave a product.
 *
 * Membership is read once per mount from `/users/wishlist` rather than being
 * threaded down from the page, so the button is correct on a hard refresh and
 * can be dropped anywhere. Signed-out shoppers are sent to login with a
 * redirect back rather than being shown a control that silently fails.
 */
export const WishlistButton: React.FC<WishlistButtonProps> = ({
  productId,
  productName,
  variant = 'button',
  className = '',
}) => {
  const router = useRouter();
  const { user } = useSelector((state: RootState) => state.auth);

  // What the server said about this product, for the signed-in shopper. Signed
  // out there is nothing to say, so the heart is read as empty rather than
  // reset from an effect — which left a filled heart on screen for a frame
  // after signing out.
  const [savedForUser, setSavedForUser] = useState(false);
  const isSaved = Boolean(user) && savedForUser;
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiClient
      .get('/users/wishlist')
      .then((res) => {
        if (cancelled) return;
        const wishlist: WishlistItem[] = res.data?.data?.wishlist ?? [];
        setSavedForUser(wishlist.some((item) => item.productId === productId));
      })
      .catch(() => {
        // An unreadable wishlist should not block saving — the add call is
        // idempotent server-side, so the worst case is an unfilled heart.
      });
    return () => {
      cancelled = true;
    };
  }, [user, productId]);

  const toggle = async () => {
    if (!user) {
      router.push(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (isBusy) return;

    setIsBusy(true);
    const next = !isSaved;
    setSavedForUser(next);
    try {
      if (next) {
        await apiClient.post('/users/wishlist', { productId });
        toast.success('Saved to wishlist');
      } else {
        await apiClient.delete(`/users/wishlist/${productId}`);
        toast.success('Removed from wishlist');
      }
    } catch (err) {
      setSavedForUser(!next);
      toast.error(getApiErrorMessage(err, 'Could not update your wishlist.'));
    } finally {
      setIsBusy(false);
    }
  };

  const label = isSaved
    ? `Remove ${productName ?? 'this product'} from wishlist`
    : `Save ${productName ?? 'this product'} to wishlist`;

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isBusy}
        aria-pressed={isSaved}
        aria-label={label}
        title={label}
        className={`flex h-9 w-9 items-center justify-center border border-line bg-white/95 transition-colors hover:border-[var(--ink-3)] disabled:opacity-40 ${className}`.trim()}
        style={{ color: isSaved ? 'var(--sale)' : 'var(--ink-3)' }}
      >
        <Heart filled={isSaved} className="h-[18px] w-[18px]" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isBusy}
      aria-pressed={isSaved}
      className={`btn btn-outline btn-lg btn-block ${className}`.trim()}
    >
      <Heart
        filled={isSaved}
        className="mr-2 h-4 w-4"
      />
      {isSaved ? 'Saved to wishlist' : 'Save to wishlist'}
    </button>
  );
};
