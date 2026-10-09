'use client';

import { ListingForm } from '@/components/catalog/listing-form';

/**
 * Add a product.
 *
 * Every listing carries the same data as a Myntra SKU template for its article
 * type; the shared listing form reads that template from the API, so this page
 * is only the frame around it.
 */
export default function NewProductPage() {
  return (
    <div className="admin-content flex flex-col gap-6">
      <header className="admin-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="admin-page-title">Add a product</h1>
          <p className="admin-page-sub">
            Pick the article type first. Save a draft any time; Publish unlocks once every field the
            template requires is filled.
          </p>
        </div>
      </header>

      <ListingForm mode="admin" />
    </div>
  );
}
