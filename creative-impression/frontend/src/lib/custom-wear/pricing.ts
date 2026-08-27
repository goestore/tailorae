/**
 * Quantity-based pricing.
 *
 * All tier data comes from the product record — nothing here assumes a
 * particular price point, so the same code serves any catalogue.
 */

import type {
  CustomWearProduct,
  CustomizationPlacement,
  PriceTier,
  QuantityPricing,
} from '@/types/custom-wear';

export interface PricingInput {
  product: CustomWearProduct;
  quantity: number;
  placements?: CustomizationPlacement[];
}

export function findTier(tiers: PriceTier[] | undefined, quantity: number): PriceTier | undefined {
  if (!tiers || tiers.length === 0) return undefined;
  return (
    tiers.find(
      (tier) => quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)
    ) ?? tiers[tiers.length - 1]
  );
}

export function findNextTier(
  tiers: PriceTier[] | undefined,
  quantity: number
): PriceTier | undefined {
  if (!tiers) return undefined;
  return tiers.find((tier) => tier.minQty > quantity);
}

/** Unit price before any customization surcharge. */
export function unitPriceForQuantity(product: CustomWearProduct, quantity: number): number {
  const tier = findTier(product.priceTiers, quantity);
  return tier ? tier.pricePerUnit : product.basePrice;
}
export function calculatePricing({
  product,
  quantity,
  placements = [],
}: PricingInput): QuantityPricing {
  const safeQuantity = Math.max(1, Math.floor(quantity) || 1);
  const tiers = product.priceTiers;
  const tier = findTier(tiers, safeQuantity);
  const nextTier = findNextTier(tiers, safeQuantity);

  const baseUnitPrice = tier ? tier.pricePerUnit : product.basePrice;

  /**
   * Decoration is quoted per placement: each one is applied by its own method,
   * and each print area beyond the first carries the area surcharge. Setup is
   * charged once per distinct method — one screen burn covers every placement
   * printed the same way.
   */
  const priced = placements
    .map((placement) => ({
      method: placement.method
        ? product.customizationMethods.find(
            (entry) => entry.id === placement.method && entry.supported
          )
        : undefined,
      location: product.customizationLocations.find(
        (entry) => entry.id === placement.location && entry.supported
      ),
    }))
    .filter((entry) => entry.method);

  const methodPerUnit = priced.reduce((sum, entry) => sum + (entry.method?.pricePerUnit ?? 0), 0);

  // The first area is included in the method price; the rest are surcharged.
  const locationPerUnit = priced
    .slice(1)
    .reduce((sum, entry) => sum + (entry.location?.pricePerUnit ?? 0), 0);

  const customizationPerUnit = methodPerUnit + locationPerUnit;

  const setupFee = Array.from(
    new Map(priced.map((entry) => [entry.method!.id, entry.method!.setupFee ?? 0])).values()
  ).reduce((sum, fee) => sum + fee, 0);

  const unitPrice = baseUnitPrice + customizationPerUnit;
  const subtotal = unitPrice * safeQuantity;
  const total = subtotal + setupFee;

  const tierOnePrice = tiers?.[0]?.pricePerUnit ?? product.basePrice;
  const savings = Math.max(0, (tierOnePrice - baseUnitPrice) * safeQuantity);

  return {
    quantity: safeQuantity,
    unitPrice,
    baseUnitPrice,
    customizationPerUnit,
    setupFee,
    subtotal,
    total,
    savings,
    tier,
    nextTier,
  };
}

/** "1–9 units", "100+ units" */
export function formatTierRange(tier: PriceTier): string {
  if (tier.maxQty === null) return `${tier.minQty}+ units`;
  if (tier.minQty === tier.maxQty) return `${tier.minQty} unit${tier.minQty > 1 ? 's' : ''}`;
  return `${tier.minQty}–${tier.maxQty} units`;
}

/** Card price line: "₹399 – ₹570 each" or "₹570 each". */
export function formatPriceRange(product: CustomWearProduct, currencySymbol = '₹'): string {
  const min = product.basePrice;
  const max = product.maxPrice ?? product.basePrice;
  if (min === max) return `${currencySymbol}${min} each`;
  return `${currencySymbol}${min} – ${currencySymbol}${max} each`;
}

/** "From ₹399 each at 100+ units" — only when a genuine volume tier exists. */
export function formatBulkTeaser(product: CustomWearProduct, currencySymbol = '₹'): string | null {
  const tiers = product.priceTiers;
  if (!tiers || tiers.length < 2) return null;
  const best = tiers[tiers.length - 1];
  if (best.pricePerUnit >= tiers[0].pricePerUnit) return null;
  return `From ${currencySymbol}${best.pricePerUnit} each at ${best.minQty}+ units`;
}
