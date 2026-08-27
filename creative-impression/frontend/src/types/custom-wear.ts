/**
 * Custom Wear domain model.
 *
 * These types describe the shape the Custom Wear module expects from any data
 * source. Today they are satisfied by the local dataset in
 * `src/data/custom-wear/products.ts`; when the backend product API is
 * implemented it only has to return this same shape (see
 * `src/lib/custom-wear/api.ts`).
 */

// ============================================
// TAXONOMY PRIMITIVES
// ============================================

export type Gender = 'men' | 'women' | 'kids' | 'unisex';

export type ProductTypeId = 'polo' | 'round-neck' | 'hoodie' | 'sweatshirt' | 'sportswear';

export type PurchaseMode = 'shop' | 'quote';

export type CustomizationMethodId =
  | 'screen-printing'
  | 'dtg'
  | 'dtf'
  | 'sublimation'
  | 'heat-transfer'
  | 'embroidery'
  | 'puff-printing'
  | 'vinyl-printing';

export type CustomizationLocationId =
  | 'left-chest'
  | 'right-chest'
  | 'centre-front'
  | 'full-front'
  | 'upper-back'
  | 'full-back'
  | 'left-sleeve'
  | 'right-sleeve';

export type FabricId =
  | 'cotton-100'
  | 'cotton-blend'
  | 'polyester'
  | 'performance-polyester'
  | 'dry-fit'
  | 'organic-cotton'
  | 'recycled-polyester';

export type SizeGroup = 'adult' | 'kids';

export type SortId =
  | 'recommended'
  | 'popular'
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'rating';

export type DeliverySpeedId = 'standard' | 'express';

export type ProductImageRole =
  | 'front'
  | 'back'
  | 'side'
  | 'detail'
  | 'fabric'
  | 'customization'
  | 'lifestyle'
  | 'spec';

export type BadgeId =
  | 'new'
  | 'bestseller'
  | 'premium'
  | 'eco-friendly'
  | 'no-moq'
  | 'new-options';

// ============================================
// PRODUCT BUILDING BLOCKS
// ============================================

export interface ProductColor {
  /** Stable slug, also used as the `color` URL filter value. */
  id: string;
  name: string;
  hex: string;
  /** Second hex for two-tone/heather swatches (renders as a split circle). */
  secondaryHex?: string;
  /** Id of the entry in `CustomWearProduct.images` shown when this colour is picked. */
  imageId?: string;
  /** Variant SKU suffix; combined with the product SKU at selection time. */
  skuSuffix?: string;
  inStock?: boolean;
}

export interface ProductSize {
  /** Stable id, also used as the `size` URL filter value (e.g. `XL`, `5-6Y`). */
  id: string;
  label: string;
  group: SizeGroup;
  inStock?: boolean;
}

export interface PriceTier {
  minQty: number;
  /** `null` means "and above". */
  maxQty: number | null;
  pricePerUnit: number;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  role: ProductImageRole;
  /** Set when this image is the variant shot for a specific colour. */
  colorId?: string;
}

export interface CustomizationMethodOption {
  id: CustomizationMethodId;
  /** Unsupported methods stay visible but disabled, so buyers see the full range. */
  supported: boolean;
  /** One-off charge, in the product currency. */
  setupFee?: number;
  /** Added to the unit price when this method is selected. */
  pricePerUnit?: number;
  note?: string;
}

export interface CustomizationLocationOption {
  id: CustomizationLocationId;
  supported: boolean;
  maxWidthMm?: number;
  maxHeightMm?: number;
  pricePerUnit?: number;
}

export interface ProductSpecRow {
  label: string;
  value: string;
}

export interface ProductTemplateAsset {
  id: string;
  label: string;
  /** Extension shown on the download chip, e.g. `PDF`, `AI`. */
  fileType: string;
  url: string;
  description?: string;
}

export interface SizeChartRow {
  size: string;
  values: string[];
}

export interface SizeChart {
  unit: 'cm' | 'in';
  columns: string[];
  rows: SizeChartRow[];
  note?: string;
}

