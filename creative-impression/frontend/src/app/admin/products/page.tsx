import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductList } from '@/components/admin/ProductList';

export const metadata: Metadata = { title: 'Products | Admin' };

export default function AdminProductsPage() {
  return (
    <div className="container-max section-y flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-ink-3 underline hover:text-ink">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold text-ink">Products</h1>
        <p className="text-sm text-ink-2">
          Everything in the catalog. Only ACTIVE products appear in the shop.
        </p>
      </header>

      <ProductList />
    </div>
  );
}
