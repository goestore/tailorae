/**
 * Custom Wear lines in the cart.
 *
 * A custom garment is made to order and priced by a person, so it is not a
 * payable cart item: the server cart (and checkout) only knows catalogue
 * products. Instead the configured garment becomes a `CustomWearQuoteLine`,
 * held in the `customWear` slice and shown in its own section of the cart,
 * from where the shopper requests a quote for all of them at once.
 */

import type {
  CustomWearProduct,
  CustomWearQuoteLine,
  CustomizationSelection,
  QuantityPricing,
  QuoteLinePayload,
  QuotePlacement,
} from '@/types/custom-wear';

export interface BuildQuoteLineInput {
  product: CustomWearProduct;
  colorId: string | null;
  sizeIds: string[];
  pricing: QuantityPricing;
  customization: CustomizationSelection;
}

export function placementsFor(customization: CustomizationSelection): QuotePlacement[] {
  return customization.placements.map((placement) => ({
    location: placement.location,
    method: placement.method,
    templateId: placement.templateId,
    designFileName:
      customization.uploads.find((upload) => upload.id === placement.uploadId)?.name ?? null,
    widthPercent: Math.round(placement.scale * 100),
  }));
}

/** Uploads that reached storage, i.e. the ones the print team can open. */
export const storedUploads = (customization: CustomizationSelection) =>
  customization.uploads.filter((upload) => upload.status === 'ready' && upload.url);

/**
 * Builds the line. The id encodes the full configuration so two different
 * customizations of the same garment stay separate lines.
 */
export function buildQuoteLine({
  product,
  colorId,
  sizeIds,
  pricing,
  customization,
}: BuildQuoteLineInput): CustomWearQuoteLine {
  // Every placement is in the key: two garments differing only by what is
  // printed on the back are different products and must not merge into one line.
  const placementKey =
    customization.placements
      .map((placement) =>
        [
          placement.location,
          placement.method ?? 'no-method',
          placement.templateId ??
            customization.uploads.find((upload) => upload.id === placement.uploadId)?.url ??
            'no-art',
          Math.round(placement.scale * 100),
        ].join('-')
      )
      .sort()
      .join('+') || 'plain';

  const sizes = [...sizeIds].sort();
  const configurationKey = [colorId ?? 'any', sizes.join('.') || 'nosize', placementKey].join('_');

  const color = product.colors.find((entry) => entry.id === colorId);
  const variantImage = color?.imageId
    ? product.images.find((image) => image.id === color.imageId)
    : undefined;
  const stored = storedUploads(customization);

  return {
    id: `cw_${product.id}_${configurationKey}`,
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    sku: product.sku,
    image: variantImage?.url ?? product.images[0]?.url,
    colorId,
    colorName: color?.name ?? null,
    sizes,
    quantity: pricing.quantity,
    estimatedUnitPrice: pricing.unitPrice,
    estimatedTotal: pricing.total,
    placements: placementsFor(customization),
    designFileNames: stored.map((upload) => upload.name),
    designFiles: stored.map((upload) => upload.url as string),
    notes: customization.notes,
    addedAt: new Date().toISOString(),
  };
}

/** The request body for one line of `POST /custom-wear/quotes/batch`. */
export function quoteLinePayload(line: CustomWearQuoteLine): QuoteLinePayload {
  return {
    productId: line.productId,
    productSlug: line.productSlug,
    productName: line.productName,
    sku: line.sku,
    colorId: line.colorId,
    colorName: line.colorName,
    sizes: line.sizes,
    quantity: line.quantity,
    placements: line.placements,
    designFileNames: line.designFileNames,
    designFiles: line.designFiles,
    notes: line.notes,
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
