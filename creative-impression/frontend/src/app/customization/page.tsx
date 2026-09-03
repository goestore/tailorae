'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { Card, Button, LoadingSpinner } from '@/components/common';
import { ProductThumb } from '@/components/product';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';
import { AppDispatch } from '@/store';
import { addToCart } from '@/store/slices/cart';
import { Product, ProductCustomization } from '@/types';

/** Options can arrive as a JSON-encoded string or a real array. */
function parseOptions(options: ProductCustomization['options']): string[] {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string' && options.trim()) {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* not JSON — fall through */
    }
  }
  return [];
}

export default function CustomizationPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  // Load the customizable catalog.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/products', { params: { limit: 50 } })
      .then((res) => {
        if (cancelled) return;
        const all: Product[] = res.data?.data?.products ?? [];
        const customizable = all.filter((p) => p.isCustomizable);
        setProducts(customizable);
        if (customizable[0]) setSelectedId(customizable[0].id);
      })
      .catch((err) => toast.error(getApiErrorMessage(err, 'Could not load products.')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load full detail (with customizations) for the selected product.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    setChoices({});
    setQuantity(1);
    apiClient
      .get(`/products/${selectedId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data?.data?.product ?? null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const customizations = detail?.customizations ?? [];

  const extraCost = useMemo(() => {
    return customizations.reduce((sum, c) => {
      const value = choices[c.id];
      // Charge the add-on cost when a value is supplied for a paid option.
      if (value && value.trim() && c.additionalCost) return sum + c.additionalCost;
      return sum;
    }, 0);
  }, [customizations, choices]);

  const unitPrice = (detail?.price ?? 0) + extraCost;

  const setChoice = (id: string, value: string) =>
    setChoices((prev) => ({ ...prev, [id]: value }));

  const addToCartHandler = async () => {
    if (!detail) return;
    if (!localStorage.getItem('token')) {
      router.push('/auth/login?redirect=/customization');
      return;
    }
    // Ensure required options are filled.
    const missing = customizations.filter(
      (c) => c.isRequired && !(choices[c.id] && choices[c.id].trim())
    );
    if (missing.length > 0) {
      toast.error(`Please complete: ${missing.map((c) => c.name).join(', ')}`);
      return;
    }
    const customization = customizations.reduce<Record<string, string>>((acc, c) => {
      if (choices[c.id] && choices[c.id].trim()) acc[c.name] = choices[c.id].trim();
      return acc;
    }, {});

    setAdding(true);
    try {
      const res = await apiClient.post('/cart/items', {
        productId: detail.id,
        quantity,
        customization,
      });
      const cart = res.data?.data?.cart;
      const added = cart?.items?.find(
        (i: { productId: string }) => i.productId === detail.id
      );
      if (added) {
        dispatch(
          addToCart({
            id: added.id,
            productId: detail.id,
            product: detail,
            quantity,
            price: added.price ?? unitPrice,
            customization,
            isBulkOrder: false,
          })
        );
      }
      toast.success('Added to cart');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not add to cart.'));
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }

  if (products.length === 0) {
    return (
      <main className="section-y">
        <div className="container-max max-w-lg text-center">
          <Card className="p-10">
            <h1 className="mb-3 text-3xl">Custom printing</h1>
            <p className="text-neutral-600">
              No customizable products are available right now. Please check back soon.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="section-y">
      <div className="container-max">
        <header className="page-intro page-intro--compact"><p>Made for you</p><h1>Custom printing</h1><span>Pick a product, choose your options, and add your custom piece to the cart.</span></header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Product picker + options */}
          <div className="md:col-span-2 space-y-6">
            <Card className="p-4">
              <h2 className="mb-4 text-lg">1. Choose a product</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`text-left border p-2 transition-colors ${
                      selectedId === p.id
                        ? 'border-ink bg-surface-2'
                        : 'border-line hover:border-ink'
                    }`}
                  >
                    <ProductThumb
                      src={p.thumbnail || p.images?.[0]}
                      alt={p.name}
                      className="h-24 w-full rounded"
                    />
                    <p className="mt-2 text-sm font-medium line-clamp-1">{p.name}</p>
                    <p className="text-xs text-neutral-500">{formatCurrency(p.price)}</p>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-4 text-lg">2. Customize</h2>
              {detailLoading ? (
                <LoadingSpinner className="py-10" />
              ) : customizations.length === 0 ? (
                <p className="text-neutral-500 text-sm">
                  This product has no extra options — just set a quantity and add it to your cart.
                </p>
              ) : (
                <div className="space-y-5">
                  {customizations.map((c) => {
                    const options = parseOptions(c.options);
                    const isImage = c.type === 'image' || c.type === 'file';
                    return (
                      <div key={c.id}>
                        <label className="block text-sm font-medium text-neutral-700 mb-2">
                          {c.name}
                          {c.isRequired && <span className="text-red-500"> *</span>}
                          {c.additionalCost > 0 && (
                            <span className="ml-2 text-xs font-normal text-neutral-500">
                              +{formatCurrency(c.additionalCost)}
                            </span>
                          )}
                        </label>

                        {options.length > 0 ? (
                          <select
                            value={choices[c.id] ?? ''}
                            onChange={(e) => setChoice(c.id, e.target.value)}
                          >
                            <option value="">Select…</option>
                            {options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : isImage ? (
                          <div className="rounded-lg border-2 border-dashed border-neutral-300 p-4 text-center">
                            <p className="text-sm text-neutral-500">
                              Logo/artwork upload — coming soon.
                            </p>
                            <p className="mt-1 text-xs text-neutral-400">
                              For now, place your order and our team will follow up for artwork.
                            </p>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={choices[c.id] ?? ''}
                            maxLength={c.maxCharacters ?? undefined}
                            onChange={(e) => setChoice(c.id, e.target.value)}
                            placeholder={
                              c.maxCharacters ? `Up to ${c.maxCharacters} characters` : 'Enter text'
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Summary */}
          <div>
            <Card className="sticky top-24 p-4">
              <h2 className="mb-4 text-lg">Summary</h2>
              {detail && (
                <>
                  <ProductThumb
                    src={detail.thumbnail || detail.images?.[0]}
                    alt={detail.name}
                    className="mb-4 h-40 w-full"
                    showLabel
                  />
                  <p>{detail.name}</p>
                  <p className="text-sm text-neutral-500 mb-4">Base {formatCurrency(detail.price)}</p>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Quantity
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        className="h-9 w-9 border border-line text-lg leading-none hover:bg-surface-2"
                      >
                        −
                      </button>
                      <span className="w-8 text-center">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => q + 1)}
                        className="h-9 w-9 border border-line text-lg leading-none hover:bg-surface-2"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {extraCost > 0 && (
                    <div className="flex justify-between text-sm text-neutral-600 mb-1">
                      <span>Customization</span>
                      <span>+{formatCurrency(extraCost)}</span>
                    </div>
                  )}
                  <div className="mb-4 mt-2 flex justify-between border-t pt-3 text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(unitPrice * quantity)}</span>
                  </div>

                  <Button
                    fullWidth
                    variant="primary"
                    size="lg"
                    loading={adding}
                    onClick={addToCartHandler}
                  >
                    Add to Cart
                  </Button>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
