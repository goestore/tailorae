'use client';

import React from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import { formatCurrency } from '@/utils/helpers';
import { variantSku } from '@/lib/custom-wear/cart';
import type {
  CustomWearProduct,
  CustomizationSelection,
  DeliverySpeedId,
  DesignTemplate,
  PurchaseMode,
  QuantityPricing,
} from '@/types/custom-wear';
import { StarRating } from '../StarRating';
import { PurchaseModeToggle } from '../PurchaseModeToggle';
import { BulkPricing } from './BulkPricing';
import { ColorSelector } from './ColorSelector';
import { CustomizationPanel } from './CustomizationPanel';
import { DeliveryEstimator } from './DeliveryEstimator';
import { QuantitySelector } from './QuantitySelector';
import { SizeSelector } from './SizeSelector';

export interface ProductSummaryValidation {
  color?: string;
  size?: string;
  customization?: string;
}

export interface ProductSummaryProps {
  product: CustomWearProduct;
  mode: PurchaseMode;
  onModeChange: (mode: PurchaseMode) => void;

  colorId: string | null;
  onColorChange: (colorId: string) => void;

  selectedSizes: string[];
  onSizeToggle: (sizeId: string) => void;
  onOpenSizeGuide: () => void;

  quantity: number;
  onQuantityChange: (quantity: number) => void;

  deliverySpeed: DeliverySpeedId;
  onDeliverySpeedChange: (speed: DeliverySpeedId) => void;

  customization: CustomizationSelection;
  onCustomizationChange: (selection: CustomizationSelection) => void;
  onBrowseDesigns: () => void;
  selectedTemplate?: DesignTemplate;

  pricing: QuantityPricing;
  errors: ProductSummaryValidation;

  onAddToCart: () => void;
  onBuyNow: () => void;
  onRequestQuote: () => void;
  cartMessage: string | null;
}

/**
 * The right-hand configuration panel: identity, price, delivery, variants,
 * customization and the mode-dependent action area.
 */
