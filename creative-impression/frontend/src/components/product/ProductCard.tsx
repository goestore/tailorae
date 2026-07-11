'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/common';

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  rating?: number;
  category?: string;
  inStock?: boolean;
}

export interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  return (
    <Link href={`/products/${product.id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
        <div className="relative h-48 bg-cover bg-center" style={{ backgroundImage: `url('${product.image}')` }}>
          {!product.inStock && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-bold">Out of Stock</span>
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-2 line-clamp-2">{product.name}</h3>
          {product.category && (
            <p className="text-sm text-gray-500 mb-2">{product.category}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-primary-600" style={{ fontFamily: 'var(--font-montserrat)' }}>₹{product.price}</span>
            {product.rating && (
              <span className="text-yellow-500 font-semibold text-sm">★ {product.rating}</span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
};
