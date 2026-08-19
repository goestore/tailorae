'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { customWearContent } from '@/config/custom-wear/content';
import { getDesignTemplateById } from '@/data/custom-wear/design-library';
import { buildCartItem } from '@/lib/custom-wear/cart';
import { calculatePricing } from '@/lib/custom-wear/pricing';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import { useUrlPurchaseMode } from '@/hooks/useUrlPurchaseMode';
import { addToCart } from '@/store/slices/cart';
import { hydrateWishlist } from '@/store/slices/customWear';
import type {
  CustomWearProduct,
  CustomizationSelection,
  DeliverySpeedId,
  DesignTemplate,
  PurchaseMode,
} from '@/types/custom-wear';
import { Breadcrumbs, type Crumb } from '../Breadcrumbs';
import { DesignLibraryModal } from './DesignLibraryModal';
import { ProductAccordions } from './ProductAccordions';
import { ProductCarousel } from './ProductCarousel';
import { ProductDescription } from './ProductDescription';
import { ProductGallery } from './ProductGallery';
import { ProductSummary, type ProductSummaryValidation } from './ProductSummary';
import { QuoteRequestModal } from './QuoteRequestModal';
import { RecentlyViewed } from './RecentlyViewed';
import { SizeGuideModal } from './SizeGuideModal';

export interface CustomWearProductDetailProps {
  product: CustomWearProduct;
  relatedProducts: CustomWearProduct[];
  alsoViewedProducts: CustomWearProduct[];
  breadcrumbs: Crumb[];
}

const emptyCustomization = (): CustomizationSelection => ({
  method: null,
  locations: [],
  uploads: [],
  templateId: null,
  notes: '',
});

/**
 * Product page shell. Owns the configuration state shared by the gallery, the
 * summary panel and both checkout paths.
 */
