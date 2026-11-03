'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';
import { addToCart } from '@/lib/cart-api';
import { useSignedIn } from '@/hooks/useSignedIn';
import { useAppDispatch } from '@/store';
import { loadCart } from '@/store/slices/cart';
import type { Product } from '@/types';

export interface QuickAddButtonProps {
  product: Product;
  /** Where the card itself points — used for the login redirect and for
   *  products that cannot be added without choosing options first. */
  href: string;
}

/**
 * The bar that appears over a product card's image on hover. It only quick-adds
 * plain stock items: a customizable product needs its required options filled in,
 * which the detail page validates, so this sends the shopper there instead.
 *
 * Lives inside the card's <Link>, so every click has to stop the navigation the
 * card would otherwise do.
 */
export const QuickAddButton: React.FC<QuickAddButtonProps> = ({ product, href }) => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const signedIn = useSignedIn();
  const [isAdding, setIsAdding] = useState(false);

  // A listing row carries no sizes, but its colour cards say it has variants;
  // the bag needs a size chosen, so those go to the product page too.
  const needsOptions = product.isCustomizable || (product.colors?.length ?? 0) > 0;
  const label = product.isCustomizable ? 'Customize' : 'Add to Cart';

  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (needsOptions) {
      router.push(href);
      return;
    }

    if (signedIn === false) {
      router.push(`/auth/login?redirect=${encodeURIComponent(href)}`);
      return;
    }

    setIsAdding(true);
    try {
      const cart = await addToCart({
        productId: product.id,
        quantity: Math.max(1, product.minOrderQuantity || 1),
      });
      dispatch(loadCart(cart));
      toast.success('Added to cart');
    } catch (err) {
      // Sizes the listing could not see: let the product page ask for one.
      if (getApiErrorStatus(err) === 400 && /choose a size/i.test(getApiErrorMessage(err))) {
        router.push(href);
        return;
      }
      toast.error(getApiErrorMessage(err, 'Could not add to cart.'));
    } finally {
      setIsAdding(false);
    }
  };

  // Ink, not yellow: half the product photos are shot on a yellow backdrop,
  // where a yellow bar disappears (same rule as .badge-discount).
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isAdding}
      aria-label={`${label} — ${product.name}`}
      className="btn btn-secondary absolute inset-x-2 bottom-2 z-10 rounded-none px-2 text-small focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
    >
      {isAdding ? 'Adding…' : label}
    </button>
  );
};
