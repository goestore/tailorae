'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { Button, LoadingSpinner } from '@/components/common';
import {
  ColorSwatch,
  NotifyMeButton,
  PincodeChecker,
  ProductThumb,
  RecentlyViewed,
  Reviews,
  SellerLine,
  SizeGuideModal,
  WishlistButton,
} from '@/components/product';
import { legalDisclosure, listingSpecRows } from '@/components/product/listing-specs';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';
import { recordRecentlyViewed } from '@/lib/recently-viewed';
import { storeHref } from '@/lib/category-tree';
import { formatCurrency } from '@/utils/helpers';
import { AppDispatch } from '@/store';
import { loadCart } from '@/store/slices/cart';
import { Cart, ProductCustomization, ProductDetail, ProductVariant } from '@/types';

/**
 * Which variant the page opens on.
 *
 * A shop tile links to one colourway — `?color=Navy Blue` — so the page must
 * open on that colour. Without this the shopper clicks a navy polo and lands on
 * the white one, which reads as the wrong product.
 *
 * Falls through to the product's own default when the colour is absent or no
 * longer stocked, rather than selecting nothing.
 */
const openingVariant = (
  product: ProductDetail,
  requestedColor: string | null
): ProductVariant | undefined => {
  const wanted = requestedColor?.trim().toLowerCase();
  const colorMatch = wanted
    ? product.variants?.find(
        (v) => (v.color ?? '').trim().toLowerCase() === wanted && v.quantity > 0
      ) ?? product.variants?.find((v) => (v.color ?? '').trim().toLowerCase() === wanted)
    : undefined;

  const variants = product.variants ?? [];
  return (
    colorMatch ??
    variants.find((v) => v.isDefault && v.quantity > 0) ??
    variants.find((v) => v.quantity > 0) ??
    variants.find((v) => v.isDefault) ??
    variants[0]
  );
};

export interface ProductDetailClientProps {
  /** The id or slug from the URL, already resolved by the server page. */
  idOrSlug: string;
  /**
   * The product as the server rendered it. Present on a normal navigation, so
   * the page paints complete; absent only if that fetch failed, in which case
   * the effect below fetches it exactly as it always did.
   */
  initialProduct?: ProductDetail | null;
}

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

/**
 * The standing promises, restated at the point of purchase — but only the ones
 * true of this product. "Made to order" means print or embroidery, which only
 * clothing the seller marked customizable offers; a television never did.
 */
const trustPoints = (product: ProductDetail, isApparel: boolean) =>
  [
    { title: 'Free shipping', detail: 'On orders over ₹999' },
    product.isCustomizable && isApparel
      ? { title: 'Made to order', detail: 'Add your print or embroidery' }
      : null,
    product.allowBulkOrders ? { title: 'B2B pricing', detail: 'Wholesale rates on bulk orders' } : null,
  ].filter((point): point is { title: string; detail: string } => point !== null);

/**
 * One size, Myntra-style: a circle, struck through diagonally and disabled
 * when that size is gone, so the shopper sees the whole run and what is left.
 */
const SizeChip: React.FC<{
  label: string;
  active: boolean;
  soldOut: boolean;
  onSelect: () => void;
  extra?: React.ReactNode;
}> = ({ label, active, soldOut, onSelect, extra }) => (
  <button
    type="button"
    onClick={onSelect}
    disabled={soldOut}
    aria-pressed={active}
    aria-label={soldOut ? `${label}, out of stock` : label}
    className="relative inline-flex h-12 min-w-[3rem] items-center justify-center overflow-hidden rounded-full px-3 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed"
    style={{
      border: active
        ? '1.5px solid var(--ink)'
        : `1px solid ${soldOut ? 'var(--border)' : 'var(--border-strong)'}`,
      background: 'var(--surface)',
      color: soldOut ? 'var(--ink-3)' : 'var(--ink)',
      opacity: soldOut ? 0.55 : 1,
    }}
  >
    {label}
    {extra}
    {soldOut && (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to top right, transparent calc(50% - 0.5px), var(--ink-3) 50%, transparent calc(50% + 0.5px))',
        }}
      />
    )}
  </button>
);

/**
 * The line under the sizes, Myntra-style: ask for a size when they tried to buy
 * without one, warn when the picked size is nearly gone, say plainly when the
 * whole colour is sold out.
 */
