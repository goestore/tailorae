import { SIZE_ORDER } from '@/utils/product-spec';
import { familyByName } from '@/utils/colour-families';
import type { Product, ProductVariant } from '@prisma/client';

/**
 * Colour cards, derived from a product's size variants.
 *
 * 9impression models this as a dedicated `product_colors` table: a colour owns
 * a model number, a six-image gallery and the sizes beneath it. This project
 * already carries the same information on `ProductVariant` — `color`, `images`,
 * `size`, `sku`, `quantity` — so the colours are grouped out of the variants
 * rather than duplicated into a second table nobody would remember to fill in.
 * Their own backend has exactly this fallback for products predating their
 * colour table.
 *
 * The shop grid renders one tile per colour: a four-colour polo is four cards,
 * each showing its own photograph. That is the whole point of the shape.
 */

export interface ColorCard {
  /** Stable within the product — the colour name is the identity here. */
  id: string;
  name: string;
  /** Reserved for a stored swatch value; the storefront maps names to CSS. */
  hex: string | null;
  /** First image of the colour, used as the grid tile. */
  image: string | null;
  /** Sum of the sizes underneath, so a colour can be shown as sold out. */
  stock: number;
  /** The fixed colour family it files under; what the filter matches on. */
  family: string | null;
}

export interface ColorDetail extends ColorCard {
  images: string[];
  sizes: Array<{
    id: string;
    size: string | null;
    sku: string;
    stock: number;
  }>;
}

type VariantLike = Pick<
  ProductVariant,
  'id' | 'color' | 'size' | 'sku' | 'quantity' | 'images' | 'isDefault'
> & { colorFamily?: string | null };
type ProductLike = Pick<Product, 'thumbnail' | 'images' | 'color'> & {
  quantity?: number;
  colourHexes?: unknown;
  colorFamily?: string | null;
};

/** The seller's shade, else the family's own, else none (named guess in the UI). */
// Multi has no single shade: its grey would hide "Black & Purple". Leaving it
// null lets the storefront draw the two colours from the name.
const shadeFor = (product: ProductLike, name: string, family: string | null): string | null =>
  swatchHex(product, name) ??
  (family && family !== 'Multi' ? (familyByName(family)?.hex ?? null) : null);

const familyOf = (variants: VariantLike[]): string | null =>
  variants.find((v) => v.colorFamily)?.colorFamily ?? null;

/** The seller's chosen swatch for a colour, matched case-insensitively. */
export function swatchHex(product: { colourHexes?: unknown }, name: string): string | null {
  const map = product.colourHexes;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
  const wanted = colorKey(name);
  for (const [key, hex] of Object.entries(map as Record<string, unknown>)) {
    if (colorKey(key) === wanted && typeof hex === 'string') return hex;
  }
  return null;
}

/** Case- and space-insensitive grouping key; display keeps the first spelling. */
const colorKey = (value: string): string => value.trim().toLowerCase();

/**
 * Group variants by colour, preserving the order they were returned in.
 *
 * A product whose variants carry no colour at all yields a single card from the
 * product's own `color` field, or none — which the grid then renders as one
 * plain tile, exactly as it does today.
 */
function groupByColor(variants: VariantLike[]): Map<string, { name: string; variants: VariantLike[] }> {
  const groups = new Map<string, { name: string; variants: VariantLike[] }>();
  for (const variant of variants) {
    const name = (variant.color ?? '').trim();
    if (!name) continue;
    const key = colorKey(name);
    const existing = groups.get(key);
    if (existing) existing.variants.push(variant);
    else groups.set(key, { name, variants: [variant] });
  }
  return groups;
}

/** First usable image for a colour: a variant's own, else the product's. */
const firstImage = (variants: VariantLike[], product: ProductLike): string | null => {
  for (const variant of variants) {
    if (variant.images?.length) return variant.images[0];
  }
  return product.thumbnail || product.images?.[0] || null;
};

