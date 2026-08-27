import React from 'react';
import { Product } from '@/types';
import { formatCurrency } from '@/utils/helpers';
import { BaseProductCard, type ProductCardModel } from './BaseProductCard';
import { QuickAddButton } from './QuickAddButton';

export interface ProductCardProps {
  product: Product;
  /** Applied to the card's outer element — how a rail gives it width and snap. */
  className?: string;
  priority?: boolean;
}

/** Adapts a catalog product onto the shared card model. */
export function toProductCardModel(product: Product): ProductCardModel {
  const hasDiscount =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price;
  const off = Math.round(product.discountPercentage);

  return {
    href: `/products/${product.slug || product.id}`,
    name: product.name,
    image: product.thumbnail || product.images?.[0],
    price: formatCurrency(product.price),
    comparePrice: hasDiscount ? formatCurrency(product.originalPrice as number) : undefined,
    discountLabel: hasDiscount && off > 0 ? `${off}% off` : undefined,
    outOfStock: product.quantity <= 0,
  };
}

/**
 * Catalog product card. All markup lives in `BaseProductCard`; this only maps a
 * `Product` onto the shared model and supplies the quick-add bar.
 */
export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  className = '',
  priority = false,
}) => {
  const model = toProductCardModel(product);

  return (
    <BaseProductCard
      model={model}
      className={className}
      priority={priority}
      mediaBar={<QuickAddButton product={product} href={model.href} />}
    />
  );
};