export interface ProductAccordionSection {
  id: string;
  title: string;
  /** Plain paragraphs. Rendered as text — never as raw HTML. */
  paragraphs?: string[];
  bullets?: string[];
  specs?: ProductSpecRow[];
  templates?: ProductTemplateAsset[];
}

export interface ProductDescriptionBlock {
  heading: string;
  intro?: string;
  benefits?: string[];
  useCases?: string[];
}

// ============================================
// PRODUCT
// ============================================

export interface CustomWearProduct {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string;
  description: string;

  gender: Gender;

  /** Category slug from `CUSTOM_WEAR_CATEGORIES`, e.g. `mens-polo`. */
  category: string;
  productType: ProductTypeId;

  fabric?: FabricId;
  gsm?: number;
  fit?: string;

  basePrice: number;
  currency: string;
  /** Highest tier price, used for the "₹450 – ₹570 each" range on cards. */
  maxPrice?: number;
  priceTiers?: PriceTier[];

  colors: ProductColor[];
  sizes: ProductSize[];

  customizationMethods: CustomizationMethodOption[];
  customizationLocations: CustomizationLocationOption[];

  images: ProductImage[];

  rating?: number;
  reviewCount?: number;

  badges?: BadgeId[];

  minOrderQuantity?: number;
  /** Default quantity pre-filled on the product page. */
  defaultQuantity?: number;

  highlights?: string[];
  accordions?: ProductAccordionSection[];
  descriptionBlock?: ProductDescriptionBlock;
  sizeChart?: SizeChart;

  relatedProductIds?: string[];

  /** Sort inputs. `popularity` drives "Popular"; `createdAt` drives "Newest". */
  popularity?: number;
  createdAt?: string;
}

// ============================================
// FILTERING / QUERYING
// ============================================

export interface CustomWearFilterState {
  mode: PurchaseMode;
  category: string | null;
  gender: Gender[];
  productType: ProductTypeId[];
  color: string[];
  size: string[];
  fabric: FabricId[];
  gsm: string[];
  method: CustomizationMethodId[];
  location: CustomizationLocationId[];
  moq: string[];
  minPrice: number | null;
  maxPrice: number | null;
  search: string;
  sort: SortId;
  page: number;
}

/** Keys of `CustomWearFilterState` that hold a string array of option ids. */
export type MultiFilterKey =
  | 'gender'
  | 'productType'
  | 'color'
  | 'size'
  | 'fabric'
  | 'gsm'
  | 'method'
  | 'location'
  | 'moq';

export interface FilterOption {
  id: string;
  label: string;
  /** Optional swatch colour, used by the colour filter. */
  hex?: string;
  secondaryHex?: string;
  group?: SizeGroup;
}

export interface FilterGroupConfig {
  key: MultiFilterKey;
  title: string;
  /** `swatch` = colour circles, `chip` = pill buttons, `checkbox` = list. */
  control: 'swatch' | 'chip' | 'checkbox';
  options: FilterOption[];
  defaultOpen?: boolean;
  /** Collapse the option list behind a "Show all" toggle beyond this count. */
  collapseAfter?: number;
}

export interface ActiveFilterChip {
  key: MultiFilterKey | 'category' | 'price' | 'search';
  value: string;
  label: string;
}

