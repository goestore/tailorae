'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductForm } from '@/components/admin/ProductForm';
import {
  getProduct,
  listCategories,
  type AdminCategory,
  type AdminProduct,
} from '@/lib/admin-products';

/**
 * Edit one product.
 *
 * The product and the categories are loaded together: the form seeds its state
 * once, so arriving with only half the data would leave the category picker
 * unable to show what the product is actually in.
 */
export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getProduct(id), listCategories()])
      .then(([loadedProduct, loadedCategories]) => {
        setProduct(loadedProduct);
        setCategories(loadedCategories);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  return (
    <div className="admin-content flex flex-col gap-6">
      <header className="admin-page-header">
        <Link href="/admin/products" className="text-sm text-ink-3 hover:text-ink">
          Products
        </Link>
        <h1 className="text-2xl text-ink">{product?.name ?? 'Edit product'}</h1>
      </header>

      {error && <p className="alert alert-error text-sm">{error}</p>}
      {!error && (product === null || categories === null) && (
        <p className="text-sm text-ink-3">Loading…</p>
      )}
      {product !== null && categories !== null && (
        <ProductForm product={product} categories={categories} />
      )}
    </div>
  );
}
