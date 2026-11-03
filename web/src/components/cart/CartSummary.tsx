import React from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/common';
import { formatPaise } from '@/lib/money';
import { FREE_SHIPPING_THRESHOLD_PAISE } from '@/lib/api-utils';

/** Every amount here is paise. */
export interface CartSummaryItem {
  id: string;
  name: string;
  lineTotalPaise: number;
  quantity: number;
}

export interface CartSummaryProps {
  items: CartSummaryItem[];
  subtotalPaise: number;
  shippingPaise: number;
  discountPaise?: number;
  totalPaise: number;
  /** Hide/disable the checkout button (e.g. while loading). */
  checkoutDisabled?: boolean;
}

export const CartSummary: React.FC<CartSummaryProps> = ({
  items,
  subtotalPaise: subtotal,
  shippingPaise: shipping,
  discountPaise: discount = 0,
  totalPaise: total,
  checkoutDisabled = false,
}) => {
  const amountToFreeShipping = FREE_SHIPPING_THRESHOLD_PAISE - (subtotal - discount);

  return (
    <Card className="p-5 md:p-6">
      <h2 className="mb-5 text-2xl">Order summary</h2>

      <div className="space-y-3 border-b pb-4 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2 text-sm">
            <span className="line-clamp-1">
              {item.name} x {item.quantity}
            </span>
            <span className="flex-shrink-0">{formatPaise(item.lineTotalPaise)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatPaise(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Discount:</span>
            <span>-{formatPaise(discount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Shipping:</span>
          <span className={shipping === 0 ? 'text-green-700' : ''}>
            {shipping === 0 ? 'FREE' : formatPaise(shipping)}
          </span>
        </div>
        {shipping > 0 && amountToFreeShipping > 0 && (
          <p className="rounded bg-primary-50 px-2 py-1 text-xs text-neutral-700">
            Add {formatPaise(amountToFreeShipping)} more for free shipping
          </p>
        )}
      </div>

      <div className="mb-6 flex justify-between border-t pt-4 text-lg">
        <span>Total:</span>
        <span className="text-neutral-900">{formatPaise(total)}</span>
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