/**
 * Lightweight colour cards for the listing grid.
 *
 * Returns an empty array when the product has no colour information, which the
 * grid reads as "render one tile for the product itself".
 */
export function colorCards(product: ProductLike, variants: VariantLike[]): ColorCard[] {
  const groups = groupByColor(variants);

  if (groups.size === 0) {
    const own = (product.color ?? '').trim();
    if (!own) return [];
    return [
      {
        id: colorKey(own),
        name: own,
        hex: shadeFor(product, own, product.colorFamily ?? null),
        image: product.thumbnail || product.images?.[0] || null,
        stock: product.quantity ?? 0,
        family: product.colorFamily ?? null,
      },
    ];
  }

  return [...groups.entries()].map(([key, group]) => ({
    id: key,
    name: group.name,
    hex: shadeFor(product, group.name, familyOf(group.variants)),
    image: firstImage(group.variants, product),
    stock: group.variants.reduce((sum, v) => sum + Math.max(0, v.quantity), 0),
    family: familyOf(group.variants),
  }));
}

/**
 * What can actually be bought. A product sold in sizes keeps its stock on the
 * variants, and its own `quantity` column is not kept in step with them — so a
 * shirt with ten mediums used to show "Out of stock" on its card because the
 * product row said 0. With variants, their sum is the truth.
 */
export function effectiveStock(product: { quantity: number }, variants: Array<{ quantity: number }>): number {
  if (variants.length === 0) return product.quantity;
  return variants.reduce((sum, v) => sum + Math.max(0, v.quantity), 0);
}

/**
 * Sizes in the order a shopper reads them: the catalogue's own size order
 * (XS, S, M… / 0-3M, 3-6M… / UK 3, UK 3.5…), then by the first number in the
 * label (2-3Y before 11-12Y), then alphabetically. Variants come back in
 * creation order, which put 11-12Y ahead of 3-4Y.
 */
const firstNumber = (size: string): number => {
  const match = size.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
};
function bySize(a: { size: string | null }, b: { size: string | null }): number {
  const x = (a.size ?? '').trim();
  const y = (b.size ?? '').trim();
  const rx = SIZE_ORDER.indexOf(x);
  const ry = SIZE_ORDER.indexOf(y);
  if (rx !== -1 && ry !== -1) return rx - ry;
  if (rx !== -1 || ry !== -1) return rx === -1 ? 1 : -1;
  return firstNumber(x) - firstNumber(y) || x.localeCompare(y);
}

/** Colour cards with their sizes, for the product detail page. */
export function colorDetails(product: ProductLike, variants: VariantLike[]): ColorDetail[] {
  const groups = groupByColor(variants);
  if (groups.size === 0) return [];

  return [...groups.entries()].map(([key, group]) => {
    // A colour's gallery is every distinct image across its sizes; the sizes of
    // one colour normally share photographs, so duplicates are dropped.
    const images = [...new Set(group.variants.flatMap((variant) => variant.images ?? []))];
    const gallery = images.length
      ? images
      : [product.thumbnail, ...(product.images ?? [])].filter((image): image is string =>
          Boolean(image)
        );

    return {
      id: key,
      name: group.name,
      hex: shadeFor(product, group.name, familyOf(group.variants)),
      family: familyOf(group.variants),
      image: gallery[0] ?? null,
      images: gallery,
      sizes: [...group.variants].sort(bySize).map((variant) => ({
        id: variant.id,
        size: variant.size,
        sku: variant.sku,
        stock: variant.quantity,
      })),
      stock: group.variants.reduce((sum, variant) => sum + variant.quantity, 0),
    };
  });
}

/** Every distinct colour name in a set of variants, for the filter facets. */
export function distinctColorNames(
  rows: Array<{ color: string | null }>
): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const name = (row.color ?? '').trim();
    if (!name) continue;
    const key = colorKey(name);
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
