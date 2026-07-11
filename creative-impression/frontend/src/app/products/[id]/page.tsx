'use client';

import React, { use } from 'react';
import { Card, Button } from '@/components/common';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: productId } = use(params);

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product Image */}
          <div className="bg-gray-200 rounded-lg h-96" />

          {/* Product Details */}
          <Card className="p-6">
            <h1 className="text-3xl font-bold mb-4" style={{ fontFamily: 'var(--font-playfair)' }}>Product Name</h1>
            <div className="mb-6">
              <span className="text-yellow-500 text-lg">★★★★★ (4.5/5 - 128 reviews)</span>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-primary-600" style={{ fontFamily: 'var(--font-montserrat)' }}>₹299</span>
            </div>

            <div className="mb-6 pb-6 border-b">
              <p className="text-gray-700 mb-4" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>High-quality custom printing service with premium materials.</p>
            </div>

            <div className="space-y-3 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-700">Quantity</label>
                <select className="w-full border border-gray-300 rounded px-3 py-2">
                  <option>1</option>
                  <option>2</option>
                  <option>5</option>
                  <option>10</option>
                </select>
              </div>
            </div>

            <Button fullWidth variant="primary" size="lg" className="mb-3">
              Add to Cart
            </Button>
            <Button fullWidth variant="ghost">
              Add to Wishlist
            </Button>
          </Card>
        </div>
      </div>
    </main>
  );
}
