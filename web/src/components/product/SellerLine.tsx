import React from 'react';
import Link from 'next/link';
import type { Seller } from '@/types';

export interface SellerLineProps {
  seller: Seller;
  className?: string;
}

/**
 * Who is actually selling this.
 *
 * On a marketplace the shopper is buying from a shop, not from the site, and
 * that has to be said on the product page — it is what decides who ships it,
 * who answers a question about it, and who a return goes back to. Anything
 * less makes every listing look like house stock.
 */
export const SellerLine: React.FC<SellerLineProps> = ({ seller, className = '' }) => {
  const hasRating = typeof seller.rating === 'number' && (seller.ratingCount ?? 0) > 0;

  return (
    <div className={`border border-line bg-surface-2 px-4 py-3 ${className}`.trim()}>
      <p
        className="m-0 text-[10.5px] font-bold uppercase leading-none tracking-[0.12em]"
        style={{ color: 'var(--ink-3)' }}
      >
        Sold by
      </p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <Link
          href={`/sellers/${seller.shopSlug}`}
          className="text-[15px] font-semibold text-ink no-underline hover:underline"
        >
          {seller.shopName}
        </Link>

        {/* Verification is the platform's word, not the seller's, so it is
            stated plainly rather than dressed up as a badge of quality. */}
        {seller.isVerified && (
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'var(--success, #1B7F4B)' }}
          >
            Verified seller
          </span>
        )}

        {hasRating && (
          <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            <span aria-hidden="true" style={{ color: 'var(--brand)' }}>
              ★
            </span>{' '}
            {seller.rating!.toFixed(1)} ({seller.ratingCount})
          </span>
        )}
      </div>
    </div>
  );
};
