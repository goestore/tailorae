'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/common';
import { Product } from '@/types';
import { formatCurrency } from '@/utils/helpers';
import { ProductThumb } from './ProductThumb';

export interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const outOfStock = product.quantity <= 0;
  const hasDiscount =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price;

  return (
    <Link href={`/products/${product.slug || product.id}`}>
      <Card className="overflow-hidden p-0 hover:shadow-lg transition-shadow cursor-pointer h-full">
        <div className="relative h-48">
          <ProductThumb
            src={product.thumbnail || product.images?.[0]}
            alt={product.name}
            className="h-48 w-full"
          />
          {hasDiscount && product.discountPercentage > 0 && (
            <span className="absolute top-2 left-2 rounded-full bg-primary-500 px-2 py-1 text-xs font-bold text-black">
              {Math.round(product.discountPercentage)}% OFF
            </span>
          )}
          {product.isCustomizable && (
            <span className="absolute top-2 right-2 rounded-full bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">
              Customizable
            </span>
          )}
          {outOfStock && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-bold">Out of Stock</span>
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-1 line-clamp-2">{product.name}</h3>
          {product.category?.name && (
            <p className="text-sm text-gray-500 mb-2">{product.category.name}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                className="text-xl font-bold text-neutral-900"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                {formatCurrency(product.price)}
              </span>
              {hasDiscount && (
                <span className="text-sm text-neutral-400 line-through">
                  {formatCurrency(product.originalPrice as number)}
                </span>
              )}
            </div>
            {product.rating > 0 && (
              <span className="flex-shrink-0 text-sm font-semibold text-primary-700">
                ★ {Number(product.rating).toFixed(1)}
                {product.reviewCount > 0 && (
                  <span className="ml-1 font-normal text-neutral-400">({product.reviewCount})</span>
                )}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
};
