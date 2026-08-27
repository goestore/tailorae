'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { useAppDispatch } from '@/store';
import { loadCart } from '@/store/slices/cart';
import { Cart, Product } from '@/types';

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
  const [isAdding, setIsAdding] = useState(false);

  const needsOptions = product.isCustomizable;
  const label = needsOptions ? 'Customize' : 'Add to Cart';

  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (needsOptions) {
      router.push(href);
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push(`/auth/login?redirect=${encodeURIComponent(href)}`);
      return;
    }

    setIsAdding(true);
    try {
      const res = await apiClient.post('/cart/items', {
        productId: product.id,
        quantity: Math.max(1, product.minOrderQuantity || 1),
      });
      const cart = res.data?.data?.cart;
      if (cart) dispatch(loadCart(cart as unknown as Cart));
      toast.success('Added to cart');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not add to cart.'));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isAdding}
      aria-label={`${label} — ${product.name}`}
      className="btn btn-primary absolute inset-x-2 bottom-2 z-10 rounded-none px-2 text-[12px] focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
    >
      {isAdding ? 'Adding…' : label}
    </button>
  );
};
