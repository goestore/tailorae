'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { QuantityDiscounts, B2BPricingTier } from '@/components/b2b';
import { Card, Button, Input, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getMyB2BProfile, submitRfq, type B2BProfile } from '@/lib/b2b-api';
import { RootState } from '@/store';
import { Product } from '@/types';

/**
 * Indicative volume discounts, applied to the selected product's real price
 * when that product has no bulk tiers of its own. The final price is always
 * whatever our team quotes.
 */
const INDICATIVE_DISCOUNTS: Array<{ quantity: number; discount: number }> = [
  { quantity: 100, discount: 5 },
  { quantity: 500, discount: 10 },
  { quantity: 1000, discount: 15 },
  { quantity: 5000, discount: 20 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Today in the browser's zone, as the yyyy-mm-dd a date input takes. */
const todayIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function B2BPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The detail last fetched, keyed by id so a stale response never prices
  // the wrong product.
  const [loadedDetail, setLoadedDetail] = useState<Product | null>(null);
  const [profile, setProfile] = useState<B2BProfile | null>(null);

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [companyName, setCompanyName] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [deadline, setDeadline] = useState('');
  const [requirements, setRequirements] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/products', { params: { limit: 50 } })
      .then((res) => {
        if (cancelled) return;
        const all: Product[] = res.data?.data?.products ?? [];
        // Products open to bulk orders first — those are what this page is for.
        const sorted = [...all].sort(
          (a, b) => Number(b.allowBulkOrders) - Number(a.allowBulkOrders)
        );
        setProducts(sorted);
        if (sorted[0]) setProductId(sorted[0].id);
      })
      .catch(() => {
        if (!cancelled) setLoadError('We could not load the catalogue. Please refresh the page.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A signed-in buyer with a profile does not need to retype the company.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyB2BProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p) setCompanyName((current) => current || p.companyName);
      })
      .catch(() => {
        /* the field simply stays editable */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Bulk tiers live on the product detail only.
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    apiClient
      .get(`/products/${encodeURIComponent(productId)}`)
      .then((res) => {
        if (!cancelled) setLoadedDetail(res.data?.data?.product ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoadedDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const listed = products.find((p) => p.id === productId) ?? null;
  const detail = loadedDetail && loadedDetail.id === productId ? loadedDetail : null;
  const selected = detail ?? listed;
  const basePrice = selected?.price ?? null;
  const selectedQuantity = Math.max(1, parseInt(quantity, 10) || 0);

  const tiers: B2BPricingTier[] = useMemo(() => {
    if (basePrice === null) return [];
    const bulk = detail?.bulkPricings ?? [];
    if (bulk.length === 0) {
      return INDICATIVE_DISCOUNTS.map((t) => ({
        quantity: t.quantity,
        discount: t.discount,
        pricePerUnit: round2(basePrice * (1 - t.discount / 100)),
      }));
    }
    return [...bulk]
      .map((bp) => ({
        quantity: bp.minQty,
        discount: Math.round(bp.discount ?? 0),
        pricePerUnit: bp.price ?? basePrice,
      }))
      .sort((a, b) => a.quantity - b.quantity);
  }, [detail, basePrice]);

  const submitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push('/auth/login?redirect=/b2b');
      return;
    }
    if (!productId) {
      toast.error('Please choose a product.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 1) {
      toast.error('Enter how many pieces you need.');
      return;
    }
    if (!profile && !companyName.trim()) {
      toast.error('Tell us your company name.');
      return;
    }
    let price: number | undefined;
    if (targetPrice.trim()) {
      price = Number(targetPrice);
      if (!Number.isFinite(price) || price <= 0) {
        toast.error('Target price must be a positive amount per piece.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const { rfq, message } = await submitRfq({
        productId,
        quantity: qty,
        ...(companyName.trim() ? { companyName: companyName.trim() } : {}),
        ...(price !== undefined ? { targetPrice: price } : {}),
        ...(deadline ? { deadline } : {}),
        ...(requirements.trim() ? { description: requirements.trim() } : {}),
      });
      setSubmitted(rfq?.rfqNumber ?? '');
      toast.success(message);
      if (!profile) void getMyB2BProfile().then(setProfile).catch(() => undefined);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubmitted(null);
    setTargetPrice('');
    setDeadline('');
    setRequirements('');
  };

  return (
    <main className="section-y">
      <div className="container-max">
        <header className="page-intro">
          <p>For teams & businesses</p>
          <h1>Bulk orders, without the back and forth.</h1>
          <span>Clear volume pricing, thoughtful support, and dependable delivery for every order.</span>
        </header>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[14px]" style={{ color: 'var(--ink-3)' }}>
            Already asked for a quote? Track replies and accept pricing in your business account.
          </p>
          <Link
            href={user ? '/b2b/account' : '/auth/login?redirect=/b2b/account'}
            className="btn btn-outline btn-sm"
          >
            Business account
          </Link>
        </div>

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
            {submitted !== null ? (
              <Card className="p-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center bg-primary-100 text-3xl">
                  ✓
                </div>
                <h2 className="mb-2 text-2xl">Quote request received</h2>
                <p className="text-neutral-600 mb-6">
                  Thanks{companyName.trim() ? `, ${companyName.trim()}` : ''}!{' '}
                  {submitted ? `Your reference is ${submitted}. ` : ''}Our B2B team will reply
                  with pricing — you can accept it from your business account.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link href="/b2b/account" className="btn btn-primary">
                    View my quotes
                  </Link>
                  <Button variant="outline" onClick={resetForm}>
                    Submit another request
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-6 md:p-8">
                <h2 className="mb-6 text-2xl">Request a bulk quote</h2>
                {loading ? (
                  <LoadingSpinner className="py-10" />
                ) : (
                  <form onSubmit={submitQuote} className="space-y-5">
                    {loadError && <p className="alert alert-error text-sm">{loadError}</p>}
                    <div>
                      <label
                        htmlFor="rfq-product"
                        className="block text-sm font-medium text-neutral-700 mb-2"
                      >
                        Product
                      </label>
                      <select
                        id="rfq-product"
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                      >
                        {products.length === 0 && <option value="">No products available</option>}
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — ₹{p.price}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <Input
                        id="rfq-quantity"
                        label="Quantity required *"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="Enter quantity"
                      />
                      <Input
                        id="rfq-target-price"
                        label="Target price per piece (₹)"
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        placeholder={basePrice !== null ? `List price ₹${basePrice}` : 'Optional'}
                      />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <Input
                        id="rfq-company"
                        label={profile ? 'Company name' : 'Company name *'}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Your company name"
                        maxLength={120}
                        disabled={Boolean(profile)}
                        helperText={
                          profile ? 'From your business profile.' : 'We set up your business profile from this.'
                        }
                      />
                      <Input
                        id="rfq-deadline"
                        label="Needed by"
                        type="date"
                        min={todayIso()}
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="rfq-requirements"
                        className="block text-sm font-medium text-neutral-700 mb-2"
                      >
                        Special requirements
                      </label>
                      <textarea
                        id="rfq-requirements"
                        value={requirements}
                        maxLength={2000}
                        onChange={(e) => setRequirements(e.target.value)}
                        placeholder="Tell us about any customization, branding, sizes or delivery needs"
                        className="h-24"
                      />
                    </div>

                    <Button
                      fullWidth
                      variant="primary"
                      size="lg"
                      type="submit"
                      loading={submitting}
                      disabled={!isInitialized || products.length === 0}
                    >
                      {user ? 'Request quote' : 'Sign in to request a quote'}
                    </Button>
                    <p className="text-xs text-neutral-500 text-center">
                      Any account can ask for a quote. Our team verifies your business before
                      wholesale pricing is unlocked.
                    </p>
                  </form>
                )}
              </Card>
            )}
          </div>

          {basePrice !== null ? (
            <QuantityDiscounts
              basePricePerUnit={basePrice}
              tiers={tiers}
              selectedQuantity={selectedQuantity}
            />
          ) : (
            <Card className="p-4">
              <h3 className="text-xl font-bold mb-2">Bulk Pricing</h3>
              <p className="text-sm text-neutral-500">
                Choose a product to see its volume pricing.
              </p>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
