'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { CartSummary, CouponField, type AppliedCoupon } from '@/components/cart';
import { Button, Card, SkeletonList, SkeletonPanel } from '@/components/common';
import { ProductThumb } from '@/components/product';
import { RecentlyViewed } from '@/components/product';
import { CustomWearQuoteBasket } from '@/components/custom-wear/CustomWearQuoteBasket';
import { apiClient } from '@/lib/api-client';
import { useHasToken } from '@/hooks/useHasToken';
import { calculateShipping, getApiErrorMessage } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';
import { AppDispatch, useAppSelector } from '@/store';
import { loadCart } from '@/store/slices/cart';
import { Cart } from '@/types';

/** Cart item shape returned by GET /cart. */
interface ApiCartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  /** The size and colour picked on the product page. */
  variant?: { id: string; size: string | null; color: string | null; sku: string } | null;
  quantity: number;
  price: number;
  customization?: Record<string, string> | null;
  product: {
    id: string;
    name: string;
    slug: string;
    thumbnail?: string;
    price: number;
    quantity: number;
  };
}

interface ApiCart {
  id: string;
  items: ApiCartItem[];
  subtotal: number;
  itemCount: number;
}

/**
 * One customisation answer, as a line of text.
 *
 * The values are heterogeneous — the product page stores typed answers, custom
 * wear stores placements and uploaded filenames — so an object interpolated
 * straight into a template printed "[object Object]" on the cart line of every
 * custom-wear order.
 */
const describeCustomization = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) {
    return value.length === 1 ? '1 item' : `${value.length} items`;
  }
  if (typeof value === 'object') return 'set';
  return String(value);
};

