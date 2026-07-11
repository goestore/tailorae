'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/common';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

export interface CartSummaryProps {
  items: CartItem[];
  total: number;
  subtotal?: number;
  tax?: number;
  shipping?: number;
}

export const CartSummary: React.FC<CartSummaryProps> = ({
  items,
  total,
  subtotal,
  tax = 0,
  shipping = 0,
}) => {
  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Order Summary</h2>

      <div className="space-y-3 border-b pb-4 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              {item.name} x {item.quantity}
            </span>
            <span>₹{item.price * item.quantity}</span>
          </div>
        ))}
      </div>

      {subtotal !== undefined && (
        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>₹{subtotal}</span>
          </div>
          {tax > 0 && (
            <div className="flex justify-between">
              <span>Tax:</span>
              <span>₹{tax}</span>
            </div>
          )}
          {shipping > 0 && (
            <div className="flex justify-between">
              <span>Shipping:</span>
              <span>₹{shipping}</span>
            </div>
          )}
        </div>
      )}

      <div className="border-t pt-4 mb-6 flex justify-between text-lg font-bold">
        <span>Total:</span>
        <span className="text-primary-600">₹{total}</span>
      </div>

      <Link href="/checkout">
        <Button fullWidth variant="primary" size="lg">
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
