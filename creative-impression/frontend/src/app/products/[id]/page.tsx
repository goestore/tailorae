'use client';

import React, { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { Card, Button, Badge, LoadingSpinner } from '@/components/common';
import { ProductThumb } from '@/components/product';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';
import { formatCurrency } from '@/utils/helpers';
import { AppDispatch } from '@/store';
import { loadCart } from '@/store/slices/cart';
import { Cart, Product, ProductCustomization, ProductVariant } from '@/types';

/** Customization options may arrive as an array or as a JSON-encoded string. */
const parseOptions = (options: ProductCustomization['options']): string[] => {
  if (Array.isArray(options)) return options.map(String);
  if (typeof options === 'string' && options.trim()) {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return options.split(',').map((o) => o.trim()).filter(Boolean);
    }
  }
  return [];
};

const isTextCustomization = (c: ProductCustomization) =>
  c.type === 'text' || c.type === 'embroidery';
const isUploadCustomization = (c: ProductCustomization) =>
  c.type === 'image' || c.type === 'file' || c.type === 'upload' || c.type === 'logo';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = use(params);
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState(1);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiClient
      .get(`/products/${encodeURIComponent(idOrSlug)}`)
      .then((res) => {
        if (cancelled) return;
        const loaded: Product | undefined = res.data?.data?.product;
        if (!loaded) {
          setIsNotFound(true);
          return;
        }
        setProduct(loaded);
        setQuantity(Math.max(1, loaded.minOrderQuantity || 1));
        const defaultVariant =
          loaded.variants?.find((v) => v.isDefault) ?? loaded.variants?.[0];
        setSelectedVariantId(defaultVariant?.id);
      })
      .catch((err) => {
        if (cancelled) return;
        if (getApiErrorStatus(err) === 404) setIsNotFound(true);
        else setLoadError(getApiErrorMessage(err, 'Failed to load this product.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  const selectedVariant: ProductVariant | undefined = useMemo(
    () => product?.variants?.find((v) => v.id === selectedVariantId),
    [product, selectedVariantId]
  );

  const gallery = useMemo(() => {
    const images = [product?.thumbnail, ...(product?.images ?? [])].filter(
      (img, index, arr): img is string => Boolean(img) && arr.indexOf(img) === index
    );
    return images.length > 0 ? images : [undefined];
  }, [product]);

  const customizationCost = useMemo(() => {
    if (!product?.customizations) return 0;
    return product.customizations.reduce((sum, c) => {
      if (isUploadCustomization(c)) return sum; // upload not available yet
      const value = customValues[c.name];
      return value ? sum + (c.additionalCost || 0) : sum;
    }, 0);
  }, [product, customValues]);

  const unitPrice = (selectedVariant?.price ?? product?.price ?? 0) + customizationCost;
  const minQty = Math.max(1, product?.minOrderQuantity || 1);
  const maxQty = Math.max(minQty, selectedVariant?.quantity ?? product?.quantity ?? minQty);

  if (isNotFound) notFound();

  if (isLoading) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }

  if (loadError || !product) {
    return (
      <main className="py-16">
        <div className="mx-auto max-w-3xl px-4">
          <div className="alert alert-error">{loadError ?? 'Failed to load this product.'}</div>
        </div>
      </main>
    );
  }

  const outOfStock = (selectedVariant?.quantity ?? product.quantity) <= 0;
  const hasDiscount =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price;

  const stepQuantity = (delta: number) => {
    setQuantity((q) => Math.min(maxQty, Math.max(minQty, q + delta)));
  };

  const handleAddToCart = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push(`/auth/login?redirect=${encodeURIComponent(`/products/${idOrSlug}`)}`);
      return;
    }

    // Validate required customizations (upload types are not enforced — coming soon).
    const missing = (product.customizations ?? []).filter(
      (c) => c.isRequired && !isUploadCustomization(c) && !customValues[c.name]
    );
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.map((c) => c.name).join(', ')}`);
      return;
    }

    const customization: Record<string, string> = {};
    Object.entries(customValues).forEach(([key, value]) => {
      if (value) customization[key] = value;
    });

    setIsAdding(true);
    try {
      const res = await apiClient.post('/cart/items', {
        productId: product.id,
        quantity,
        ...(selectedVariantId ? { variantId: selectedVariantId } : {}),
        ...(Object.keys(customization).length > 0 ? { customization } : {}),
      });
      const cart = res.data?.data?.cart;
      if (cart) dispatch(loadCart(cart as unknown as Cart));
      toast.success('Added to cart');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not add to cart.'));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <main className="py-8 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product Gallery */}
          <div>
            <ProductThumb
              src={gallery[activeImage]}
              alt={product.name}
              className="h-96 w-full rounded-lg"
              showLabel
            />
            {gallery.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {gallery.map((img, index) => (
                  <button
                    key={`${img}-${index}`}
                    onClick={() => setActiveImage(index)}
                    className={`flex-shrink-0 rounded-md border-2 ${
                      index === activeImage ? 'border-primary-500' : 'border-transparent'
                    }`}
                    aria-label={`View image ${index + 1}`}
                  >
                    <ProductThumb src={img} alt={product.name} className="h-16 w-16 rounded" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <Card className="p-6">
            {product.category?.name && (
              <Badge variant="primary" className="mb-3">
                {product.category.name}
              </Badge>
            )}
            <h1
              className="text-3xl font-bold mb-3"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              {product.name}
            </h1>

            {product.rating > 0 && (
              <div className="mb-4 text-sm">
                <span className="font-semibold text-primary-700">
                  ★ {Number(product.rating).toFixed(1)}
                </span>
                <span className="ml-2 text-neutral-500">
                  ({product.reviewCount} {product.reviewCount === 1 ? 'review' : 'reviews'})
                </span>
              </div>
            )}

            <div className="mb-6 flex items-baseline gap-3">
              <span
                className="text-4xl font-bold text-neutral-900"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                {formatCurrency(unitPrice)}
              </span>
              {hasDiscount && (
                <>
                  <span className="text-lg text-neutral-400 line-through">
                    {formatCurrency(product.originalPrice as number)}
                  </span>
                  {product.discountPercentage > 0 && (
                    <span className="rounded-full bg-primary-100 px-2 py-1 text-xs font-bold text-primary-800">
                      {Math.round(product.discountPercentage)}% OFF
                    </span>
                  )}
                </>
              )}
            </div>

            {(product.shortDescription || product.description) && (
              <div className="mb-6 pb-6 border-b">
                <p className="text-gray-700">
                  {product.shortDescription || product.description}
                </p>
                {product.shortDescription && product.description && (
                  <p className="mt-3 text-sm text-gray-600">{product.description}</p>
                )}
              </div>
            )}

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-6">
                <label className="text-sm font-medium text-gray-700 mb-2">Variant</label>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariantId(variant.id)}
                      disabled={variant.quantity <= 0}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        selectedVariantId === variant.id
                          ? 'border-primary-500 bg-primary-50 text-neutral-900'
                          : 'border-neutral-300 hover:border-primary-400'
                      }`}
                    >
                      {[variant.size, variant.color, variant.material]
                        .filter(Boolean)
                        .join(' / ') || variant.name}
                      {typeof variant.price === 'number' && variant.price !== product.price && (
                        <span className="ml-1 text-xs text-neutral-500">
                          {formatCurrency(variant.price)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customizations */}
            {product.isCustomizable &&
              product.customizations &&
              product.customizations.length > 0 && (
                <div className="mb-6 space-y-4 rounded-lg bg-primary-50 p-4">
                  <h2 className="text-lg font-bold text-neutral-900">Customize It</h2>
                  {product.customizations.map((c) => {
                    const options = parseOptions(c.options);
                    if (isUploadCustomization(c)) {
                      return (
                        <div key={c.id}>
                          <label className="text-sm font-medium text-gray-700">
                            {c.name}
                            {c.additionalCost > 0 && (
                              <span className="ml-1 text-neutral-500">
                                (+{formatCurrency(c.additionalCost)})
                              </span>
                            )}
                          </label>
                          <div className="mt-1 rounded-lg border-2 border-dashed border-neutral-300 bg-white p-4 text-center text-sm text-neutral-500">
                            Logo / image upload coming soon
                          </div>
                        </div>
                      );
                    }
                    if (options.length > 0) {
                      return (
                        <div key={c.id}>
                          <label className="text-sm font-medium text-gray-700" htmlFor={`custom-${c.id}`}>
                            {c.name}
                            {c.isRequired && <span className="text-red-500"> *</span>}
                            {c.additionalCost > 0 && (
                              <span className="ml-1 text-neutral-500">
                                (+{formatCurrency(c.additionalCost)})
                              </span>
                            )}
                          </label>
                          <select
                            id={`custom-${c.id}`}
                            value={customValues[c.name] ?? ''}
                            onChange={(e) =>
                              setCustomValues((prev) => ({ ...prev, [c.name]: e.target.value }))
                            }
                          >
                            <option value="">Select {c.name}</option>
                            {options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (isTextCustomization(c) || options.length === 0) {
                      const maxChars = c.maxCharacters ?? undefined;
                      return (
                        <div key={c.id}>
                          <label className="text-sm font-medium text-gray-700" htmlFor={`custom-${c.id}`}>
                            {c.name}
                            {c.isRequired && <span className="text-red-500"> *</span>}
                            {c.additionalCost > 0 && (
                              <span className="ml-1 text-neutral-500">
                                (+{formatCurrency(c.additionalCost)})
                              </span>
                            )}
                          </label>
                          <input
                            id={`custom-${c.id}`}
                            type="text"
                            maxLength={maxChars}
                            value={customValues[c.name] ?? ''}
                            onChange={(e) =>
                              setCustomValues((prev) => ({ ...prev, [c.name]: e.target.value }))
                            }
                            placeholder={
                              maxChars ? `Up to ${maxChars} characters` : `Enter ${c.name}`
                            }
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}

            {/* Quantity */}
            <div className="mb-6">
              <label className="text-sm font-medium text-gray-700 mb-2">Quantity</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => stepQuantity(-1)}
                  disabled={quantity <= minQty}
                  className="h-10 w-10 rounded-lg border border-neutral-300 text-lg font-bold hover:bg-neutral-50 disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-10 text-center text-lg font-semibold">{quantity}</span>
                <button
                  onClick={() => stepQuantity(1)}
                  disabled={quantity >= maxQty}
                  className="h-10 w-10 rounded-lg border border-neutral-300 text-lg font-bold hover:bg-neutral-50 disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  +
                </button>
                {minQty > 1 && (
                  <span className="text-xs text-neutral-500">Minimum order: {minQty}</span>
                )}
              </div>
              {!outOfStock && maxQty <= 10 && (
                <p className="mt-1 text-xs text-red-600">Only {maxQty} left in stock</p>
              )}
            </div>

            <Button
              fullWidth
              variant="primary"
              size="lg"
              className="mb-3"
              onClick={handleAddToCart}
              loading={isAdding}
              disabled={outOfStock}
            >
              {outOfStock ? 'Out of Stock' : `Add to Cart • ${formatCurrency(unitPrice * quantity)}`}
            </Button>
          </Card>
        </div>
      </div>
    </main>
  );
}
