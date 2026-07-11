'use client';

import React from 'react';
import { Card } from '@/components/common';

export interface FeaturedProductsProps {
  products?: Array<{
    id: string;
    name: string;
    price: number;
    image: string;
    rating?: number;
  }>;
}

export const FeaturedProducts: React.FC<FeaturedProductsProps> = ({
  products = [
    {
      id: '1',
      name: 'Premium Business Cards',
      price: 299,
      image: '/images/product-1.jpg',
      rating: 4.5,
    },
    {
      id: '2',
      name: 'Custom T-Shirts',
      price: 499,
      image: '/images/product-2.jpg',
      rating: 4.8,
    },
    {
      id: '3',
      name: 'A4 Posters',
      price: 199,
      image: '/images/product-3.jpg',
      rating: 4.3,
    },
    {
      id: '4',
      name: 'Branded Mugs',
      price: 399,
      image: '/images/product-4.jpg',
      rating: 4.6,
    },
  ],
}) => {
  return (
    <section className="py-12 md:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Featured Products</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div
                className="h-48 bg-cover bg-center"
                style={{ backgroundImage: `url('${product.image}')` }}
              />
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-primary-600">₹{product.price}</span>
                  {product.rating && (
                    <span className="text-yellow-500 font-semibold">★ {product.rating}</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