const StockNote: React.FC<{
  soldOut: boolean;
  soldOutText: string;
  sizeError: boolean;
  picked?: ProductVariant;
  optionNoun: string;
}> = ({ soldOut, soldOutText, sizeError, picked, optionNoun }) => {
  let text: string | null = null;
  if (soldOut) text = soldOutText;
  else if (sizeError) text = `Please select a ${optionNoun}.`;
  else if (picked && picked.quantity > 0 && picked.quantity <= 5) text = `Only ${picked.quantity} left!`;
  if (!text) return null;
  return (
    <p
      role={sizeError ? 'alert' : undefined}
      className="mt-3 text-[13px] font-semibold"
      style={{ color: 'var(--sale)' }}
    >
      {text}
    </p>
  );
};

function ProductDetailContent({ idOrSlug, initialProduct }: ProductDetailClientProps) {
  const router = useRouter();
  // The shop grid links to a single colourway; this is which one.
  const requestedColor = useSearchParams().get('color');
  const dispatch = useDispatch<AppDispatch>();

  const [product, setProduct] = useState<ProductDetail | null>(initialProduct ?? null);
  const [isLoading, setIsLoading] = useState(!initialProduct);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const [activeImage, setActiveImage] = useState(0);
  // Seeded from the server's product where there is one, so a server-rendered
  // arrival opens on the linked colourway and at the product's minimum order
  // quantity without a correcting render after paint.
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(() =>
    initialProduct ? openingVariant(initialProduct, requestedColor)?.id : undefined
  );
  const [quantity, setQuantity] = useState(() =>
    Math.max(1, initialProduct?.minOrderQuantity || 1)
  );
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [isAdding, setIsAdding] = useState(false);
  // No size is chosen for the shopper. The selected variant still carries the
  // colour, but until they tap a size it is not "their" size: Add to Cart asks
  // for one instead of quietly buying the default.
  const [sizePicked, setSizePicked] = useState(false);
  const [sizeError, setSizeError] = useState(false);

  /**
   * Everything that has to happen once a product arrives from the network:
   * which colourway to open on, the quantity to start at, and the
   * recently-viewed rail.
   *
   * A server-rendered arrival does not come through here — that product is
   * already in hand at first render, so the same decisions are made in the
   * initial state above rather than set from an effect afterwards.
   */
  const applyLoaded = useCallback(
    (loaded: ProductDetail) => {
      setProduct(loaded);
      setQuantity(Math.max(1, loaded.minOrderQuantity || 1));
      setSelectedVariantId(openingVariant(loaded, requestedColor)?.id);
      setSizePicked(false);
      // Recorded on a successful load only, so a 404 never enters the rail.
      recordRecentlyViewed(loaded.id);
    },
    [requestedColor]
  );

  // The server already fetched this product and it is on screen; don't
  // immediately re-request it and flash a spinner over identical content.
  const skipFirstFetch = useRef(Boolean(initialProduct));

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      // State is already seeded from this product; only the rail is left.
      if (initialProduct) recordRecentlyViewed(initialProduct.id);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiClient
      .get(`/products/${encodeURIComponent(idOrSlug)}`)
      .then((res) => {
        if (cancelled) return;
        const loaded: ProductDetail | undefined = res.data?.data?.product;
        if (!loaded) {
          setIsNotFound(true);
          return;
        }
        applyLoaded(loaded);
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
  }, [idOrSlug, applyLoaded, initialProduct]);

  /**
   * Re-read the product after a review is saved, so the average and count in
   * the header agree with the list underneath it without a page reload. The
   * backend recomputes both when a review is written.
   */
  const refreshProduct = useCallback(() => {
    apiClient
      .get(`/products/${encodeURIComponent(idOrSlug)}`)
      .then((res) => {
        const loaded: ProductDetail | undefined = res.data?.data?.product;
        if (loaded) setProduct(loaded);
      })
      .catch(() => {
        // The review itself is saved; a stale header is not worth an error.
      });
  }, [idOrSlug]);

  const selectedVariant: ProductVariant | undefined = useMemo(
    () => product?.variants?.find((v) => v.id === selectedVariantId),
    [product, selectedVariantId]
  );

  /**
   * Colour and size are two decisions, not one.
   *
   * The API already groups the variants — each colour carries its own gallery,
   * its sizes and the stock underneath them. This page used to ignore that and
   * render one flat button per variant, so a shirt in four colours and six
   * sizes was twenty-four buttons reading "Navy / M", "Navy / L"… Picking a
   * colour here narrows the sizes and swaps the photographs, which is how the
   * shopper is actually thinking about it.
   */
  // Memoised because it feeds the useMemo below: `?? []` builds a new array on
  // every render, which would make that dependency change every time.
  const colors = useMemo(() => product?.colors ?? [], [product]);
  const hasColors = colors.length > 0;

  /** The colour the selected variant belongs to. */
  const activeColor = useMemo(() => {
    if (!hasColors) return undefined;
    const bySelection = colors.find((color) =>
      color.sizes.some((size) => size.id === selectedVariantId)
    );
    if (bySelection) return bySelection;
    // Nothing chosen yet: open on one that can actually be bought.
    return colors.find((color) => color.stock > 0) ?? colors[0];
  }, [colors, hasColors, selectedVariantId]);

  const gallery = useMemo(() => {
    // A colour's own photographs win; the product's gallery is the fallback for
    // a colour that has none of its own.
    const source = activeColor?.images?.length
      ? activeColor.images
      : [product?.thumbnail, ...(product?.images ?? [])];
    const images = source.filter(
      (img, index, arr): img is string => Boolean(img) && arr.indexOf(img) === index
    );
    return images.length > 0 ? images : [undefined];
  }, [product, activeColor]);

  /**
   * Switch colour, keeping the size the shopper already chose where that
   * colour has it in stock. Dropping them back to "pick a size" every time
   * they look at another colour is the most common way this control annoys
   * people.
   */
  const chooseColor = (colorId: string) => {
    const color = colors.find((candidate) => candidate.id === colorId);
    if (!color) return;

    const currentSize = colors
      .flatMap((candidate) => candidate.sizes)
      .find((size) => size.id === selectedVariantId)?.size;

    const sameSize = currentSize
      ? color.sizes.find((size) => size.size === currentSize && size.stock > 0)
      : undefined;
    const next = sameSize ?? color.sizes.find((size) => size.stock > 0) ?? color.sizes[0];

    setSelectedVariantId(next?.id);
    // Their size carries over only if this colour has it in stock.
    if (!sameSize) setSizePicked(false);
    // The gallery belongs to the colour, so start it at the first photograph
    // rather than leaving it on an index the new colour may not have.
    setActiveImage(0);
  };

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

  const hasVariants = (product.variants?.length ?? 0) > 0;
  /** Sizes on offer for the colour on screen (or every variant, with no colours). */
  const sizeCount = hasColors ? (activeColor?.sizes.length ?? 0) : (product.variants?.length ?? 0);
  // A single size needs no choosing.
  const needsSize = hasVariants && sizeCount > 1;
  const sizeChosen = !needsSize || sizePicked;
  // Before a size is picked, "out of stock" is about the colour (or the whole
  // product); after, about that size. product.quantity is already the sum
  // across sizes (the API computes it).
  const outOfStock =
    sizeChosen && selectedVariant
      ? selectedVariant.quantity <= 0
      : (hasColors ? (activeColor?.stock ?? 0) : product.quantity) <= 0;
  const pickSize = (variantId: string) => {
    setSelectedVariantId(variantId);
    setSizePicked(true);
    setSizeError(false);
  };
  // Clothing has a size chart; shoes, electronics and home goods name their
  // own option ("UK size", "Variant") and have no size guide to open.
  const isApparel = product.listing?.family !== 'general';
  const optionLabel = isApparel ? 'Size' : (product.listing?.optionLabel ?? 'Size');
  const optionNoun = optionLabel.toLowerCase();
  /** A variant's extra options, e.g. Storage: 128 GB, beside its size. */
  const variantOptions = Object.entries(selectedVariant?.options ?? {}).filter(([, value]) =>
    Boolean(value)
  );
  const hasDiscount =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price;
  const bulkTiers = (product.bulkPricings ?? [])
    .slice()
    .sort((a, b) => a.minQty - b.minQty);
  // Print and embroidery are for clothing only (the server enforces it too).
  const hasCustomizations =
    isApparel && product.isCustomizable && (product.customizations?.length ?? 0) > 0;

  const stepQuantity = (delta: number) => {
    setQuantity((q) => Math.min(maxQty, Math.max(minQty, q + delta)));
  };

  const handleAddToCart = async () => {
    if (!sizeChosen) {
      setSizeError(true);
      document.getElementById('size-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
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
            {(product.categoryTrail?.length
              ? product.categoryTrail
              : product.category?.name
                ? [{ ...product.category, path: [] as string[] }]
                : []
            ).map((step) => (
              <React.Fragment key={step.id}>
                <li aria-hidden="true" style={{ color: 'var(--border-strong)' }}>
                  /
                </li>
                <li>
                  {step.path.length ? (
                    <Link href={storeHref(step)} className="transition-colors hover:text-ink">
                      {step.name}
                    </Link>
                  ) : (
                    step.name
                  )}
                </li>
              </React.Fragment>
            ))}
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
            {/* Brand takes the eyebrow slot when there is one — it is the
                stronger signal on a marketplace, and it links to the brand's
                own page rather than being a dead label. */}
            {product.brand ? (
              <Link
                href={`/brands/${product.brand.slug}`}
                className="mb-3 inline-block no-underline"
              >
                <Eyebrow className="transition-colors hover:text-ink">
                  {product.brand.name}
                  {product.category?.name ? ` · ${product.category.name}` : ''}
                </Eyebrow>
              </Link>
            ) : (
              product.category?.name && <Eyebrow className="mb-3">{product.category.name}</Eyebrow>
            )}

            <h1
              className="m-0"
              style={{
                // Product names run long ("Girl Peach Net Embroidered Full
                // Sleeves…"); at 40px they took four lines above the price.
                fontSize: 'clamp(22px, 2.2vw, 30px)',
                fontWeight: 600,
                lineHeight: 1.15,
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
              <span style={{ color: 'var(--ink-3)' }}>SKU {(sizeChosen && selectedVariant?.sku) || product.sku}</span>
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

            {/* Other colourways: separate listings in one colour group. Shown
                as photos, the way the marketplaces do, because each colour
                has its own photographs. */}
            {(product.colourSiblings?.length ?? 0) > 1 && (
              <section className="mt-7 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <Eyebrow>More colours</Eyebrow>
                  <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                    {product.colourSiblings!.length} colours
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {product.colourSiblings!.map((sibling) => {
                    const label = sibling.colour || sibling.name;
                    const frame = {
                      border: `1px solid ${sibling.current ? 'var(--ink)' : 'var(--border-strong)'}`,
                    };
                    const body = (
                      <>
                        <span className="block h-[68px] w-[52px] overflow-hidden bg-surface-2">
                          <ProductThumb src={sibling.thumbnail} alt={label} className="h-full w-full object-cover" />
                        </span>
                        <span className="mt-1 block max-w-[52px] truncate text-center text-[11px] text-ink-2">
                          {label}
                        </span>
                      </>
                    );
                    return sibling.current ? (
                      <span key={sibling.id} aria-current="true" title={label} className="block p-0.5" style={frame}>
                        {body}
                      </span>
                    ) : (
                      <Link
                        key={sibling.id}
                        href={`/products/${sibling.slug}`}
                        title={`${label} — ${sibling.name}`}
                        className="block p-0.5 transition-transform hover:scale-[1.03]"
                        style={frame}
                      >
                        {body}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Variants */}
            {hasVariants && (
              <section className="mt-7 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
                {hasColors ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <Eyebrow>
                        Colour
                        {activeColor && (
                          <span className="ml-2 font-normal normal-case tracking-normal text-ink">
                            {activeColor.name}
                          </span>
                        )}
                      </Eyebrow>
                      <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                        {colors.length} colour{colors.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {colors.map((color) => {
                        const isActive = activeColor?.id === color.id;
                        const soldOut = color.stock <= 0;
                        return (
                          <button
                            key={color.id}
                            type="button"
                            onClick={() => chooseColor(color.id)}
                            aria-pressed={isActive}
                            aria-label={`${color.name}${soldOut ? ' — sold out' : ''}`}
                            title={color.name}
                            className="relative flex h-10 w-10 items-center justify-center transition-transform hover:scale-105"
                            style={{
                              border: `1px solid ${isActive ? 'var(--ink)' : 'var(--border-strong)'}`,
                              // A sold-out colour stays clickable: the shopper
                              // may still want to see it, and hiding it makes
                              // the range look smaller than it is.
                              opacity: soldOut ? 0.45 : 1,
                            }}
                          >
                            <ColorSwatch color={color} size={22} />
                            {soldOut && (
                              <span
                                aria-hidden="true"
                                className="absolute inset-0"
                                style={{
                                  background:
                                    'linear-gradient(to top right, transparent calc(50% - 0.5px), var(--ink-3) 50%, transparent calc(50% + 0.5px))',
                                }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div id="size-picker" className="mt-6 flex items-center justify-between gap-3">
                      <Eyebrow>Select {optionNoun}</Eyebrow>
                      {isApparel && (
                        <SizeGuideModal productSizeGuide={product.sizeGuide} variants={product.variants} measurementBasis={product.measurementBasis} />
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {(activeColor?.sizes ?? []).map((size) => (
                        <SizeChip
                          key={size.id}
                          label={size.size ?? (isApparel ? 'One size' : 'Standard')}
                          active={sizeChosen && selectedVariantId === size.id}
                          soldOut={size.stock <= 0}
                          onSelect={() => pickSize(size.id)}
                        />
                      ))}
                    </div>

                    {variantOptions.length > 0 && (
                      <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                        {variantOptions.map(([name, value]) => `${name}: ${value}`).join(' · ')}
                      </p>
                    )}

                    {/* Low stock is a reason to decide now, but only when it is
                        true of the size actually picked. */}
                    <StockNote
                      soldOut={(activeColor?.stock ?? 0) <= 0}
                      soldOutText="Out of stock in this colour. Try another colour."
                      sizeError={sizeError && !sizeChosen}
                      picked={sizeChosen ? selectedVariant : undefined}
                      optionNoun={optionNoun}
                    />
                  </>
                ) : (
                  <>
                    <div id="size-picker" className="flex items-center justify-between gap-3">
                      <Eyebrow>Select {isApparel ? 'variant' : optionNoun}</Eyebrow>
                      {isApparel && (
                        <SizeGuideModal productSizeGuide={product.sizeGuide} variants={product.variants} measurementBasis={product.measurementBasis} />
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {(product.variants ?? []).map((variant) => (
                        <SizeChip
                          key={variant.id}
                          label={variantLabel(variant)}
                          active={sizeChosen && selectedVariantId === variant.id}
                          soldOut={variant.quantity <= 0}
                          onSelect={() => pickSize(variant.id)}
                          extra={
                            typeof variant.price === 'number' && variant.price !== product.price ? (
                              <span className="ml-1.5 opacity-60">{formatCurrency(variant.price)}</span>
                            ) : undefined
                          }
                        />
                      ))}
                    </div>
                    <StockNote
                      soldOut={product.quantity <= 0}
                      soldOutText="Out of stock."
                      sizeError={sizeError && !sizeChosen}
                      picked={sizeChosen ? selectedVariant : undefined}
                      optionNoun={isApparel ? 'variant' : optionNoun}
                    />
                  </>
                )}
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
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>Quantity</Eyebrow>
                {/* Most products carry no size variants, and the guide would
                    otherwise only appear on the ones that do. */}
                {!hasVariants && isApparel && <SizeGuideModal productSizeGuide={product.sizeGuide} variants={product.variants} measurementBasis={product.measurementBasis} />}
              </div>
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
                  {!outOfStock && !hasVariants && maxQty <= 10 && (
                    <p className="m-0 font-semibold" style={{ color: 'var(--sale)' }}>
                      Only {maxQty} left in stock
                    </p>
                  )}
                </div>
              </div>

              {outOfStock ? (
                // A sold-out product with only a dead button is where a
                // shopper leaves and we never learn there was demand.
                <NotifyMeButton
                  className="mt-5"
                  productId={product.id}
                  variantId={selectedVariant?.id}
                  variantLabel={selectedVariant ? variantLabel(selectedVariant) : undefined}
                />
              ) : (
                <Button
                  fullWidth
                  variant="primary"
                  size="lg"
                  className="mt-5"
                  onClick={handleAddToCart}
                  loading={isAdding}
                >
                  {`Add to Cart • ${formatCurrency(unitPrice * quantity)}`}
                </Button>
              )}

              <WishlistButton
                className="mt-2.5"
                productId={product.id}
                productName={product.name}
              />

              {product.allowBulkOrders && (
                <Link
                  href="/b2b"
                  className="btn btn-outline btn-lg btn-block mt-2.5"
                >
                  Request a bulk quote
                </Link>
              )}

              {product.vendor && <SellerLine seller={product.vendor} className="mt-4" />}

              <div className="mt-7 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
                <PincodeChecker />
              </div>
            </section>

            {/* Trust row */}
            <ul
              className={`mt-7 grid grid-cols-1 gap-px ${
                ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3'][trustPoints(product, isApparel).length]
              }`}
              style={{ background: 'var(--border)', border: '1px solid var(--border)' }}
            >
              {trustPoints(product, isApparel).map((point) => (
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
                  {/* Line breaks are preserved: a description written as
                      separate lines — a care list, the attribute lines a sheet
                      import produces — otherwise collapses into one run-on
                      paragraph that nobody reads. */}
                  <p
                    className="mt-4 max-w-[68ch] whitespace-pre-line text-[15px]"
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
                    // The chosen variant's extra options (Storage: 128 GB).
                    ...variantOptions,
                    ['Brand', product.brand?.name],
                    ['Category', product.category?.name],
                    // Fabric, fit, neck, care, origin… from the marketplace listing.
                    ...listingSpecRows(product),
                    ['Minimum order', `${minQty} ${minQty === 1 ? 'unit' : 'units'}`],
                    // Print / embroidery is a clothing service; elsewhere the row means nothing.
                    isApparel ? ['Customizable', product.isCustomizable ? 'Yes' : 'No'] : ['', ''],
                    ['Bulk orders', product.allowBulkOrders ? 'Accepted' : 'Not available'],
                  ]
                    .filter(([, value]) => Boolean(value))
                    .map(([label, value]) => (
                      <div
                        key={label as string}
                        className="flex items-baseline justify-between gap-4 py-2.5 text-[13px]"
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <dt className="shrink-0" style={{ color: 'var(--ink-3)' }}>{label}</dt>
                        <dd className="m-0 text-right font-semibold" style={{ color: 'var(--ink)' }}>
                          {value}
                        </dd>
                      </div>
                    ))}
                </dl>

                {/* Legal Metrology (Packaged Commodities) Rules: who made, packed
                    and imported the product must be shown on the listing. */}
                {legalDisclosure(product).length > 0 && (
                  <details className="group mt-4 text-[13px]" style={{ borderBottom: '1px solid var(--border)' }}>
                    <summary
                      className="flex cursor-pointer list-none items-center justify-between gap-4 py-2.5 font-semibold"
                      style={{ color: 'var(--ink)' }}
                    >
                      Manufacturer / Packer / Importer
                      <span aria-hidden className="transition-transform group-open:rotate-45" style={{ color: 'var(--ink-3)' }}>
                        +
                      </span>
                    </summary>
                    <dl className="m-0 pb-3">
                      {legalDisclosure(product).map(([label, value]) => (
                        <div key={label} className="mt-2">
                          <dt className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-3)' }}>
                            {label}
                          </dt>
                          <dd className="m-0 mt-0.5 whitespace-pre-line" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </div>
            </div>
          </section>
        )}

        <Reviews
          productRef={idOrSlug}
          rating={product.rating}
          reviewCount={product.reviewCount}
          onSaved={refreshProduct}
        />

        <div className="mx-auto mt-14 pt-10" style={{ maxWidth: '1240px', borderTop: '1px solid var(--border)' }}>
          <RecentlyViewed excludeId={product.id} />
        </div>
      </div>

      {/*
        The buy button, kept reachable on a phone.

        On a narrow screen the gallery alone is most of a viewport, so the real
        add-to-cart is far above the description, the size guide, the reviews
        and the recently-viewed rail. A shopper who scrolls down to read about
        the product has to scroll all the way back up to buy it. This is the
        same action, not a second one — it calls the same handler with the same
        selected variant and quantity — and it only exists below `sm`, where the
        original is off screen.
      */}
      {!outOfStock && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t px-4 py-3 sm:hidden"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface)',
            // Above the home indicator on a phone with no hardware button.
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
            boxShadow: '0 -6px 24px rgba(17, 17, 17, 0.08)',
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[12px]" style={{ color: 'var(--ink-3)' }}>
              {selectedVariant ? variantLabel(selectedVariant) : product.name}
            </p>
            <p className="m-0 text-[16px] font-semibold text-ink">
              {formatCurrency(unitPrice * quantity)}
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={handleAddToCart}
            loading={isAdding}
            className="flex-shrink-0"
          >
            Add to Cart
          </Button>
        </div>
      )}
    </main>
  );
}

/**
 * `useSearchParams` — which reads the `?color=` a shop tile links with — opts
 * the tree into client rendering, so the page body sits behind a Suspense
 * boundary rather than opting the whole route out of prerendering.
 */
export default function ProductDetailClient(props: ProductDetailClientProps) {
  return (
    <Suspense fallback={<LoadingSpinner className="min-h-[60vh]" size="lg" />}>
      <ProductDetailContent {...props} />
    </Suspense>
  );
}
