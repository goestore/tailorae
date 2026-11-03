'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { BulkPricingEditor } from '@/components/admin/BulkPricingEditor';
import { ListingForm } from '@/components/catalog/listing-form';
import { getProduct, type AdminProduct } from '@/lib/admin-products';

/**
 * Edit one product.
 *
 * The listing form loads the product and its sizes itself. The page also reads
 * the product for the header and for the two editors below the form, which
 * hang off a product that already exists and save on their own endpoints.
 */
export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProduct(id)
      .then(setProduct)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  return (
    <div className="admin-content flex flex-col gap-6">
      <header className="admin-page-header" style={{ marginBottom: 0 }}>
        <h1 className="admin-page-title">{product?.name ?? 'Edit product'}</h1>
        {product && (
          <p className="admin-page-sub">
            <span>{product.sku}</span>
            {' · '}
            <span className="admin-status-badge" data-status={product.status}>
              {product.status === 'ACTIVE'
                ? 'Live'
                : product.status.charAt(0) + product.status.slice(1).toLowerCase()}
            </span>
            {product.articleType ? ` · ${product.articleType}` : ''}
            {product.status === 'ACTIVE' && (
              <>
                {' · '}
                <Link href={`/products/${product.slug}`} className="underline underline-offset-2">
                  View in shop
                </Link>
              </>
            )}
          </p>
        )}
      </header>

      {error && <p className="alert alert-error text-sm">{error}</p>}
      <ListingForm mode="admin" productId={id} />

      {product !== null && (
        <>
          {/* Lists that hang off a saved product, each on its own endpoint. */}
          <div className="admin-page-head" style={{ margin: '8px 0 0' }}>
            <div>
              <h2 className="admin-section-title" style={{ margin: 0 }}>
                More options
              </h2>
              <p className="admin-page-sub">
                Bulk pricing saves on its own, separately from the listing.
              </p>
            </div>
          </div>
          <BulkPricingEditor
            productId={product.id}
            price={product.price}
            initial={product.bulkPricings ?? []}
          />
        </>
      )}
    </div>
  );
}
