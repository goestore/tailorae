'use client';

import React, { useState } from 'react';
import { ProductGrid, ProductFilters } from '@/components/product';

// Mock data - replace with API call
const MOCK_PRODUCTS = [
  {
    id: '1',
    name: 'Premium Business Cards',
    price: 299,
    image: '/images/product-1.jpg',
    rating: 4.5,
    category: 'Business Cards',
    inStock: true,
  },
  {
    id: '2',
    name: 'Custom T-Shirts',
    price: 499,
    image: '/images/product-2.jpg',
    rating: 4.8,
    category: 'Apparel',
    inStock: true,
  },
  // Add more products as needed
];

const CATEGORIES = [
  { id: 'business-cards', name: 'Business Cards' },
  { id: 'apparel', name: 'Apparel' },
  { id: 'posters', name: 'Posters' },
];

export default function ProductsCatalogPage() {
  const [filteredProducts, setFilteredProducts] = useState(MOCK_PRODUCTS);

  const handleCategoryChange = (categoryId: string) => {
    setFilteredProducts(
      MOCK_PRODUCTS.filter((p) => p.category?.toLowerCase().includes(categoryId))
    );
  };

  const handlePriceChange = (minPrice: number, maxPrice: number) => {
    setFilteredProducts(
      MOCK_PRODUCTS.filter((p) => p.price >= minPrice && p.price <= maxPrice)
    );
  };

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Our Products</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="md:col-span-1">
            <ProductFilters
              categories={CATEGORIES}
              onCategoryChange={handleCategoryChange}
              onPriceChange={handlePriceChange}
            />
          </div>

          {/* Products Grid */}
          <div className="md:col-span-3">
            <ProductGrid products={filteredProducts} columns={3} />
          </div>
        </div>
      </div>
    </main>
  );
}
