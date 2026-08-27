/**
 * Custom Wear copy + layout settings.
 *
 * Every user-visible string that is not product data lives here. Marketing
 * changes should never require a component edit. Shaped as a plain object so
 * it can be swapped for a CMS/admin payload via `resolveCustomWearContent`.
 */

export interface HeroContent {
  heading: string;
  description: string;
  eyebrow?: string;
  backgroundImage?: string;
  /**
   * Natural pixel size of `backgroundImage`. From tablet up the banner sizes
   * itself to this ratio so the artwork is never cropped — update both values
   * whenever the image is replaced.
   */
  backgroundWidth: number;
  backgroundHeight: number;
  /**
   * Focal point used only where the viewport is narrower than the artwork
   * ratio and a crop is unavoidable (phones). CSS `object-position` syntax.
   */
  backgroundPositionMobile: string;
  backgroundPositionDesktop: string;
  /** Upper bound so the banner cannot dominate an ultra-wide monitor. */
  maxHeightDesktop: string;
  backgroundColor: string;
  overlayColor: string;
  headingColor: string;
  textColor: string;
  align: 'left' | 'center';
  minHeightDesktop: string;
  minHeightMobile: string;
  headingFontSize: string;
  descriptionFontSize: string;
  descriptionMaxWidth: string;
}

export interface CustomWearContent {
  hero: HeroContent;

  labels: {
    shopNow: string;
    getQuote: string;
    modeGroupLabel: string;
    shopCta: string;
    quoteCta: string;
    cardShopCta: string;
    cardQuoteCta: string;
    buyNow: string;
    browseDesigns: string;
    uploadDesign: string;
    sizeGuide: string;
    filters: string;
    clearAll: string;
    searchPlaceholder: string;
    sortLabel: string;
    categoriesHeading: string;
    relatedHeading: string;
    alsoViewedHeading: string;
    recentlyViewedHeading: string;
    emptyResultsTitle: string;
    emptyResultsBody: string;
    quoteSuccessTitle: string;
  };

  collection: {
    /** Fallback H1 when no category is selected. */
    defaultHeading: string;
    /** Grid columns per breakpoint. */
    columns: { base: number; sm: number; lg: number; xl: number; '2xl': number };
  };

  productPage: {
    /** Order of the detail accordions; ids must match `ProductAccordionSection.id`. */
    accordionOrder: string[];
    /** Accordion open by default on first render. */
    defaultOpenAccordionId: string;
    stickySummary: boolean;
    stickyTopOffset: string;
    galleryThumbnailCount: number;
    /**
     * What the gallery shows for a colour that has no photograph of its own.
     * `photo` is always preferred when one exists; this only decides the
     * fallback. `silhouette` draws the garment outline in the exact colour;
     * `tint` re-colours the existing photo; `none` leaves the gallery alone.
     */
    colorFallback: 'silhouette' | 'tint' | 'none';
    /** Opacity of the `tint` overlay, 0–1. */
    colorTintStrength: number;
  };

  quote: {
    introText: string;
    countries: string[];
    defaultCountry: string;
    submitLabel: string;
    /** Shown under the CTA in quote mode when a price exists. */
    startingFromPrefix: string;
    volumeContactThreshold: number;
    volumeContactText: string;
  };

  upload: {
    acceptedExtensions: string[];
    /** Extensions the backend cannot process yet are listed but flagged. */
    backendPendingExtensions: string[];
    maxFileSizeMb: number;
    maxFiles: number;
    helpText: string;
  };
}

