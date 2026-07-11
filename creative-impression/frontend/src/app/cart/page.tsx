'use client';

import React from 'react';
import { CartSummary } from '@/components/cart';

const MOCK_CART_ITEMS = [
  {
    id: '1',
    name: 'Premium Business Cards',
    price: 299,
    quantity: 2,
    image: '/images/product-1.jpg',
  },
  {
    id: '2',
    name: 'Custom T-Shirts',
    price: 499,
    quantity: 1,
    image: '/images/product-2.jpg',
  },
];

export default function CartPage() {
  const total = MOCK_CART_ITEMS.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Shopping Cart</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="md:col-span-2 bg-white p-6 rounded-lg shadow">
            <div className="space-y-4">
              {MOCK_CART_ITEMS.map((item) => (
                <div key={item.id} className="flex gap-4 pb-4 border-b">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-20 h-20 object-cover rounded"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{item.name}</h3>
                    <p className="text-gray-600">Quantity: {item.quantity}</p>
                    <p className="text-lg font-bold text-primary-600">
                      ₹{item.price * item.quantity}
                    </p>
                  </div>
                  <button className="text-red-600 hover:text-red-800 font-medium">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cart Summary Sidebar */}
          <div>
            <CartSummary
              items={MOCK_CART_ITEMS}
              total={total}
              subtotal={total}
              tax={0}
              shipping={0}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
