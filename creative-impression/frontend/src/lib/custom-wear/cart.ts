/**
 * Adapter between the Custom Wear model and the existing cart slice.
 *
 * The cart in `store/slices/cart.ts` is typed against the legacy `Product`
 * shape, so Custom Wear products are mapped here rather than changing the cart
 * (which other pages already depend on).
 */

import type { CartItem, Product } from '@/types';
import type {
  CustomWearProduct,
  CustomizationSelection,
  DeliverySpeedId,
  QuantityPricing,
} from '@/types/custom-wear';

export function toLegacyProduct(product: CustomWearProduct): Product {
  const now = new Date().toISOString();
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    shortDescription: product.shortDescription,
    status: 'ACTIVE',
    price: product.basePrice,
    discountPercentage: 0,
    sku: product.sku,
    quantity: 0,
    minOrderQuantity: product.minOrderQuantity ?? 1,
    isFeatured: Boolean(product.badges?.includes('bestseller')),
    isCustomizable: true,
    allowBulkOrders: true,
    thumbnail: product.images[0]?.url,
    images: product.images.map((image) => image.url),
    rating: product.rating ?? 0,
    ratingCount: product.reviewCount ?? 0,
    reviewCount: product.reviewCount ?? 0,
    createdAt: product.createdAt ?? now,
    updatedAt: now,
  };
}

export interface BuildCartItemInput {
  product: CustomWearProduct;
  colorId: string;
  sizeId: string;
  pricing: QuantityPricing;
  customization: CustomizationSelection;
  deliverySpeed: DeliverySpeedId;
}

/**
 * Builds the cart line. The id encodes the full configuration so two different
 * customizations of the same garment stay separate lines.
 */
export function buildCartItem({
  product,
  colorId,
  sizeId,
  pricing,
  customization,
  deliverySpeed,
}: BuildCartItemInput): CartItem {
  const configurationKey = [
    colorId,
    sizeId,
    customization.method ?? 'none',
    [...customization.locations].sort().join('+') || 'none',
    customization.templateId ?? 'no-template',
    customization.uploads.map((upload) => upload.name).join('|') || 'no-upload',
  ].join('_');

  const color = product.colors.find((entry) => entry.id === colorId);
  const variantImage = color?.imageId
    ? product.images.find((image) => image.id === color.imageId)
    : undefined;

  return {
    id: `cw_${product.id}_${configurationKey}`,
    productId: product.id,
    product: toLegacyProduct(product),
    variantId: `${product.sku}-${color?.skuSuffix ?? colorId.toUpperCase()}-${sizeId}`,
    quantity: pricing.quantity,
    price: pricing.unitPrice,
    customization: {
      colorId,
      colorName: color?.name ?? colorId,
      sizeId,
      method: customization.method,
      locations: customization.locations,
      templateId: customization.templateId,
      designFileNames: customization.uploads.map((upload) => upload.name),
      notes: customization.notes,
      setupFee: pricing.setupFee,
      deliverySpeed,
    },
    mockupImage: variantImage?.url ?? product.images[0]?.url,
    isBulkOrder: pricing.quantity >= 25,
  };
}

/** Variant SKU shown next to the colour selector. */
export function variantSku(
  product: CustomWearProduct,
  colorId: string | null,
  sizeId: string | null
): string {
  const color = product.colors.find((entry) => entry.id === colorId);
  return [product.sku, color?.skuSuffix, sizeId].filter(Boolean).join('-');
}
