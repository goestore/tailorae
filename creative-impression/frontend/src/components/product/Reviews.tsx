'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Button } from '@/components/common';
import { useHydrated } from '@/hooks/useHydrated';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { RootState } from '@/store';
import { Review } from '@/types';

interface ReviewWithUser extends Review {
  user?: { firstName?: string | null; lastName?: string | null } | null;
}

export interface ReviewsProps {
  /** The id or slug the page was loaded with — the reviews route accepts both. */
  productRef: string;
  /** Denormalised on the product, used for the summary before reviews load. */
  rating: number;
  reviewCount: number;
  /** Called after a review is saved so the page can refresh its own average. */
  onSaved?: () => void;
}

const Stars: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <span className={className} aria-hidden="true" style={{ color: 'var(--brand)', letterSpacing: '1px' }}>
    {'★★★★★'.slice(0, Math.round(value))}
    <span style={{ color: 'var(--border-strong)' }}>{'★★★★★'.slice(Math.round(value))}</span>
  </span>
);

const reviewerName = (review: ReviewWithUser): string => {
  const first = review.user?.firstName?.trim();
  const lastInitial = review.user?.lastName?.trim()?.charAt(0);
  if (first) return lastInitial ? `${first} ${lastInitial}.` : first;
  return 'Verified shopper';
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Reviews on the product page.
 *
 * The API has been able to serve and accept these for a while; nothing on the
 * storefront ever asked for them, so the star rating in the product header was
 * pointing at a count no shopper could open. Writing is limited to signed-in
 * customers because the endpoint upserts one review per user per product, and
 * marks it verified when that user has a delivered order containing it.
 */
export const Reviews: React.FC<ReviewsProps> = ({
  productRef,
  rating,
  reviewCount,
  onSaved,
}) => {
  const { user } = useSelector((state: RootState) => state.auth);
  // The server has no session, so the signed-in control cannot be rendered
  // until the client has taken over. Reading `user` directly here made the
  // whole reviews subtree a hydration mismatch once this page began rendering
  // on the server.
  const hydrated = useHydrated();
  const canWrite = hydrated && user;

  const [reviews, setReviews] = useState<ReviewWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWriting, setIsWriting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ rating: 5, title: '', comment: '' });

  // Nothing is set synchronously: the effect below only starts the fetch, and
  // every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      apiClient
        .get(`/products/${encodeURIComponent(productRef)}/reviews`)
        .then((res) => setReviews(res.data?.data?.reviews ?? []))
        .catch(() => setReviews([]))
        .finally(() => setIsLoading(false)),
    [productRef]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await apiClient.post(`/products/${encodeURIComponent(productRef)}/reviews`, {
        rating: form.rating,
        title: form.title.trim() || undefined,
        comment: form.comment.trim() || undefined,
      });
      toast.success('Thanks — your review is saved.');
      setIsWriting(false);
      setForm({ rating: 5, title: '', comment: '' });
      load();
      onSaved?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not save your review.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // The denormalised count on the product only counts published reviews, which
  // is also all this list can see — so they agree, and the header is used
  // while the list is still loading.
  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : rating;
  const total = reviews.length || reviewCount;

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="mx-auto mt-14 pt-10"
      style={{ maxWidth: '1240px', borderTop: '1px solid var(--border)' }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="m-0 text-[10.5px] font-bold uppercase leading-none tracking-[0.12em]"
            style={{ color: 'var(--ink-3)' }}
          >
            Reviews
          </p>
          <h2
            id="reviews-heading"
            className="m-0 mt-3 text-ink"
            style={{ fontSize: 'clamp(20px, 2.2vw, 28px)', letterSpacing: '-0.02em' }}
          >
            {total > 0 ? (
              <>
                {average.toFixed(1)} out of 5{' '}
                <span className="text-[15px] font-normal" style={{ color: 'var(--ink-3)' }}>
                  ({total} {total === 1 ? 'review' : 'reviews'})
                </span>
              </>
            ) : (
              'No reviews yet'
            )}
          </h2>
          {total > 0 && <Stars value={average} className="mt-2 inline-block text-lg" />}
        </div>

        {canWrite ? (
          !isWriting && (
            <Button variant="outline" onClick={() => setIsWriting(true)}>
              Write a review
            </Button>
          )
        ) : (
          <Link href="/auth/login?redirect=/products" className="btn btn-outline">
            Sign in to review
          </Link>
        )}
      </div>

      {isWriting && (
        <form onSubmit={submit} className="mt-6 border border-line p-5">
          <fieldset className="m-0 border-0 p-0">
            <legend
              className="m-0 p-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              Your rating
            </legend>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, rating: value }))}
                  aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
                  aria-pressed={form.rating === value}
                  className="text-2xl leading-none transition-transform hover:scale-110"
                  style={{ color: value <= form.rating ? 'var(--brand)' : 'var(--border-strong)' }}
                >
                  ★
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="review-title" className="mt-5 block text-sm font-medium text-ink">
            Headline (optional)
          </label>
          <input
            id="review-title"
            type="text"
            maxLength={120}
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Sums up your experience"
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-black placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          <label htmlFor="review-comment" className="mt-4 block text-sm font-medium text-ink">
            Your review
          </label>
          <textarea
            id="review-comment"
            rows={4}
            maxLength={2000}
            value={form.comment}
            onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))}
            placeholder="How is the fit, the fabric, the finish?"
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-black placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" loading={isSubmitting}>
              Submit review
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIsWriting(false)}>
              Cancel
            </Button>
          </div>
          <p className="m-0 mt-3 text-[12px]" style={{ color: 'var(--ink-3)' }}>
            One review per product. Submitting again replaces the one you left before.
          </p>
        </form>
      )}

      <div className="mt-8">
        {isLoading ? (
          <p className="m-0 text-[14px]" style={{ color: 'var(--ink-3)' }}>
            Loading reviews…
          </p>
        ) : reviews.length === 0 ? (
          <p className="m-0 max-w-[60ch] text-[15px]" style={{ color: 'var(--ink-3)' }}>
            Nobody has reviewed this piece yet. If you have bought it, yours will be the one that
            helps the next shopper decide.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
            {reviews.map((review) => (
              <li key={review.id} className="p-5" style={{ background: 'var(--surface)' }}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars value={review.rating} className="text-[15px]" />
                  <span className="text-[13px] font-semibold text-ink">{reviewerName(review)}</span>
                  {review.isVerified && (
                    <span
                      className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: 'var(--success, #1B7F4B)' }}
                    >
                      Verified purchase
                    </span>
                  )}
                  <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                {review.title && (
                  <p className="m-0 mt-2 text-[15px] font-semibold text-ink">{review.title}</p>
                )}
                {review.comment && (
                  <p
                    className="m-0 mt-1.5 max-w-[70ch] text-[14.5px]"
                    style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}
                  >
                    {review.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