export const ProductSummary: React.FC<ProductSummaryProps> = ({
  product,
  mode,
  onModeChange,
  colorId,
  onColorChange,
  selectedSizes,
  onSizeToggle,
  onOpenSizeGuide,
  quantity,
  onQuantityChange,
  deliverySpeed,
  onDeliverySpeedChange,
  customization,
  onCustomizationChange,
  onBrowseDesigns,
  selectedTemplate,
  pricing,
  errors,
  onAddToCart,
  onBuyNow,
  onRequestQuote,
  cartMessage,
}) => {
  const { labels, quote } = customWearContent;
  const tierPresets = (product.priceTiers ?? [])
    .map((tier) => tier.minQty)
    .filter((min) => min > 1);
  const isVolumeEnquiry = quantity >= quote.volumeContactThreshold;

  return (
    <div className="flex flex-col gap-6">
      {/* Identity */}
      <header>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--cw-font-heading)',
            fontSize: 'clamp(23px, 2.6vw, 34px)',
            fontWeight: 600,
            lineHeight: 1.2,
            letterSpacing: '-0.015em',
            color: 'var(--cw-ink)',
          }}
        >
          {product.name}
        </h1>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {product.rating !== undefined && (
            <StarRating rating={product.rating} reviewCount={product.reviewCount} size={15} />
          )}
          <span
            style={{
              color: 'var(--cw-ink-subtle)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
            }}
          >
            SKU {variantSku(product, colorId, selectedSizes[0] ?? null)}
          </span>
        </div>

        <p
          style={{
            margin: '12px 0 0',
            maxWidth: '58ch',
            color: 'var(--cw-ink-muted)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            lineHeight: 1.65,
          }}
        >
          {product.shortDescription}
        </p>
      </header>

      {/* Highlights */}
      {product.highlights && product.highlights.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {product.highlights.slice(0, 7).map((highlight) => (
            <li
              key={highlight}
              className="flex gap-2.5"
              style={{
                color: 'var(--cw-ink-muted)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-small)',
                lineHeight: 1.55,
              }}
            >
              <span
                aria-hidden="true"
                className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--cw-primary)' }}
              />
              {highlight}
            </li>
          ))}
        </ul>
      )}

      {/* Mode */}
      <div style={{ borderTop: '1px solid var(--cw-border)', paddingTop: '20px' }}>
        <p
          className="mb-2.5 uppercase"
          style={{
            margin: '0 0 10px',
            color: 'var(--cw-ink-subtle)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: '10.5px',
            fontWeight: 700,
            letterSpacing: '0.12em',
          }}
        >
          {labels.modeGroupLabel}
        </p>
        <PurchaseModeToggle mode={mode} onChange={onModeChange} size="sm" />
      </div>

      {/* Price */}
      <section aria-live="polite">
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'clamp(24px, 2.4vw, 32px)',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--cw-ink)',
          }}
        >
          {mode === 'quote' && (
            <span
              style={{
                fontSize: 'var(--cw-fs-small)',
                fontWeight: 500,
                color: 'var(--cw-ink-subtle)',
              }}
            >
              {quote.startingFromPrefix}{' '}
            </span>
          )}
          {formatCurrency(pricing.unitPrice)}
          <span
            style={{
              fontSize: 'var(--cw-fs-small)',
              fontWeight: 500,
              color: 'var(--cw-ink-subtle)',
            }}
          >
            {' '}
            / unit
          </span>
        </p>

        <p
          style={{
            margin: '6px 0 0',
            color: 'var(--cw-ink-subtle)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
          }}
        >
          {pricing.quantity} unit{pricing.quantity === 1 ? '' : 's'} ·{' '}
          {pricing.setupFee > 0 ? `${formatCurrency(pricing.setupFee)} setup fee` : 'No setup fee'}
          {pricing.customizationPerUnit > 0 &&
            ` · includes ${formatCurrency(pricing.customizationPerUnit)} customization per unit`}
        </p>

        {mode === 'shop' && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span
              style={{
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-small)',
                fontWeight: 700,
                color: 'var(--cw-ink)',
              }}
            >
              Total {formatCurrency(pricing.total)}
            </span>
            {pricing.savings > 0 && (
              <span
                style={{
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: 'var(--cw-fs-small)',
                  fontWeight: 600,
                  color: 'var(--cw-success)',
                }}
              >
                You save {formatCurrency(pricing.savings)}
              </span>
            )}
          </div>
        )}

        {isVolumeEnquiry && (
          <p
            style={{
              margin: '10px 0 0',
              padding: '9px 11px',
              backgroundColor: 'var(--cw-primary-soft)',
              border: '1px solid var(--cw-primary)',
              borderRadius: 'var(--cw-radius-control)',
              color: 'var(--cw-ink-muted)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
            }}
          >
            {quote.volumeContactText} — request a quote for the sharpest price at this volume.
          </p>
        )}
      </section>

      {/* Delivery */}
      <DeliveryEstimator
        orderValue={pricing.total}
        speed={deliverySpeed}
        onSpeedChange={onDeliverySpeedChange}
      />

      {/* Variants */}
      <ColorSelector
        colors={product.colors}
        selectedColorId={colorId}
        onSelect={onColorChange}
        meta={
          errors.color ? (
            <span
              role="alert"
              style={{
                color: 'var(--cw-danger)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: 'var(--cw-fs-micro)',
              }}
            >
              {errors.color}
            </span>
          ) : undefined
        }
      />

      <SizeSelector
        sizes={product.sizes}
        selected={selectedSizes}
        multiple={mode === 'quote'}
        onSelect={onSizeToggle}
        onOpenSizeGuide={onOpenSizeGuide}
        error={errors.size}
      />

      <QuantitySelector
        quantity={quantity}
        minQuantity={product.minOrderQuantity ?? 1}
        onChange={onQuantityChange}
        presets={tierPresets}
      />

      {product.priceTiers && (
        <BulkPricing
          tiers={product.priceTiers}
          pricing={pricing}
          onSelectTier={(tier) =>
            onQuantityChange(Math.max(tier.minQty, product.minOrderQuantity ?? 1))
          }
        />
      )}

      {/* Customization */}
      <CustomizationPanel
        product={product}
        selection={customization}
        onChange={onCustomizationChange}
        onBrowseDesigns={onBrowseDesigns}
        selectedTemplate={selectedTemplate}
        error={errors.customization}
      />

      {/* Actions */}
      <section className="flex flex-col gap-2.5">
        {mode === 'shop' ? (
          <>
            <button
              suppressHydrationWarning
              type="button"
              onClick={onAddToCart}
              className="cw-cta cw-cta--accent w-full py-3.5"
            >
              {labels.shopCta}
            </button>
            <button
              suppressHydrationWarning
              type="button"
              onClick={onBuyNow}
              className="cw-cta w-full py-3.5"
            >
              {labels.buyNow}
            </button>
          </>
        ) : (
          <button
            suppressHydrationWarning
            type="button"
            onClick={onRequestQuote}
            className="cw-cta cw-cta--accent w-full py-3.5"
          >
            {labels.quoteCta}
          </button>
        )}

        {cartMessage && (
          <p
            role="status"
            style={{
              margin: 0,
              padding: '10px 12px',
              backgroundColor: 'var(--cw-surface-alt)',
              borderRadius: 'var(--cw-radius-control)',
              color: 'var(--cw-ink-muted)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
            }}
          >
            {cartMessage}
          </p>
        )}
      </section>
    </div>
  );
};
