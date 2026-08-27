'use client';

import React, { useMemo } from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import { formatPriceRange } from '@/lib/custom-wear/pricing';
import { BaseProductCard, type ProductCardModel } from '@/components/product';
import { GarmentMark } from './GarmentMark';
import type { CustomWearProduct, PurchaseMode } from '@/types/custom-wear';

export interface CustomWearProductCardProps {
  product: CustomWearProduct;
  mode: PurchaseMode;
  /** `priority` for above-the-fold cards so the LCP image is not lazy-loaded. */
  priority?: boolean;
  className?: string;
}

const productHref = (product: CustomWearProduct, mode: PurchaseMode): string =>
  `/custom-wear/product/${product.slug}${mode === 'quote' ? '?mode=quote' : ''}`;

/**
 * Custom Wear product card. All markup lives in `BaseProductCard` — the same
 * component the catalog uses — so the two are one object. This only maps a
 * `CustomWearProduct` onto the shared model.
 *
 * Nothing is drawn over the photograph: no badges, no wishlist, no swatches.
 * Colour, wishlist and every other choice belong on the product page, where
 * there is room to show them properly.
 */
export const CustomWearProductCard: React.FC<CustomWearProductCardProps> = ({
  product,
  mode,
  priority = false,
  className = '',
}) => {
  const primaryImage = useMemo(
    () => product.images.find((image) => image.role === 'front') ?? product.images[0],
    [product.images]
  );

  /** Second shot, cross-faded in on hover when the product has one. */
  const hoverImage = useMemo(
    () =>
      product.images.find(
        (image) =>
          image.id !== primaryImage?.id && (image.role === 'back' || image.role === 'lifestyle')
      ),
    [product.images, primaryImage]
  );

  const model: ProductCardModel = {
    href: productHref(product, mode),
    name: product.name,
    alt: primaryImage?.alt ?? product.name,
    image: primaryImage?.url,
    hoverImage: hoverImage?.url,
    transitionName: `cw-hero-${product.id}`,
    price:
      mode === 'shop'
        ? formatPriceRange(product)
        : `${customWearContent.quote.startingFromPrefix} ₹${product.basePrice}`,
  };

  return (
    <BaseProductCard
      model={model}
      className={className}
      priority={priority}
      mediaFallback={
        <span className="pcard-garment">
          <GarmentMark
            hex={product.colors[0]?.hex}
            label={`${product.name}${product.colors[0] ? ` in ${product.colors[0].name}` : ''}`}
          />
        </span>
      }
    />
  );
};
