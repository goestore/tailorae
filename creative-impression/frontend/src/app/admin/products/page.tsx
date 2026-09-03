import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductList } from '@/components/admin/ProductList';

export const metadata: Metadata = { title: 'Products | Admin' };

export default function AdminProductsPage() {
  return (
    <div className="admin-content flex flex-col gap-6">
      <header className="admin-page-header">
        <Link href="/admin" className="text-sm text-ink-3 hover:text-ink">
          Admin
        </Link>
        <h1 className="text-2xl text-ink">Products</h1>
        <p className="text-sm text-ink-2">
          Everything in the catalog. Only ACTIVE products appear in the shop.
        </p>
      </header>

      <ProductList />
    </div>
  );
}
