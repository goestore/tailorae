'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductForm } from '@/components/admin/ProductForm';
import { listCategories, type AdminCategory } from '@/lib/admin-products';

/**
 * Add a product.
 *
 * Categories are fetched before the form renders because the form needs one to
 * start from — a category picker that populates a moment later would silently
 * reset a choice already made.
 */
export default function NewProductPage() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch((err: Error) => {
        setError(err.message);
        setCategories([]);
      });
  }, []);

  return (
    <div className="container-max section-y flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/admin/products" className="text-sm text-ink-3 underline hover:text-ink">
          ← Products
        </Link>
        <h1 className="text-2xl font-semibold text-ink">Add a product</h1>
      </header>

      {error && <p className="alert alert-error text-sm">{error}</p>}
      {categories === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <ProductForm categories={categories} />
      )}
    </div>
  );
}
