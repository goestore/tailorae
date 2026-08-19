'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/common';
import { formatCurrency } from '@/utils/helpers';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/api-utils';

export interface CartSummaryItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface CartSummaryProps {
  items: CartSummaryItem[];
  subtotal: number;
  shipping: number;
  discount?: number;
  total: number;
  /** Hide/disable the checkout button (e.g. while loading). */
  checkoutDisabled?: boolean;
}

export const CartSummary: React.FC<CartSummaryProps> = ({
  items,
  subtotal,
  shipping,
  discount = 0,
  total,
  checkoutDisabled = false,
}) => {
  const amountToFreeShipping = FREE_SHIPPING_THRESHOLD - (subtotal - discount);

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Order Summary</h2>

      <div className="space-y-3 border-b pb-4 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2 text-sm">
            <span className="line-clamp-1">
              {item.name} x {item.quantity}
            </span>
            <span className="flex-shrink-0">{formatCurrency(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Discount:</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Shipping:</span>
          <span className={shipping === 0 ? 'font-semibold text-green-700' : ''}>
            {shipping === 0 ? 'FREE' : formatCurrency(shipping)}
          </span>
        </div>
        {shipping > 0 && amountToFreeShipping > 0 && (
          <p className="rounded bg-primary-50 px-2 py-1 text-xs text-neutral-700">
            Add {formatCurrency(amountToFreeShipping)} more for free shipping
          </p>
        )}
      </div>

      <div className="border-t pt-4 mb-6 flex justify-between text-lg font-bold">
        <span>Total:</span>
        <span className="text-neutral-900">{formatCurrency(total)}</span>
      </div>

      <Link href="/checkout" aria-disabled={checkoutDisabled}>
        <Button fullWidth variant="primary" size="lg" disabled={checkoutDisabled}>
          Proceed to Checkout
        </Button>
      </Link>

      <Link href="/products" className="block mt-3">
        <Button fullWidth variant="ghost">
          Continue Shopping
        </Button>
      </Link>
    </Card>
  );
};