export const CustomWearProductDetail: React.FC<CustomWearProductDetailProps> = ({
  product,
  relatedProducts,
  alsoViewedProducts,
  breadcrumbs,
}) => {
  const dispatch = useDispatch();
  const router = useRouter();

  /**
   * Mode is mirrored locally so the toggle responds instantly, and re-synced
   * during render whenever the URL changes (deep link, back/forward). See
   * `useUrlPurchaseMode` for why the URL is not read with `useSearchParams`.
   */
  const urlMode = useUrlPurchaseMode();
  const [mode, setMode] = useState<PurchaseMode>('shop');
  const [syncedUrlMode, setSyncedUrlMode] = useState<PurchaseMode>('shop');
  if (syncedUrlMode !== urlMode) {
    setSyncedUrlMode(urlMode);
    setMode(urlMode);
  }
  const [colorId, setColorId] = useState<string | null>(product.colors[0]?.id ?? null);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(
    Math.max(product.defaultQuantity ?? 1, product.minOrderQuantity ?? 1)
  );
  const [deliverySpeed, setDeliverySpeed] = useState<DeliverySpeedId>('standard');
  const [customization, setCustomization] = useState<CustomizationSelection>(emptyCustomization);

  const [isSizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [isDesignLibraryOpen, setDesignLibraryOpen] = useState(false);
  const [isQuoteOpen, setQuoteOpen] = useState(false);

  const [errors, setErrors] = useState<ProductSummaryValidation>({});
  const [cartMessage, setCartMessage] = useState<string | null>(null);

  useEffect(() => {
    dispatch(hydrateWishlist());
  }, [dispatch]);

  const pricing = useMemo(
    () =>
      calculatePricing({
        product,
        quantity,
        method: customization.method,
        locations: customization.locations,
      }),
    [product, quantity, customization.method, customization.locations]
  );

  const selectedTemplate: DesignTemplate | undefined = customization.templateId
    ? getDesignTemplateById(customization.templateId)
    : undefined;

  /** Keeps `?mode=` in the URL so the choice survives a refresh or a share. */
  const handleModeChange = useCallback(
    (next: PurchaseMode) => {
      setMode(next);
      setErrors({});
      setCartMessage(null);
      trackCustomWearEvent('custom_wear_mode_changed', { mode: next, productId: product.id });

      const params = new URLSearchParams(window.location.search);
      if (next === 'quote') params.set('mode', 'quote');
      else params.delete('mode');
      const query = params.toString();
      router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
    },
    [product.id, router]
  );

  const handleColorChange = (nextColorId: string) => {
    setColorId(nextColorId);
    setErrors((current) => ({ ...current, color: undefined }));
    trackCustomWearEvent('custom_wear_color_selected', {
      productId: product.id,
      color: nextColorId,
      surface: 'detail',
    });
  };

  const handleSizeToggle = (sizeId: string) => {
    setSelectedSizes((current) => {
      if (mode === 'quote') {
        return current.includes(sizeId)
          ? current.filter((entry) => entry !== sizeId)
          : [...current, sizeId];
      }
      return current[0] === sizeId ? [] : [sizeId];
    });
    setErrors((current) => ({ ...current, size: undefined }));
    trackCustomWearEvent('custom_wear_size_selected', { productId: product.id, size: sizeId });
  };

  const handleQuantityChange = (nextQuantity: number) => {
    setQuantity(nextQuantity);
    trackCustomWearEvent('custom_wear_quantity_changed', {
      productId: product.id,
      quantity: nextQuantity,
    });
  };

  /** Shared validation for Add to Cart and Buy Now. */
  const validateShopFlow = (): boolean => {
    const next: ProductSummaryValidation = {};
    if (!colorId) next.color = 'Choose a colour.';
    if (selectedSizes.length === 0) next.size = 'Choose a size.';
    if (
      customization.uploads.filter((upload) => upload.status !== 'error').length === 0 &&
      !customization.templateId
    ) {
      next.customization = 'Add artwork: browse the design library or upload your own file.';
    } else if (!customization.method) {
      next.customization = 'Choose how the artwork should be applied.';
    } else if (customization.locations.length === 0) {
      next.customization = 'Choose at least one branding location.';
    }

    setErrors(next);

    if (Object.keys(next).length > 0) {
      const target = next.color ? 'Colour' : next.size ? 'Size' : 'Customization';
      setCartMessage(`${target} needs your attention before this can be added to the cart.`);
      return false;
    }
    return true;
  };

  const commitToCart = (): boolean => {
    if (!validateShopFlow() || !colorId) return false;

    dispatch(
      addToCart(
        buildCartItem({
          product,
          colorId,
          sizeId: selectedSizes[0],
          pricing,
          customization,
          deliverySpeed,
        })
      )
    );

    trackCustomWearEvent('custom_wear_add_to_cart', {
      productId: product.id,
      quantity: pricing.quantity,
      unitPrice: pricing.unitPrice,
      total: pricing.total,
    });

    return true;
  };

  const handleAddToCart = () => {
    if (!commitToCart()) return;
    setCartMessage(`Added ${pricing.quantity} × ${product.name} to your cart.`);
  };

  const handleBuyNow = () => {
    if (!commitToCart()) return;
    router.push('/checkout');
  };

  const handleRequestQuote = () => {
    setQuoteOpen(true);
    trackCustomWearEvent('custom_wear_quote_started', {
      productId: product.id,
      quantity,
    });
  };

  const handleSelectTemplate = (template: DesignTemplate) => {
    setCustomization((current) => ({ ...current, templateId: template.id }));
    setErrors((current) => ({ ...current, customization: undefined }));
    setDesignLibraryOpen(false);
  };

  return (
    <div
      className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-10"
      style={{ maxWidth: 'var(--cw-content-max)' }}
    >
      <Breadcrumbs items={breadcrumbs} className="mb-6" />

      {/*
        Desktop: gallery + long-form content share the left column so it runs
        to a similar length as the configurator, instead of leaving a tall
        empty gap under the thumbnails.

        Mobile: the wrapper becomes `display: contents`, so the gallery and the
        long-form content are direct flex children and can be ordered
        individually — gallery → configurator → details, which is the order a
        buyer needs on a phone.
      */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-12">
        <div className="contents lg:block">
          <div className="order-1 lg:order-none">
            <ProductGallery product={product} activeColorId={colorId} />
          </div>

          <div className="order-3 lg:order-none lg:mt-10">
            <h2
              style={{
                margin: '0 0 4px',
                fontFamily: 'var(--cw-font-heading)',
                fontSize: 'var(--cw-fs-section)',
                fontWeight: 600,
                letterSpacing: '-0.015em',
                color: 'var(--cw-ink)',
              }}
            >
              Product Information
            </h2>
            <div className="mt-4">
              <ProductAccordions sections={product.accordions ?? []} />
            </div>

            <ProductDescription block={product.descriptionBlock} />
          </div>
        </div>

        <div
          className={`order-2 lg:order-none ${
            customWearContent.productPage.stickySummary ? 'lg:sticky' : ''
          }`}
          style={
            customWearContent.productPage.stickySummary
              ? { top: customWearContent.productPage.stickyTopOffset }
              : undefined
          }
        >
          <ProductSummary
            product={product}
            mode={mode}
            onModeChange={handleModeChange}
            colorId={colorId}
            onColorChange={handleColorChange}
            selectedSizes={selectedSizes}
            onSizeToggle={handleSizeToggle}
            onOpenSizeGuide={() => setSizeGuideOpen(true)}
            quantity={quantity}
            onQuantityChange={handleQuantityChange}
            deliverySpeed={deliverySpeed}
            onDeliverySpeedChange={setDeliverySpeed}
            customization={customization}
            onCustomizationChange={(next) => {
              setCustomization(next);
              setErrors((current) => ({ ...current, customization: undefined }));
            }}
            onBrowseDesigns={() => setDesignLibraryOpen(true)}
            selectedTemplate={selectedTemplate}
            pricing={pricing}
            errors={errors}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onRequestQuote={handleRequestQuote}
            cartMessage={cartMessage}
          />
        </div>
      </div>

      <ProductCarousel
        title={customWearContent.labels.relatedHeading}
        products={relatedProducts}
        mode={mode}
      />

      <ProductCarousel
        title={customWearContent.labels.alsoViewedHeading}
        products={alsoViewedProducts}
        mode={mode}
      />

      <RecentlyViewed currentProductId={product.id} mode={mode} />

      {/* Sticky mobile action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 px-4 py-3 lg:hidden"
        style={{
          backgroundColor: 'var(--cw-white)',
          borderTop: '1px solid var(--cw-border)',
          boxShadow: '0 -6px 20px -12px rgba(0,0,0,0.35)',
        }}
      >
        <div className="min-w-0 flex-1">
          <p
            className="truncate"
            style={{
              margin: 0,
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-micro)',
              color: 'var(--cw-ink-subtle)',
            }}
          >
            {quantity} units
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-small)',
              fontWeight: 700,
              color: 'var(--cw-ink)',
            }}
          >
            ₹{pricing.unitPrice} / unit
          </p>
        </div>
        <button
          suppressHydrationWarning
          type="button"
          onClick={mode === 'shop' ? handleAddToCart : handleRequestQuote}
          className="cw-cta cw-cta--accent flex-1 py-3"
        >
          {mode === 'shop'
            ? customWearContent.labels.cardShopCta
            : customWearContent.labels.cardQuoteCta}
        </button>
      </div>
      {/* Spacer so the sticky bar never covers page content. */}
      <div aria-hidden="true" className="h-20 lg:hidden" />

      <SizeGuideModal
        isOpen={isSizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        productName={product.name}
        chart={product.sizeChart}
      />

      <DesignLibraryModal
        isOpen={isDesignLibraryOpen}
        onClose={() => setDesignLibraryOpen(false)}
        selectedTemplateId={customization.templateId}
        onSelect={handleSelectTemplate}
      />

      <QuoteRequestModal
        isOpen={isQuoteOpen}
        onClose={() => setQuoteOpen(false)}
        product={product}
        colorId={colorId}
        sizes={selectedSizes}
        quantity={quantity}
        customization={customization}
      />
    </div>
  );
};
