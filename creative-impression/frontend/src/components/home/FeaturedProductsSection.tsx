'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/product';
import { Button, Skeleton } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { Product } from '@/types';

/**
 * Home-page featured products, fetched live from GET /products?featured=true.
 * Renders nothing (after loading) if the API is unreachable or returns none,
 * so the home page degrades gracefully when the backend is down.
 */
export const FeaturedProductsSection: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/products', { params: { featured: 'true', limit: 4 } })
      .then((res) => {
        if (!cancelled) setProducts(res.data?.data?.products ?? []);
      })
      .catch(() => {
        /* leave empty — section hides itself */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <section className="py-16 md:py-20 px-4 bg-white dark:bg-neutral-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex items-end justify-between">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-neutral-900 dark:text-neutral-50">
            Featured Products
          </h2>
          <Link href="/products" className="hidden sm:block">
            <Button variant="outline">View All</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-72 w-full rounded-lg" />
              ))
            : products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>

        <div className="mt-10 text-center sm:hidden">
          <Link href="/products">
            <Button variant="outline">View All Products</Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
