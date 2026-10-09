'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FABRIC_LABELS } from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';
import { formatTierRange } from '@/lib/custom-wear/pricing';
import { formatCurrency } from '@/utils/helpers';
import type { CustomWearProduct } from '@/types/custom-wear';
import { Breadcrumbs, type Crumb } from '../Breadcrumbs';
import { CustomWearProductCard } from '../CustomWearProductCard';
import { ProductPhotos } from './ProductPhotos';
import { Designer } from './Designer';
import { QuoteSheet } from './QuoteSheet';
import { useProductConfig } from './useProductConfig';

export interface ProductViewProps {
  product: CustomWearProduct;
  relatedProducts: CustomWearProduct[];
  breadcrumbs: Crumb[];
}

/**
 * The Custom Wear product page.
 *
 * Photography leads and the ordering controls sit beside it, the way any
 * product page works; decorating the garment is a mode you enter from here.
 * Earlier versions made a flat vector wireframe the hero, which meant the first
 * thing a shopper saw was a diagram rather than the thing they were buying, and
 * the design tool still had too little room to aim at a print area.
 */
export const ProductView: React.FC<ProductViewProps> = ({
  product,
  relatedProducts,
  breadcrumbs,
}) => {
  const config = useProductConfig(product);
  const [isDesignerOpen, setDesignerOpen] = useState(false);
  const [isQuoteOpen, setQuoteOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const spec = [
    product.gsm ? `${product.gsm} GSM` : null,
    product.fabric ? FABRIC_LABELS[product.fabric] : null,
    product.fit,
  ]
    .filter(Boolean)
    .join(' · ');

  const areas = config.selection.placements.length;

  const handleAdd = () => {
    const { ok, errors } = config.commitToCart();
    if (ok) {
      setFlash(
        `Added ${config.pricing.quantity} to your cart. Custom pieces are priced by our team, so you request a quote from the cart instead of paying at checkout.`
      );
      return;
    }
    // Artwork is the one requirement that cannot be satisfied on this page, so
    // send them where it can be. Read the returned errors, not `config.errors`:
    // those only update on the next render.
    if (errors.artwork) setDesignerOpen(true);
  };

  return (
    <div className="cw-pdp">
      <div className="cw-pdp-inner">
        <Breadcrumbs items={breadcrumbs} className="mb-4" />

        <div className="cw-pdp-grid">
          <div className="cw-pdp-media">
            <ProductPhotos
              product={product}
              color={config.color}
              colorTouched={config.colorTouched}
            />
          </div>

          <div className="cw-pdp-buy">
            <h1>{product.name}</h1>
            <p className="cw-pdp-spec">
              {spec}
              {product.rating !== undefined && (
                <span className="cw-pdp-rating">★ {product.rating.toFixed(1)}</span>
              )}
            </p>

            <p className="cw-pdp-price">
              {formatCurrency(config.pricing.unitPrice)}
              <span> / unit</span>
            </p>

            {/* Colour */}
            <section className="cw-field">
              <h2>
                Colour
                {config.color && <span>{config.color.name}</span>}
                {config.errors.color && <em role="alert">{config.errors.color}</em>}
              </h2>
              <div className="cw-swatches" role="radiogroup" aria-label="Garment colour">
                {product.colors.map((entry) => (
                  <button
                    suppressHydrationWarning
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={entry.id === config.colorId}
                    aria-label={entry.name}
                    title={entry.name}
                    onClick={() => config.setColor(entry.id)}
                    className="cw-swatch-lg"
                    data-active={entry.id === config.colorId ? 'true' : undefined}
                    style={{
                      background: entry.secondaryHex
                        ? `linear-gradient(135deg, ${entry.hex} 50%, ${entry.secondaryHex} 50%)`
                        : entry.hex,
                    }}
                  />
                ))}
              </div>
            </section>

            {/* Size */}
            <section className="cw-field">
              <h2>
                Size
                {config.errors.size && <em role="alert">{config.errors.size}</em>}
              </h2>
              <div className="cw-chips" role="group" aria-label="Size">
                {product.sizes.map((size) => (
                  <button
                    suppressHydrationWarning
                    key={size.id}
                    type="button"
                    aria-pressed={config.sizeIds.includes(size.id)}
                    disabled={size.inStock === false}
                    onClick={() => config.toggleSize(size.id)}
                    className="cw-chip"
                    data-active={config.sizeIds.includes(size.id) ? 'true' : undefined}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Quantity + volume */}
            <section className="cw-field">
              <h2>Quantity</h2>
              <div className="cw-qty-row">
                <div className="cw-stepper">
                  <button
                    suppressHydrationWarning
                    type="button"
                    onClick={() => config.setQuantity(config.quantity - 1)}
                    disabled={config.quantity <= config.minQuantity}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <input
                    suppressHydrationWarning
                    type="number"
                    inputMode="numeric"
                    min={config.minQuantity}
                    value={config.quantity}
                    aria-label="Quantity"
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      config.setQuantity(Number.isFinite(parsed) ? parsed : config.minQuantity);
                    }}
                  />
                  <button
                    suppressHydrationWarning
                    type="button"
                    onClick={() => config.setQuantity(config.quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <div className="cw-tiers" role="group" aria-label="Volume pricing">
                  {(product.priceTiers ?? []).map((tier) => {
                    const isOn =
                      config.quantity >= tier.minQty &&
                      (tier.maxQty === null || config.quantity <= tier.maxQty);
                    return (
                      <button
                        suppressHydrationWarning
                        key={tier.minQty}
                        type="button"
                        onClick={() => config.setQuantity(tier.minQty)}
                        aria-pressed={isOn}
                        className="cw-tier"
                        data-active={isOn ? 'true' : undefined}
                      >
                        <span className="cw-tier-qty">{formatTierRange(tier)}</span>
                        <span className="cw-tier-price">{formatCurrency(tier.pricePerUnit)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Artwork — summarised here, edited in design mode. */}
            <section className="cw-field">
              <h2>
                Artwork
                {config.errors.artwork && <em role="alert">{config.errors.artwork}</em>}
              </h2>
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => setDesignerOpen(true)}
                className="cw-design-btn"
              >
                <span>
                  {areas === 0
                    ? 'Add your logo or design'
                    : `${areas} print area${areas === 1 ? '' : 's'}`}
                </span>
                <span className="cw-design-btn-go">
                  {areas === 0 ? 'Customize' : 'Edit'} <span aria-hidden="true">→</span>
                </span>
              </button>
            </section>

            <div className="cw-pdp-total">
              <span>Total</span>
              <strong>{formatCurrency(config.pricing.total)}</strong>
              {config.pricing.savings > 0 && (
                <span className="cw-pdp-save">save {formatCurrency(config.pricing.savings)}</span>
              )}
            </div>

            <div className="cw-pdp-actions">
              {config.mode === 'shop' ? (
                <button
                  suppressHydrationWarning
                  type="button"
                  onClick={handleAdd}
                  disabled={config.uploadsPending}
                  className="cw-cta cw-cta--accent"
                >
                  {config.uploadsPending ? 'Uploading artwork…' : 'Add to cart'}
                </button>
              ) : (
                <button
                  suppressHydrationWarning
                  type="button"
                  onClick={() => setQuoteOpen(true)}
                  className="cw-cta cw-cta--accent"
                >
                  Request quote
                </button>
              )}
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => config.setMode(config.mode === 'shop' ? 'quote' : 'shop')}
                className="cw-cta cw-cta--outline"
              >
                {config.mode === 'shop' ? 'Get quote' : 'Shop now'}
              </button>
            </div>

            {flash && (
              <p role="status" className="cw-pdp-flash">
                {flash}{' '}
                <Link href="/cart#custom-wear" className="underline">
                  View cart
                </Link>
              </p>
            )}
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <section className="cw-related">
            <h2 className="cw-eyebrow">{customWearContent.labels.relatedHeading}</h2>
            <div className="cw-related-grid">
              {relatedProducts.slice(0, 4).map((entry) => (
                <CustomWearProductCard key={entry.id} product={entry} mode={config.mode} />
              ))}
            </div>
          </section>
        )}
      </div>

      <Designer
        product={product}
        config={config}
        isOpen={isDesignerOpen}
        onClose={() => setDesignerOpen(false)}
      />

      <QuoteSheet
        isOpen={isQuoteOpen}
        onClose={() => setQuoteOpen(false)}
        product={product}
        colorId={config.colorId}
        sizes={config.sizeIds}
        quantity={config.quantity}
        customization={config.selection}
      />
    </div>
  );
};
