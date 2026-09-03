'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { QuantityDiscounts, B2BPricingTier } from '@/components/b2b';
import { Card, Button, Input, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';
import { Product } from '@/types';

// Fallback tiers shown until a product with its own bulk pricing is selected.
const DEFAULT_TIERS: B2BPricingTier[] = [
  { quantity: 100, discount: 5, pricePerUnit: 95 },
  { quantity: 500, discount: 10, pricePerUnit: 90 },
  { quantity: 1000, discount: 15, pricePerUnit: 85 },
  { quantity: 5000, discount: 20, pricePerUnit: 80 },
];

export default function B2BPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Product | null>(null);

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [companyName, setCompanyName] = useState('');
  const [requirements, setRequirements] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/products', { params: { limit: 50 } })
      .then((res) => {
        if (cancelled) return;
        const all: Product[] = res.data?.data?.products ?? [];
        setProducts(all);
        if (all[0]) setProductId(all[0].id);
      })
      .catch(() => {
        /* form still renders; QuantityDiscounts shows default tiers */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load bulk pricing for the selected product.
  useEffect(() => {
    if (!productId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    apiClient
      .get(`/products/${productId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data?.data?.product ?? null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const tiers: B2BPricingTier[] = useMemo(() => {
    const bulk = detail?.bulkPricings ?? [];
    if (bulk.length === 0) return DEFAULT_TIERS;
    return [...bulk]
      .map((bp) => ({
        quantity: bp.minQty,
        discount: Math.round(bp.discount ?? 0),
        pricePerUnit: bp.price ?? detail?.price ?? 0,
      }))
      .sort((a, b) => a.quantity - b.quantity);
  }, [detail]);

  const basePrice = detail?.price ?? 100;
  const selectedQuantity = Math.max(1, parseInt(quantity, 10) || 0);

  const submitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localStorage.getItem('token')) {
      router.push('/auth/login?redirect=/b2b');
      return;
    }
    if (!productId) {
      toast.error('Please select a product.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/b2b/rfq', {
        productId,
        quantity: selectedQuantity,
        ...(companyName.trim() ? { companyName: companyName.trim() } : {}),
        ...(requirements.trim() ? { description: requirements.trim() } : {}),
      });
      setSubmitted(true);
      toast.success('RFQ received — our team will reach out');
    } catch (err) {
      const status = getApiErrorStatus(err);
      if (status === 403) {
        toast.error(
          'Your account isn’t set up for B2B yet. Please contact us to enable bulk ordering.'
        );
      } else {
        toast.error(getApiErrorMessage(err, 'Could not submit your quote request.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="section-y">
      <div className="container-max">
        <header className="page-intro">
          <p>For teams & businesses</p>
          <h1>Bulk orders, without the back and forth.</h1>
          <span>Clear volume pricing, thoughtful support, and dependable delivery for every order.</span>
        </header>

        <div className="mb-12 grid grid-cols-1 gap-px bg-line md:grid-cols-3">
          <Card className="border-0 p-6">
            <h3 className="mb-3 text-lg">Best pricing</h3>
            <p className="text-ink-3">
              Get the most competitive rates for bulk orders with volume discounts.
            </p>
          </Card>
          <Card className="border-0 p-6">
            <h3 className="mb-3 text-lg">Fast delivery</h3>
            <p className="text-ink-3">
              Express delivery options available for urgent bulk orders.
            </p>
          </Card>
          <Card className="border-0 p-6">
            <h3 className="mb-3 text-lg">Dedicated support</h3>
            <p className="text-ink-3">
              Get personalized support from our B2B team for your orders.
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2">
            {submitted ? (
              <Card className="p-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center bg-primary-100 text-3xl">
                  ✓
                </div>
                <h2 className="mb-2 text-2xl">Quote request received</h2>
                <p className="text-neutral-600 mb-6">
                  Thanks{companyName.trim() ? `, ${companyName.trim()}` : ''}! Our B2B team will get
                  back to you shortly with pricing.
                </p>
                <Button variant="outline" onClick={() => setSubmitted(false)}>
                  Submit Another Request
                </Button>
              </Card>
            ) : (
              <Card className="p-6 md:p-8">
                <h2 className="mb-6 text-2xl">Request a bulk quote</h2>
                {loading ? (
                  <LoadingSpinner className="py-10" />
                ) : (
                  <form onSubmit={submitQuote} className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Product
                      </label>
                      <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                        {products.length === 0 && <option value="">No products available</option>}
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Input
                      label="Quantity Required"
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="Enter quantity"
                    />

                    <Input
                      label="Company Name"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Your company name"
                    />

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Special Requirements
                      </label>
                      <textarea
                        value={requirements}
                        onChange={(e) => setRequirements(e.target.value)}
                        placeholder="Tell us about any customization, branding, or delivery needs"
                        className="h-24"
                      />
                    </div>

                    <Button fullWidth variant="primary" size="lg" type="submit" loading={submitting}>
                      Request Quote
                    </Button>
                    <p className="text-xs text-neutral-500 text-center">
                      You&apos;ll need to sign in with a B2B account to submit a request.
                    </p>
                  </form>
                )}
              </Card>
            )}
          </div>

          <QuantityDiscounts
            basePricePerUnit={basePrice}
            tiers={tiers}
            selectedQuantity={selectedQuantity}
          />
        </div>
      </div>
    </main>
  );
}
