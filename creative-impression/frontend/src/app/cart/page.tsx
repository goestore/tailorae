'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { CartSummary } from '@/components/cart';
import { Button, Card, LoadingSpinner } from '@/components/common';
import { ProductThumb } from '@/components/product';
import { apiClient } from '@/lib/api-client';
import { calculateShipping, getApiErrorMessage } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';
import { AppDispatch } from '@/store';
import { loadCart } from '@/store/slices/cart';
import { Cart } from '@/types';

/** Cart item shape returned by GET /cart. */
interface ApiCartItem {
  id: string;
  productId: string;
  variantId?: string | null;
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

export default function CartPage() {
  const dispatch = useDispatch<AppDispatch>();
  const [cart, setCart] = useState<ApiCart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  const syncCart = useCallback(
    (nextCart: ApiCart) => {
      setCart(nextCart);
      dispatch(loadCart(nextCart as unknown as Cart));
    },
    [dispatch]
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    setHasToken(Boolean(token));
    if (!token) {
      setIsLoading(false);
      return;
    }

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
      </main>
    );
  }

  if (isLoading || hasToken === null) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }

  const items = cart?.items ?? [];
  const subtotal =
    cart?.subtotal ?? items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = items.length > 0 ? calculateShipping(subtotal) : 0;

  return (
    <main className="section-y">
      <div className="container-max">
        <header className="page-intro page-intro--compact"><p>Order review</p><h1>Your cart</h1></header>

        {error && <div className="alert alert-error mb-6">{error}</div>}

        {items.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-5xl mb-4">🛒</p>
            <h2 className="mb-2 text-2xl">Your cart is empty</h2>
            <p className="text-neutral-600 mb-6">
              Browse the catalog and add something you like.
            </p>
            <Link href="/products">
              <Button variant="primary" size="lg">
                Shop Products
              </Button>
            </Link>
          </Card>
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
                      {item.customization && Object.keys(item.customization).length > 0 && (
                        <p className="text-xs text-neutral-500 line-clamp-1">
                          {Object.entries(item.customization)
                            .map(([key, value]) => `${key}: ${value}`)
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
            <div>
              <CartSummary
                items={items.map((item) => ({
                  id: item.id,
                  name: item.product.name,
                  price: item.price,
                  quantity: item.quantity,
                }))}
                subtotal={subtotal}
                shipping={shipping}
                total={subtotal + shipping}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