export const customWearContent: CustomWearContent = {
  hero: {
    eyebrow: 'Creative Impression',
    heading: 'Custom Wear',
    description:
      'Create apparel your way. Shop customizable styles or request a quote for bulk and business orders.',
    backgroundImage: '/images/Banner%20Customize.webp',
    backgroundWidth: 1983,
    backgroundHeight: 793,
    backgroundPositionMobile: '68% center',
    backgroundPositionDesktop: 'center center',
    // Above ~2050px wide the banner would exceed this and crop slightly; that
    // only affects ultra-wide monitors, where a full-height strip is too tall.
    maxHeightDesktop: '820px',
    backgroundColor: '#111111',
    overlayColor:
      'linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.15) 100%)',
    headingColor: '#FFFFFF',
    textColor: 'rgba(255,255,255,0.86)',
    align: 'left',
    minHeightDesktop: '420px',
    minHeightMobile: '340px',
    headingFontSize: 'var(--cw-fs-hero)',
    descriptionFontSize: 'clamp(14px, 1.3vw, 19px)',
    descriptionMaxWidth: '540px',
  },

  labels: {
    shopNow: 'Shop Now',
    getQuote: 'Get Quote',
    modeGroupLabel: 'Choose how you want to order',
    shopCta: 'Customize & Add to Cart',
    quoteCta: 'Request Quote',
    cardShopCta: 'Customize Now',
    cardQuoteCta: 'Get Quote',
    buyNow: 'Buy Now',
    browseDesigns: 'Browse Designs',
    uploadDesign: 'Upload Design',
    sizeGuide: 'Size Guide',
    filters: 'Filters',
    clearAll: 'Clear All',
    searchPlaceholder: 'Search Custom Wear',
    sortLabel: 'Sort By',
    categoriesHeading: 'Custom Wear Categories',
    relatedHeading: 'You May Also Like',
    alsoViewedHeading: 'Customers Also Viewed',
    recentlyViewedHeading: 'Recently Viewed',
    emptyResultsTitle: 'No products match your selected filters.',
    emptyResultsBody: 'Try removing a filter, or start from one of the categories below.',
    quoteSuccessTitle: 'Quote request submitted successfully.',
  },

  collection: {
    defaultHeading: 'Custom Wear',
    columns: { base: 2, sm: 2, lg: 3, xl: 4, '2xl': 4 },
  },

  productPage: {
    accordionOrder: [
      'product-details',
      'fabric-construction',
      'size-dimensions',
      'printing-embroidery',
      'shipping-delivery',
      'care-instructions',
      'returns-policy',
    ],
    defaultOpenAccordionId: 'product-details',
    /**
     * On: the ordering rail is short enough to sit still while the stage
     * scrolls. It was switched off when the rail also carried the design tool
     * and ran taller than the viewport, which pinned it at the top offset and
     * put its own CTA out of reach. The design tool now lives in the stage.
     */
    stickySummary: true,
    stickyTopOffset: '96px',
    galleryThumbnailCount: 8,
    /**
     * `silhouette` by default because it is the only option that is always
     * truthful. `tint` multiplies the colour over the product photo, which
     * reads well on mid and dark shades but cannot lighten a garment — white
     * and yellow come out muddy, and it stains white collar trim and prints
     * along with the fabric. Switch to `tint` to compare, or to `none` once
     * real per-colour photography exists for every shade.
     */
    colorFallback: 'silhouette',
    colorTintStrength: 0.72,
  },

  quote: {
    introText:
      'Tell us what you need and our team replies with pricing, lead times and a digital proof — usually within one business day.',
    countries: [
      'India',
      'United Arab Emirates',
      'United Kingdom',
      'United States',
      'Australia',
      'Canada',
      'Singapore',
      'Germany',
      'Saudi Arabia',
      'Qatar',
    ],
    defaultCountry: 'India',
    submitLabel: 'Submit Quote Request',
    startingFromPrefix: 'Starting from',
    volumeContactThreshold: 1000,
    volumeContactText: 'Contact us for volume pricing',
  },

  upload: {
    acceptedExtensions: ['png', 'jpg', 'jpeg', 'svg', 'pdf', 'ai', 'eps'],
    backendPendingExtensions: ['ai', 'eps'],
    maxFileSizeMb: 25,
    maxFiles: 5,
    helpText:
      'Vector artwork (SVG, PDF, AI, EPS) reproduces best. For raster files use 300 DPI at print size.',
  },
};

/** Merge point for CMS/admin overrides — see `resolveCustomWearTheme`. */
export function resolveCustomWearContent(
  overrides?: Partial<CustomWearContent>
): CustomWearContent {
  if (!overrides) return customWearContent;
  return {
    ...customWearContent,
    ...overrides,
    hero: { ...customWearContent.hero, ...overrides.hero },
    labels: { ...customWearContent.labels, ...overrides.labels },
    collection: { ...customWearContent.collection, ...overrides.collection },
    productPage: { ...customWearContent.productPage, ...overrides.productPage },
    quote: { ...customWearContent.quote, ...overrides.quote },
    upload: { ...customWearContent.upload, ...overrides.upload },
  };
}