export interface ProductQueryResult {
  products: CustomWearProduct[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Lowest/highest base price across the unfiltered catalogue. */
  priceBounds: { min: number; max: number };
}

// ============================================
// PRICING
// ============================================

export interface QuantityPricing {
  quantity: number;
  unitPrice: number;
  baseUnitPrice: number;
  /** Per-unit customization surcharge folded into `unitPrice`. */
  customizationPerUnit: number;
  setupFee: number;
  subtotal: number;
  total: number;
  /** Saving versus buying the same quantity at tier-1 pricing. */
  savings: number;
  tier?: PriceTier;
  nextTier?: PriceTier;
}

// ============================================
// CUSTOMIZATION / DESIGNS
// ============================================

export type DesignUploadStatus = 'pending' | 'uploading' | 'ready' | 'error';

export interface DesignUpload {
  id: string;
  name: string;
  /** Bytes. */
  size: number;
  mimeType: string;
  extension: string;
  status: DesignUploadStatus;
  /** Object URL for raster previews; undefined for vector/print formats. */
  previewUrl?: string;
  error?: string;
}

export interface DesignTemplate {
  id: string;
  name: string;
  categoryId: string;
  tags: string[];
  /** Inline SVG markup rendered inside a sanitised, fixed-size frame. */
  artwork: DesignTemplateArtwork;
}

export interface DesignTemplateArtwork {
  kind: 'monogram' | 'badge' | 'wordmark' | 'icon';
  primary: string;
  secondary?: string;
  color: string;
  background: string;
}

export interface DesignTemplateCategory {
  id: string;
  label: string;
}

/**
 * One decorated area: which print location, what artwork goes there, and how it
 * is applied. A garment carries a list of these — a logo on the left chest and a
 * different graphic across the back is the commonest team and corporate order,
 * and one design shared by every location could not express it.
 */
export interface CustomizationPlacement {
  /** Stable across edits, so React keys and the preview do not thrash. */
  id: string;
  location: CustomizationLocationId;
  method: CustomizationMethodId | null;
  /** Stock design, when the artwork came from the library. */
  templateId: string | null;
  /** Uploaded file, when the artwork is the customer's own. */
  uploadId: string | null;
  /** Artwork width as a fraction of the location's printable width. */
  scale: number;
}

/**
 * Selection state shared by the shop flow and the quote flow. The future canvas
 * editor is expected to produce this same object, so nothing downstream has to
 * change when it lands.
 *
 * `uploads` is the file pool for the whole garment; a placement points into it
 * by id, so one uploaded logo can be printed in several locations without being
 * uploaded twice.
 */
export interface CustomizationSelection {
  placements: CustomizationPlacement[];
  uploads: DesignUpload[];
  notes: string;
}

// ============================================
// DELIVERY
// ============================================

export interface DeliveryOption {
  id: DeliverySpeedId;
  label: string;
  /** Business days. */
  minDays: number;
  maxDays: number;
  cost: number;
  freeAbove?: number;
  available: boolean;
  note?: string;
}

export interface DeliveryEstimate {
  postcode: string;
  zoneLabel: string;
  options: DeliveryOption[];
  currency: string;
}

// ============================================
// CART / QUOTE
// ============================================

export interface CustomWearCartItem {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  image?: string;
  colorId: string;
  colorName: string;
  sizeId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  customization: CustomizationSelection;
  deliverySpeed: DeliverySpeedId;
  currency: string;
}

export interface QuotePlacement {
  location: CustomizationLocationId;
  method: CustomizationMethodId | null;
  templateId: string | null;
  designFileName: string | null;
  /** Artwork width as a percentage of the print area. */
  widthPercent: number;
}

export interface QuoteRequestPayload {
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  colorId: string | null;
  colorName: string | null;
  sizes: string[];
  quantity: number;
  /** One entry per decorated area — what goes where, and how. */
  placements: QuotePlacement[];
  designFileNames: string[];
  notes: string;

  customerName: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  postcode: string;
  requiredBy: string;
}

export interface QuoteRequestResult {
  /** Reference issued by the server, e.g. `CWQ-2026-001245`. */
  reference: string;
  /**
   * `true` once a quote backend is wired up. While it is `false` the request
   * was accepted and logged by the Next.js route handler but not stored in the
   * product database — the UI says so rather than implying otherwise.
   */
  persisted: boolean;
  receivedAt: string;
}

// ============================================
// ANALYTICS
// ============================================

export type CustomWearAnalyticsEvent =
  | 'custom_wear_mode_changed'
  | 'custom_wear_category_selected'
  | 'custom_wear_filter_applied'
  | 'custom_wear_product_clicked'
  | 'custom_wear_color_selected'
  | 'custom_wear_size_selected'
  | 'custom_wear_quantity_changed'
  | 'custom_wear_design_uploaded'
  | 'custom_wear_placement_added'
  | 'custom_wear_quote_started'
  | 'custom_wear_quote_submitted'
  | 'custom_wear_add_to_cart'
  | 'custom_wear_wishlist_toggled'
  | 'custom_wear_search';

export type AnalyticsPayload = Record<string, string | number | boolean | null | string[]>;
