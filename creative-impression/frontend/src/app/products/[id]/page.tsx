'use client';

import React, { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { Button, LoadingSpinner } from '@/components/common';
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

const variantLabel = (variant: ProductVariant): string =>
  [variant.size, variant.color, variant.material].filter(Boolean).join(' / ') || variant.name;

/** "50–199 units" / "500+ units" for the bulk price table. */
const tierRange = (tier: { minQty: number; maxQty?: number | null }): string =>
  tier.maxQty ? `${tier.minQty}–${tier.maxQty} units` : `${tier.minQty}+ units`;

/** Uppercase micro label — the small-caps voice used across the page. */
const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <p
    className={`m-0 text-[10.5px] font-bold uppercase leading-none tracking-[0.12em] ${className}`.trim()}
    style={{ color: 'var(--ink-3)' }}
  >
    {children}
  </p>
);

/** The three standing promises from the announcement bar, restated at the point of purchase. */
const TRUST_POINTS = [
  { title: 'Free shipping', detail: 'On orders over ₹999' },
  { title: 'Made to order', detail: 'Customize your professional wear' },
  { title: 'B2B pricing', detail: 'Wholesale rates on bulk orders' },
] as const;

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
    return <LoadingSpinner className="min-h-[60vh]" size="lg" />;
  }

  if (loadError || !product) {
    return (
      <main className="section-y">
        <div className="container-max">
          <div className="alert alert-error">{loadError ?? 'Failed to load this product.'}</div>
        </div>
      </main>
    );
  }

  const outOfStock = (selectedVariant?.quantity ?? product.quantity) <= 0;
  const hasDiscount =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price;
  const bulkTiers = (product.bulkPricings ?? [])
    .slice()
    .sort((a, b) => a.minQty - b.minQty);
  const hasCustomizations =
    product.isCustomizable && (product.customizations?.length ?? 0) > 0;

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
    <main className="pb-16">
      <div className="container-max">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mx-auto py-4" style={{ maxWidth: '1240px' }}>
          <ol
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
            style={{ color: 'var(--ink-3)' }}
          >
            <li>
              <Link href="/" className="transition-colors hover:text-ink">
                Home
              </Link>
            </li>
            <li aria-hidden="true" style={{ color: 'var(--border-strong)' }}>
              /
            </li>
            <li>
              <Link href="/products" className="transition-colors hover:text-ink">
                Products
              </Link>
            </li>
            {product.category?.name && (
              <>
                <li aria-hidden="true" style={{ color: 'var(--border-strong)' }}>
                  /
                </li>
                <li>{product.category.name}</li>
              </>
            )}
            <li aria-hidden="true" style={{ color: 'var(--border-strong)' }}>
              /
            </li>
            <li aria-current="page" style={{ color: 'var(--ink)' }}>
              {product.name}
            </li>
          </ol>
        </nav>

        <div
          className="mx-auto grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_460px]"
          style={{ maxWidth: '1240px' }}
        >
          {/* ---------- Gallery ---------- */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div
              className="card-media"
              style={{ aspectRatio: '4 / 5', border: '1px solid var(--border)' }}
            >
              <ProductThumb
                src={gallery[activeImage]}
                alt={product.name}
                className="absolute inset-0 h-full w-full"
                showLabel
              />

              {hasDiscount && product.discountPercentage > 0 && (
                <span
                  className="absolute left-0 top-4 px-2.5 py-1.5 text-[10px] font-bold uppercase leading-none tracking-[0.1em]"
                  style={{ background: 'var(--brand)', color: 'var(--ink)' }}
                >
                  {Math.round(product.discountPercentage)}% Off
                </span>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide">
                {gallery.map((img, index) => (
                  <button
                    key={`${img}-${index}`}
                    onClick={() => setActiveImage(index)}
                    aria-label={`View image ${index + 1}`}
                    aria-pressed={index === activeImage}
                    className="relative h-20 w-20 flex-shrink-0 overflow-hidden transition-colors"
                    style={{
                      border:
                        index === activeImage
                          ? '1px solid var(--ink)'
                          : '1px solid var(--border)',
                      boxShadow: index === activeImage ? 'var(--shadow-2)' : undefined,
                    }}
                  >
                    <ProductThumb
                      src={img}
                      alt={`${product.name} view ${index + 1}`}
                      className="h-full w-full"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---------- Buy column ---------- */}
          <div className="min-w-0">
            {product.category?.name && (
              <Eyebrow className="mb-3">{product.category.name}</Eyebrow>
            )}

            <h1
              className="m-0"
              style={{
                fontSize: 'clamp(26px, 3vw, 40px)',
                fontWeight: 600,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                color: 'var(--ink)',
              }}
            >
              {product.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
              {product.rating > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" style={{ color: 'var(--brand)' }}>
                    ★
                  </span>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                    {Number(product.rating).toFixed(1)}
                  </span>
                  <span style={{ color: 'var(--ink-3)' }}>
                    ({product.reviewCount} {product.reviewCount === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
              )}
              <span style={{ color: 'var(--ink-3)' }}>SKU {selectedVariant?.sku ?? product.sku}</span>
              <span
                className="inline-flex items-center gap-1.5 font-semibold"
                style={{ color: outOfStock ? 'var(--sale)' : 'var(--ink-2)' }}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: outOfStock ? 'var(--sale)' : '#1B7F4B' }}
                />
                {outOfStock ? 'Out of stock' : 'In stock'}
              </span>
            </div>

            {/* Price */}
            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                style={{
                  fontSize: 'clamp(28px, 3vw, 36px)',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: 'var(--ink)',
                }}
              >
                {formatCurrency(unitPrice)}
              </span>
              {hasDiscount && (
                <span className="text-base line-through" style={{ color: 'var(--ink-3)' }}>
                  {formatCurrency(product.originalPrice as number)}
                </span>
              )}
              {customizationCost > 0 && (
                <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                  incl. {formatCurrency(customizationCost)} customization
                </span>
              )}
            </div>

            {(product.shortDescription || product.description) && (
              <p
                className="mt-4 max-w-[56ch] text-[15px]"
                style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}
              >
                {product.shortDescription || product.description}
              </p>
            )}

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <section className="mt-7 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
                <Eyebrow>Variant</Eyebrow>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.variants.map((variant) => {
                    const isActive = selectedVariantId === variant.id;
                    return (
                      <button
                        key={variant.id}
                        onClick={() => setSelectedVariantId(variant.id)}
                        disabled={variant.quantity <= 0}
                        aria-pressed={isActive}
                        className="px-3.5 py-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        style={{
                          border: `1px solid ${isActive ? 'var(--ink)' : 'var(--border-strong)'}`,
                          background: isActive ? 'var(--ink)' : 'var(--surface)',
                          color: isActive ? 'var(--surface)' : 'var(--ink)',
                        }}
                      >
                        {variantLabel(variant)}
                        {typeof variant.price === 'number' && variant.price !== product.price && (
                          <span className="ml-1.5 opacity-60">
                            {formatCurrency(variant.price)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Customizations */}
            {hasCustomizations && (
              <section
                className="mt-7"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--grad-warm)',
                }}
              >
                <header
                  className="flex items-center gap-2.5 px-4 py-3"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <span
                    aria-hidden="true"
                    style={{ height: '14px', width: '3px', background: 'var(--brand)' }}
                  />
                  <h2
                    className="m-0 text-[13px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--ink)' }}
                  >
                    Customize it
                  </h2>
                </header>

                <div className="flex flex-col gap-4 p-4">
                  {product.customizations!.map((c) => {
                    const options = parseOptions(c.options);
                    const fieldLabel = (
                      <label
                        className="mb-1.5 flex items-baseline gap-1.5 text-[12px] font-semibold"
                        htmlFor={`custom-${c.id}`}
                        style={{ color: 'var(--ink)' }}
                      >
                        {c.name}
                        {c.isRequired && <span style={{ color: 'var(--sale)' }}>*</span>}
                        {c.additionalCost > 0 && (
                          <span className="font-normal" style={{ color: 'var(--ink-3)' }}>
                            +{formatCurrency(c.additionalCost)}
                          </span>
                        )}
                      </label>
                    );

                    if (isUploadCustomization(c)) {
                      return (
                        <div key={c.id}>
                          {fieldLabel}
                          <div
                            className="flex flex-col items-center gap-1 px-4 py-6 text-center"
                            style={{
                              border: '1px dashed var(--border-strong)',
                              background: 'var(--surface)',
                            }}
                          >
                            <svg
                              aria-hidden="true"
                              className="h-5 w-5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              style={{ color: 'var(--ink-3)' }}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                              />
                            </svg>
                            <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                              Logo / image upload coming soon
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (options.length > 0) {
                      return (
                        <div key={c.id}>
                          {fieldLabel}
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
                      const value = customValues[c.name] ?? '';
                      return (
                        <div key={c.id}>
                          {fieldLabel}
                          <input
                            id={`custom-${c.id}`}
                            type="text"
                            maxLength={maxChars}
                            value={value}
                            onChange={(e) =>
                              setCustomValues((prev) => ({ ...prev, [c.name]: e.target.value }))
                            }
                            placeholder={
                              maxChars ? `Up to ${maxChars} characters` : `Enter ${c.name}`
                            }
                          />
                          {maxChars && (
                            <p className="mt-1 text-right text-[11px]" style={{ color: 'var(--ink-3)' }}>
                              {value.length}/{maxChars}
                            </p>
                          )}
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </section>
            )}

            {/* Bulk pricing */}
            {bulkTiers.length > 0 && (
              <section className="mt-7 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
                <Eyebrow>Bulk pricing</Eyebrow>
                <dl className="mt-3 flex flex-col">
                  {bulkTiers.map((tier) => {
                    const tierPrice =
                      tier.price ??
                      (tier.discount ? product.price * (1 - tier.discount / 100) : undefined);
                    const isActive =
                      quantity >= tier.minQty && (!tier.maxQty || quantity <= tier.maxQty);
                    return (
                      <div
                        key={tier.id}
                        className="flex items-center justify-between gap-4 py-2.5 text-[13px]"
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: isActive ? 'var(--brand-soft)' : undefined,
                          paddingInline: isActive ? '10px' : undefined,
                        }}
                      >
                        <dt style={{ color: 'var(--ink-2)' }}>{tierRange(tier)}</dt>
                        <dd className="m-0 flex items-baseline gap-2 font-bold" style={{ color: 'var(--ink)' }}>
                          {tier.discount > 0 && (
                            <span
                              className="text-[11px] font-bold uppercase tracking-[0.06em]"
                              style={{ color: 'var(--ink-3)' }}
                            >
                              {Math.round(tier.discount)}% off
                            </span>
                          )}
                          {tierPrice !== undefined && `${formatCurrency(tierPrice)} each`}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            )}

            {/* Quantity + add to cart */}
            <section className="mt-7 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
              <Eyebrow>Quantity</Eyebrow>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <div className="flex" style={{ border: '1px solid var(--border-strong)' }}>
                  <button
                    onClick={() => stepQuantity(-1)}
                    disabled={quantity <= minQty}
                    className="h-11 w-11 text-lg font-bold transition-colors hover:bg-[var(--surface-2)] disabled:opacity-30"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span
                    className="flex h-11 w-14 items-center justify-center text-[15px] font-semibold"
                    style={{
                      borderInline: '1px solid var(--border-strong)',
                      color: 'var(--ink)',
                    }}
                    aria-live="polite"
                  >
                    {quantity}
                  </span>
                  <button
                    onClick={() => stepQuantity(1)}
                    disabled={quantity >= maxQty}
                    className="h-11 w-11 text-lg font-bold transition-colors hover:bg-[var(--surface-2)] disabled:opacity-30"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <div className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                  {minQty > 1 && <p className="m-0">Minimum order: {minQty}</p>}
                  {!outOfStock && maxQty <= 10 && (
                    <p className="m-0 font-semibold" style={{ color: 'var(--sale)' }}>
                      Only {maxQty} left in stock
                    </p>
                  )}
                </div>
              </div>

              <Button
                fullWidth
                variant="primary"
                size="lg"
                className="mt-5"
                onClick={handleAddToCart}
                loading={isAdding}
                disabled={outOfStock}
              >
                {outOfStock
                  ? 'Out of Stock'
                  : `Add to Cart • ${formatCurrency(unitPrice * quantity)}`}
              </Button>

              {product.allowBulkOrders && (
                <Link
                  href="/b2b"
                  className="btn btn-outline btn-lg btn-block mt-2.5"
                >
                  Request a bulk quote
                </Link>
              )}
            </section>

            {/* Trust row */}
            <ul
              className="mt-7 grid grid-cols-1 gap-px sm:grid-cols-3"
              style={{ background: 'var(--border)', border: '1px solid var(--border)' }}
            >
              {TRUST_POINTS.map((point) => (
                <li key={point.title} className="px-3 py-3.5" style={{ background: 'var(--surface)' }}>
                  <p
                    className="m-0 text-[11px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: 'var(--ink)' }}
                  >
                    {point.title}
                  </p>
                  <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                    {point.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---------- Details band ---------- */}
        {(product.description || product.sku) && (
          <section
            className="mx-auto mt-14 pt-10"
            style={{ maxWidth: '1240px', borderTop: '1px solid var(--border)' }}
          >
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
              {product.description && (
                <div>
                  <Eyebrow>Product details</Eyebrow>
                  <p
                    className="mt-4 max-w-[68ch] text-[15px]"
                    style={{ color: 'var(--ink-2)', lineHeight: 1.75 }}
                  >
                    {product.description}
                  </p>
                </div>
              )}

              <div>
                <Eyebrow>Specification</Eyebrow>
                <dl className="mt-4 flex flex-col">
                  {[
                    ['SKU', selectedVariant?.sku ?? product.sku],
                    ['Category', product.category?.name],
                    ['Minimum order', `${minQty} ${minQty === 1 ? 'unit' : 'units'}`],
                    [
                      'Customizable',
                      product.isCustomizable ? 'Yes' : 'No',
                    ],
                    ['Bulk orders', product.allowBulkOrders ? 'Accepted' : 'Not available'],
                  ]
                    .filter(([, value]) => Boolean(value))
                    .map(([label, value]) => (
                      <div
                        key={label as string}
                        className="flex items-baseline justify-between gap-4 py-2.5 text-[13px]"
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <dt style={{ color: 'var(--ink-3)' }}>{label}</dt>
                        <dd className="m-0 text-right font-semibold" style={{ color: 'var(--ink)' }}>
                          {value}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
