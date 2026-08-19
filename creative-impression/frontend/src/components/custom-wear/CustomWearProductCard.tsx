'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useDispatch, useSelector } from 'react-redux';
import { BADGE_LABELS } from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';
import { formatBulkTeaser, formatPriceRange } from '@/lib/custom-wear/pricing';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import { toggleWishlistItem } from '@/store/slices/customWear';
import type { RootState } from '@/store';
import type { CustomWearProduct, PurchaseMode } from '@/types/custom-wear';
import { StarRating } from './StarRating';

export interface CustomWearProductCardProps {
  product: CustomWearProduct;
  mode: PurchaseMode;
  /** Swatches shown before the "+N" overflow indicator. */
  maxSwatches?: number;
  /** `priority` for above-the-fold cards so the LCP image is not lazy-loaded. */
  priority?: boolean;
  className?: string;
}

const productHref = (product: CustomWearProduct, mode: PurchaseMode): string =>
  `/custom-wear/product/${product.slug}${mode === 'quote' ? '?mode=quote' : ''}`;

/**
 * The single product card used by the collection grid, related products and
 * recently viewed — there is no second copy of this markup anywhere.
 */
export const CustomWearProductCard: React.FC<CustomWearProductCardProps> = ({
  product,
  mode,
  maxSwatches = 6,
  priority = false,
  className = '',
}) => {
  const dispatch = useDispatch();
  const wishlist = useSelector((state: RootState) => state.customWear.wishlist);
  const isWishlisted = wishlist.includes(product.id);

  const [activeColorId, setActiveColorId] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const { labels } = customWearContent;

  const primaryImage = useMemo(
    () => product.images.find((image) => image.role === 'front') ?? product.images[0],
    [product.images]
  );

  const displayImage = useMemo(() => {
    if (!activeColorId) return primaryImage;
    const color = product.colors.find((entry) => entry.id === activeColorId);
    const variantImage = color?.imageId
      ? product.images.find((image) => image.id === color.imageId)
      : undefined;
    return variantImage ?? primaryImage;
  }, [activeColorId, product.colors, product.images, primaryImage]);

  const visibleSwatches = product.colors.slice(0, maxSwatches);
  const overflowCount = product.colors.length - visibleSwatches.length;
  const bulkTeaser = formatBulkTeaser(product);

  const handleWishlist = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch(toggleWishlistItem(product.id));
    trackCustomWearEvent('custom_wear_wishlist_toggled', {
      productId: product.id,
      active: !isWishlisted,
    });
  };

  const handleSwatch = (event: React.MouseEvent, colorId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveColorId(colorId);
    setImageFailed(false);
    trackCustomWearEvent('custom_wear_color_selected', {
      productId: product.id,
      color: colorId,
      surface: 'card',
    });
  };

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden bg-white transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_36px_-18px_rgba(0,0,0,0.4)] ${className}`.trim()}
      style={{
        border: '1px solid var(--cw-border)',
        borderRadius: 'var(--cw-radius-card)',
      }}
    >
      {/* Image */}
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: 'var(--cw-card-aspect)', backgroundColor: 'var(--cw-surface-alt)' }}
      >
        <Link
          href={productHref(product, mode)}
          className="block h-full w-full"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() =>
            trackCustomWearEvent('custom_wear_product_clicked', {
              productId: product.id,
              mode,
            })
          }
        >
          {imageFailed || !displayImage ? (
            <span
              className="flex h-full w-full items-center justify-center px-4 text-center"
              style={{ color: 'var(--cw-ink-subtle)', fontSize: 'var(--cw-fs-micro)' }}
            >
              {product.name}
            </span>
          ) : (
            <Image
              src={displayImage.url}
              alt={displayImage.alt}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              loading={priority ? undefined : 'lazy'}
              priority={priority}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              onError={() => setImageFailed(true)}
            />
          )}
        </Link>

        {/* Badges */}
        {product.badges && product.badges.length > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.badges.slice(0, 2).map((badge) => (
              <span
                key={badge}
                className="uppercase"
                style={{
                  backgroundColor: badge === 'bestseller' ? 'var(--cw-primary)' : 'var(--cw-black)',
                  color: badge === 'bestseller' ? 'var(--cw-on-primary)' : 'var(--cw-white)',
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  padding: '5px 9px',
                  borderRadius: 'var(--cw-radius-chip)',
                }}
              >
                {BADGE_LABELS[badge] ?? badge}
              </span>
            ))}
          </div>
        )}

        {/* Wishlist */}
        <button
          suppressHydrationWarning
          type="button"
          onClick={handleWishlist}
          aria-pressed={isWishlisted}
          aria-label={
            isWishlisted
              ? `Remove ${product.name} from wishlist`
              : `Add ${product.name} to wishlist`
          }
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition-colors hover:bg-white"
          style={{ border: '1px solid var(--cw-border)' }}
        >
          <svg
            className="h-[18px] w-[18px]"
            viewBox="0 0 24 24"
            fill={isWishlisted ? 'var(--cw-primary)' : 'none'}
            stroke={isWishlisted ? 'var(--cw-primary)' : 'var(--cw-ink-muted)'}
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 20.5s-7.5-4.6-7.5-9.8A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 3.1c0 5.2-7.5 9.8-7.5 9.8Z"
            />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
        {/* Colour swatches */}
        {product.colors.length > 0 && (
          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label={`Colours available for ${product.name}`}
          >
            {visibleSwatches.map((color) => {
              const isActive = activeColorId === color.id;
              return (
                <button
                  suppressHydrationWarning
                  key={color.id}
                  type="button"
                  onClick={(event) => handleSwatch(event, color.id)}
                  aria-label={`Preview ${color.name}`}
                  aria-pressed={isActive}
                  title={color.name}
                  className="relative h-[18px] w-[18px] flex-shrink-0 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: color.secondaryHex
                      ? `linear-gradient(135deg, ${color.hex} 50%, ${color.secondaryHex} 50%)`
                      : color.hex,
                    boxShadow: isActive
                      ? '0 0 0 1.5px var(--cw-white), 0 0 0 3px var(--cw-primary)'
                      : 'inset 0 0 0 1px rgba(0,0,0,0.16)',
                  }}
                />
              );
            })}
            {overflowCount > 0 && (
              <span
                style={{
                  color: 'var(--cw-ink-subtle)',
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        <h3 style={{ margin: 0 }}>
          <Link
            href={productHref(product, mode)}
            className="transition-colors hover:underline"
            style={{
              color: 'var(--cw-ink)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-product)',
              fontWeight: 600,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            onClick={() =>
              trackCustomWearEvent('custom_wear_product_clicked', {
                productId: product.id,
                mode,
              })
            }
          >
            {product.name}
          </Link>
        </h3>

        {product.rating !== undefined && (
          <StarRating rating={product.rating} reviewCount={product.reviewCount} />
        )}

        <div className="mt-auto pt-1">
          {mode === 'shop' ? (
            <p
              style={{
                margin: 0,
                color: 'var(--cw-ink)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-small)',
                fontWeight: 700,
              }}
            >
              {formatPriceRange(product)}
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                color: 'var(--cw-ink-muted)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-small)',
                fontWeight: 600,
              }}
            >
              {customWearContent.quote.startingFromPrefix} ₹{product.basePrice}
            </p>
          )}

          {bulkTeaser && (
            <p
              style={{
                margin: '3px 0 0',
                color: 'var(--cw-ink-subtle)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: '11.5px',
              }}
            >
              {bulkTeaser}
            </p>
          )}
        </div>

        <Link
          href={productHref(product, mode)}
          className={`cw-cta mt-1 block w-full text-center ${mode === 'quote' ? 'cw-cta--accent' : ''}`}
          onClick={() =>
            trackCustomWearEvent('custom_wear_product_clicked', {
              productId: product.id,
              mode,
              via: 'cta',
            })
          }
        >
          {mode === 'shop' ? labels.cardShopCta : labels.cardQuoteCta}
        </Link>
      </div>
    </article>
  );
};
