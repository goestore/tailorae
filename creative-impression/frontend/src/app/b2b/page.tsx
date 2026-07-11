'use client';

import React from 'react';
import { QuantityDiscounts } from '@/components/b2b';
import { Card, Button } from '@/components/common';

export default function B2BPage() {
  const pricingTiers = [
    { quantity: 100, discount: 5, pricePerUnit: 95 },
    { quantity: 500, discount: 10, pricePerUnit: 90 },
    { quantity: 1000, discount: 15, pricePerUnit: 85 },
    { quantity: 5000, discount: 20, pricePerUnit: 80 },
  ];

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">B2B Bulk Orders</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {/* Bulk Order Benefits */}
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">💰 Best Pricing</h3>
            <p className="text-gray-600">
              Get the most competitive rates for bulk orders with volume discounts.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">🚚 Fast Delivery</h3>
            <p className="text-gray-600">
              Express delivery options available for urgent bulk orders.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">👥 Dedicated Support</h3>
            <p className="text-gray-600">
              Get personalized support from our B2B team for your orders.
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Bulk Order Form */}
          <div className="md:col-span-2">
            <Card className="p-6 space-y-6">
              <h2 className="text-2xl font-bold">Request Bulk Quote</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Type
                </label>
                <select className="w-full border border-gray-300 rounded px-4 py-2">
                  <option>Business Cards</option>
                  <option>T-Shirts</option>
                  <option>Posters</option>
                  <option>Custom Printing</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity Required
                </label>
                <input
                  type="number"
                  placeholder="Enter quantity"
                  className="w-full border border-gray-300 rounded px-4 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  placeholder="Your company name"
                  className="w-full border border-gray-300 rounded px-4 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="w-full border border-gray-300 rounded px-4 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Special Requirements
                </label>
                <textarea
                  placeholder="Tell us about any special requirements"
                  className="w-full border border-gray-300 rounded px-4 py-2 h-24"
                />
              </div>

              <Button fullWidth variant="primary" size="lg">
                Request Quote
              </Button>
            </Card>
          </div>

          {/* Pricing */}
          <QuantityDiscounts
            basePricePerUnit={100}
            tiers={pricingTiers}
            selectedQuantity={100}
          />
        </div>
      </div>
    </main>
  );
}
