import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProductList } from '@/components/admin/ProductList';

export const metadata: Metadata = { title: 'Products | Admin' };

/** Suspense because the list reads its filters from the URL. */
export default function AdminProductsPage() {
  return (
    <Suspense fallback={<p className="admin-page-sub">Loading products…</p>}>
      <ProductList />
    </Suspense>
  );
}