export default function CartPage() {
  const dispatch = useDispatch<AppDispatch>();
  const [cart, setCart] = useState<ApiCart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  // null until the browser takes over — see the hook.
  const hasToken = useHasToken();
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  // Custom-wear lines live in their own slice (they become quote requests, not
  // payable lines), so loading the server cart below never touches them.
  const hasQuoteLines = useAppSelector((state) => state.customWear.quoteLines.length > 0);

  // Stable identity so CouponField does not re-validate on every cart render.
  const handleCouponChange = useCallback((applied: AppliedCoupon | null) => {
    setCoupon(applied);
  }, []);

  const syncCart = useCallback(
    (nextCart: ApiCart) => {
      setCart(nextCart);
      dispatch(loadCart(nextCart as unknown as Cart));
    },
    [dispatch]
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    // No token means no fetch. `isLoading` is not cleared here — the render
    // guards below key off `hasToken`, which is already known by this point.
    if (!token) return;

    let cancelled = false;
    apiClient
      .get('/cart')
      .then((res) => {
        if (cancelled) return;
        const loaded = res.data?.data?.cart;
        if (loaded) syncCart(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your cart.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [syncCart]);

  const updateQuantity = async (item: ApiCartItem, nextQuantity: number) => {
    if (nextQuantity < 1) return;
    setBusyItemId(item.id);
    try {
      const res = await apiClient.patch(`/cart/items/${item.id}`, { quantity: nextQuantity });
      const updated = res.data?.data?.cart;
      if (updated) syncCart(updated);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not update quantity.'));
    } finally {
      setBusyItemId(null);
    }
  };

  const removeItem = async (item: ApiCartItem) => {
    setBusyItemId(item.id);
    try {
      const res = await apiClient.delete(`/cart/items/${item.id}`);
      const updated = res.data?.data?.cart;
      if (updated) syncCart(updated);
      toast.success('Removed from cart');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not remove this item.'));
    } finally {
      setBusyItemId(null);
    }
  };

  // Signed-out state
  if (hasToken === false) {
    return (
      <main className="section-y">
        <div className="container-max max-w-lg text-center">
          <Card className="p-10">
            <h1 className="mb-3 text-3xl">Your cart</h1>
            <p className="text-neutral-600 mb-6">Sign in to view and manage your cart.</p>
            <Link href="/auth/login?redirect=/cart">
              <Button variant="primary" size="lg" fullWidth>
                Sign In
              </Button>
            </Link>
            <Link href="/products" className="mt-3 block">
              <Button variant="ghost" fullWidth>
                Browse Products
              </Button>
            </Link>
          </Card>
        </div>
        {/* Custom wear needs no account: a guest can request the quote here. */}
        <div className="container-max mt-8">
          <CustomWearQuoteBasket />
        </div>
      </main>
    );
  }

  if (hasToken === null || (hasToken && isLoading)) {
    // The basket's own shape while it loads, so the page does not jump when
    // the lines arrive.
    return (
      <main className="section-y">
        <div className="container-max">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="border border-line p-4 md:col-span-2 md:p-6">
              <SkeletonList rows={3} />
            </div>
            <SkeletonPanel lines={4} />
          </div>
        </div>
      </main>
    );
  }

  const items = cart?.items ?? [];
  const subtotal =
    cart?.subtotal ?? items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = coupon?.discount ?? 0;
  const shipping = items.length > 0 ? calculateShipping(subtotal, discount) : 0;

  return (
    <main className="section-y">
      <div className="container-max">
        <header className="page-intro page-intro--compact"><p>Order review</p><h1>Your cart</h1></header>

        {error && <div className="alert alert-error mb-6">{error}</div>}

        <CustomWearQuoteBasket className="mb-6" />

        {items.length === 0 && hasQuoteLines ? null : items.length === 0 ? (
          <>
            {/* Matches the wishlist's empty state rather than the emoji that
                was here: a reason, a way forward, and a second route for
                someone who was not going to browse the whole catalogue. */}
            <div className="border border-line px-6 py-14 text-center" style={{ background: 'var(--surface-2)' }}>
              <p
                className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--ink-3)' }}
              >
                Your basket
              </p>
              <h2
                className="m-0 mt-3 text-ink"
                style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', letterSpacing: '-0.02em' }}
              >
                Nothing in here yet
              </h2>
              <p
                className="mx-auto mt-2 max-w-[42ch] text-[14.5px]"
                style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}
              >
                Anything you add stays in your basket across visits, so you can come back to it.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/products" className="btn btn-primary">
                  Shop all products
                </Link>
                <Link href="/wishlist" className="btn btn-outline">
                  View your wishlist
                </Link>
              </div>
            </div>

            {/* A shopper with an empty basket has usually just arrived or just
                checked out; the things they were looking at are the shortest
                path back to a purchase. */}
            <div className="mt-14 border-t border-line pt-10">
              <RecentlyViewed />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Cart Items */}
            <div className="border border-line bg-white p-4 md:col-span-2 md:p-6">
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-4 pb-4 border-b last:border-b-0">
                    <Link href={`/products/${item.product.slug || item.productId}`}>
                      <ProductThumb
                        src={item.product.thumbnail}
                        alt={item.product.name}
                        className="h-20 w-20 rounded"
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/products/${item.product.slug || item.productId}`}
                        className="font-semibold text-lg hover:text-primary-700 line-clamp-1"
                      >
                        {item.product.name}
                      </Link>
                      {(item.variant?.size || item.variant?.color) && (
                        <p className="text-sm text-neutral-600">
                          {[
                            item.variant.color && `Colour: ${item.variant.color}`,
                            item.variant.size && `Size: ${item.variant.size}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      {item.customization && Object.keys(item.customization).length > 0 && (
                        <p className="text-xs text-neutral-500 line-clamp-1">
                          {Object.entries(item.customization)
                            .map(([key, value]) => `${key}: ${describeCustomization(value)}`)
                            .join(' • ')}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item, item.quantity - 1)}
                          disabled={busyItemId === item.id || item.quantity <= 1}
                          className="h-8 w-8 rounded border border-neutral-300 font-bold hover:bg-neutral-50 disabled:opacity-40"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item, item.quantity + 1)}
                          disabled={
                            busyItemId === item.id || item.quantity >= item.product.quantity
                          }
                          className="h-8 w-8 rounded border border-neutral-300 font-bold hover:bg-neutral-50 disabled:opacity-40"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-2 text-lg font-bold text-neutral-900">
                        {formatCurrency(item.price * item.quantity)}
                        {item.quantity > 1 && (
                          <span className="ml-2 text-xs font-normal text-neutral-500">
                            ({formatCurrency(item.price)} each)
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item)}
                      disabled={busyItemId === item.id}
                      className="self-start text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Cart Summary Sidebar */}
            <div className="flex flex-col gap-4">
              {/* The code is validated here and carried to checkout, so a
                  shopper finds out it does not apply before filling an address. */}
              <CouponField
                subtotal={subtotal}
                onChange={handleCouponChange}
                className="border border-line bg-white p-4"
              />
              <CartSummary
                items={items.map((item) => ({
                  id: item.id,
                  name: item.product.name,
                  price: item.price,
                  quantity: item.quantity,
                }))}
                subtotal={subtotal}
                shipping={shipping}
                discount={discount}
                total={subtotal - discount + shipping}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
