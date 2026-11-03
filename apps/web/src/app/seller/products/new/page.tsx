'use client';

import React from 'react';
import Link from 'next/link';
import { ListingForm } from '@/components/catalog/listing-form';
import { useSeller } from '@/components/seller/SellerContext';
import { NoShopYet, NotForRole, Notice, PageHeader, sellingClosedText } from '../../_components/ui';

/**
 * Listing something new. Saves through `POST /seller/products`, which files
 * the listing under the caller's shop — never one named in the request — and
 * refuses until the shop is approved, so the form is only offered then.
 */
export default function NewSellerProductPage() {
  const { me, can } = useSeller();
  const shop = me?.shop ?? null;

  if (!shop) return <NoShopYet />;
  if (!can('CATALOG')) return <NotForRole what="listing products" />;

  return (
    <main className="section-y">
      <div className="container-max">
        <PageHeader
          title="List a product"
          lead={
            shop.status === 'APPROVED'
              ? 'Pick the article type first. Save a draft any time; new listings go live once our team has reviewed them.'
              : undefined
          }
        />
        {shop.status === 'APPROVED' ? (
          <div className="mt-6">
            <ListingForm mode="seller" />
          </div>
        ) : (
          <Notice
            title="Selling is not open yet"
            tone={shop.status === 'SUSPENDED' ? 'alert' : 'brand'}
            actions={
              <Link href="/seller" className="btn btn-outline btn-sm">
                Back to overview
              </Link>
            }
          >
            {sellingClosedText(shop)}
          </Notice>
        )}
      </div>
    </main>
  );
}
