'use client';

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { RootState } from '@/store';

export interface NotifyMeButtonProps {
  productId: string;
  /** Pass the selected size so a restock of that size is what gets flagged. */
  variantId?: string;
  variantLabel?: string;
  className?: string;
}

/**
 * Back-in-stock signup, shown in place of Add to cart when there is nothing to
 * add. Without it an out-of-stock product is a dead end: the shopper leaves and
 * we never learn there was demand.
 *
 * Signed-in shoppers get their address prefilled; everyone else types one, so
 * this works without an account.
 */
export const NotifyMeButton: React.FC<NotifyMeButtonProps> = ({
  productId,
  variantId,
  variantLabel,
  className = '',
}) => {
  const { user } = useSelector((state: RootState) => state.auth);

  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState(user?.email ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      toast.error('Enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/stock-notify', {
        productId,
        variantId: variantId ?? undefined,
        email: address,
      });
      setIsDone(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not save that request.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <div
        className={`border border-line bg-surface-2 px-4 py-3.5 text-[14px] ${className}`.trim()}
        role="status"
      >
        <p className="m-0 font-semibold text-ink">We will email you</p>
        <p className="m-0 mt-1" style={{ color: 'var(--ink-3)' }}>
          As soon as {variantLabel ? `size ${variantLabel}` : 'this piece'} is back, {email} hears
          about it first.
        </p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`btn btn-secondary btn-lg btn-block ${className}`.trim()}
      >
        Notify me when available
      </button>
    );
  }

  return (
    <form onSubmit={submit} className={`border border-line p-4 ${className}`.trim()}>
      <label
        htmlFor="notify-email"
        className="m-0 block text-[10.5px] font-bold uppercase leading-none tracking-[0.12em]"
        style={{ color: 'var(--ink-3)' }}
      >
        Email me when {variantLabel ? `size ${variantLabel} is` : 'this is'} back
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          id="notify-email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="h-11 min-w-0 flex-1 border border-line bg-white px-3 text-[14px] text-ink placeholder-neutral-400 focus:border-[var(--ink-3)] focus:outline-none"
        />
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Notify me'}
        </button>
      </div>
      <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
        One email about this piece. No marketing unless you ask for it.
      </p>
    </form>
  );
};
