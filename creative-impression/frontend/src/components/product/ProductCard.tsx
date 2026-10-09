import React from 'react';
import { Product, ProductColor } from '@/types';
import { formatCurrency } from '@/utils/helpers';
import { BaseProductCard, type ProductCardModel } from './BaseProductCard';
import { resolveSwatchStyle } from '@/lib/color-map';
import { QuickAddButton } from './QuickAddButton';

export interface ProductCardProps {
  product: Product;
  /**
   * Render this one colour of the product instead of the product itself: its
   * photograph, its swatch, and a link that opens the page with the colour
   * already chosen. The shop grid passes one card per colour.
   */
  color?: ProductColor;
  /** Applied to the card's outer element — how a rail gives it width and snap. */
  className?: string;
  priority?: boolean;
}

/** Adapts a catalog product onto the shared card model. */
export function toProductCardModel(product: Product, color?: ProductColor): ProductCardModel {
  const hasDiscount =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price;
  // Worked out from the two prices when the stored percentage is missing, so
  // a grid card says "38% off" exactly as the Best Selling rail does.
  const off = Math.round(
    product.discountPercentage ||
      (hasDiscount ? ((product.originalPrice! - product.price) / product.originalPrice!) * 100 : 0)
  );
  const base = `/products/${product.slug || product.id}`;

  return {
    // The colour rides in the query string, so the product page opens on the
    // colour the shopper clicked rather than the default one.
    href: color ? `${base}?color=${encodeURIComponent(color.name)}` : base,
    name: product.name,
    brand: product.brand?.name,
    // A colour's own photograph is the whole point of a per-colour tile; only
    // fall back to the product shot when that colour has none.
    image: color?.image || product.thumbnail || product.images?.[0],
    price: formatCurrency(product.price),
    comparePrice: hasDiscount ? formatCurrency(product.originalPrice as number) : undefined,
    discountLabel: hasDiscount && off > 0 ? `${off}% off` : undefined,
    // A colour tile is sold out only when that colour is; the product's
    // quantity is already the sum across its sizes.
    outOfStock: (color?.stock ?? product.quantity) <= 0,
  };
}

/**
 * Catalog product card. All markup lives in `BaseProductCard`; this only maps a
 * `Product` onto the shared model and supplies the quick-add bar.
 *
 * With a `color`, the card stands for one colourway rather than the product —
 * the same shape 9impression's shop grid uses, where a four-colour design
 * occupies four tiles instead of hiding three of them behind a click.
 */
export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  color,
  className = '',
  priority = false,
}) => {
  const model = toProductCardModel(product, color);
  // A colour tile shows its colour; a product card shows its only colour.
  const shown = color ?? (product.colors?.length === 1 ? product.colors[0] : undefined);

  return (
    <BaseProductCard
      model={model}
      className={className}
      priority={priority}
      mediaBar={<QuickAddButton product={product} href={model.href} />}
      swatch={shown ? <CardSwatch color={shown} /> : undefined}
    />
  );
};

/** The square at the end of the card's name line, in the seller's chosen shade. */
const CardSwatch: React.FC<{ color: ProductColor }> = ({ color }) => {
  const swatch = resolveSwatchStyle(color);
  return (
    <span
      role="img"
      aria-label={`Colour: ${color.name}`}
      title={color.name}
      className="pcard-swatch"
      style={{
        ...swatch.style,
        border: swatch.isLight ? '1px solid var(--border-strong)' : '1px solid transparent',
      }}
    />
  );
};
