/**
 * Shapes the storefront reads from the TAILORAE API.
 *
 * Money is integer paise everywhere (`pricePaise`, `totalPaise`…) and is turned
 * into rupees only for display (`formatPaise` in `lib/money.ts`). Where the API
 * documents a schema, the generated types in `lib/api/types.ts` are the
 * contract; the catalogue endpoints return the product row as a map, so its
 * shape is written out here.
 */

// User & Authentication Types

/**
 * The signed-in account, as the session keeps it in redux (`state.auth.user`).
 *
 * Built from the API's account summary `{id, realm, email, name, emailVerified}`;
 * for a customer the profile (`GET /users/profile`) adds names and phone. Seller
 * and staff accounts carry one full name, split into first/last for display.
 */
export interface User {
  id: string;
  realm: 'customer' | 'seller' | 'admin';
  email: string;
  /** Full display name. */
  name: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Customer type: INDIVIDUAL or BUSINESS. */
  type?: string;
  marketingOptIn?: boolean;
  createdAt?: string;
}

/**
 * A label products are sold under.
 *
 * Separate from the seller: one seller lists many brands, and one brand is
 * sold by many sellers.
 */
export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logo?: string | null;
  banner?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** Live products carrying this brand, when the API was asked to count. */
  _count?: { products: number };
}

/**
 * A shop selling on the marketplace — only its public face. Business, bank
 * and KYC details never leave the seller and staff consoles.
 */
export interface Seller {
  id: string;
  shopName: string;
  shopSlug: string;
  shopDescription?: string | null;
  shopImage?: string | null;
  shopBanner?: string | null;
  isVerified?: boolean;
  /** TAILORAE's own stock. */
  isPlatform?: boolean;
  rating?: number;
  ratingCount?: number;
  createdAt?: string;
  _count?: { products: number };
}

// Product Types
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  image?: string | null;
  /** Slugs from the department down to this category. */
  path?: string[];
  children?: Category[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  shortDescription?: string | null;
  status: ProductStatus;
  pricePaise: number;
  /** The MRP; above `pricePaise` when the product is on sale. */
  mrpPaise?: number | null;
  discountPercentage: number;
  sku: string;
  quantity: number;
  minOrderQuantity: number;
  maxOrderQuantity?: number | null;
  isFeatured: boolean;
  isCustomizable: boolean;
  allowBulkOrders: boolean;
  thumbnail?: string | null;
  images: string[];
  videoUrl?: string | null;
  color?: string | null;
  colorFamily?: string | null;
  /** Product-specific measurements, shown in place of the standard chart. */
  sizeGuide?: string | null;
  rating: number;
  ratingCount: number;
  reviewCount: number;
  metaTitle?: string | null;
  metaDescription?: string | null;
  categoryId?: string | null;
  category?: Category | null;
  /** The label the product is sold under. Null when it carries none. */
  brandId?: string | null;
  brand?: Brand | null;
  /** The shop that listed this product (TAILORAE's own stock is a shop too). */
  sellerId?: string | null;
  seller?: Seller | null;
  variants?: ProductVariant[];
  customizations?: ProductCustomization[];
  bulkPricings?: BulkPricing[];
  /**
   * Colours the product is made in, grouped from its variants by the API.
   * The shop grid renders one card per entry, so a four-colour polo occupies
   * four tiles. Empty means the product has no colour information and gets a
   * single tile of its own.
   */
  colors?: ProductColor[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A product as `GET /products/:idOrSlug` returns it.
 *
 * The listing sends colour cards — a name and one photograph, enough for a
 * tile. The detail endpoint sends the same colours carrying their sizes, stock
 * and full gallery, which is what the two-dimensional variant picker needs.
 * Separate types because a listing row genuinely does not have those fields,
 * and pretending otherwise pushes the failure to runtime.
 */
export interface ProductDetail extends Omit<Product, 'colors'> {
  colors?: ProductColorDetail[];
  /** Department down to the product's own category, for the breadcrumb. */
  categoryTrail?: Array<{ id: string; name: string; slug: string; path: string[] }>;
  /**
   * How to present the product, from its listing template: what the variant
   * option is called ("UK size", "Variant"), whether it is clothing (size
   * guide), and readable names for its attributes. Null for products without one.
   */
  listing?: {
    articleType: string;
    slug: string;
    family: 'apparel' | 'general';
    optionLabel: string;
    attributeLabels: Record<string, string>;
    /** Units of number fields, e.g. { screenSize: 'inch' }. */
    attributeUnits?: Record<string, string>;
  } | null;
  // ── Marketplace listing data (Myntra template), all optional ──────────
  articleType?: string | null;
  /** Myntra age group, e.g. "Kids-Girls". */
  ageGroup?: string | null;
  /**
   * The other colourways of this design: separate listings in one colour
   * group (Myntra's Color Variant GroupId), each with its own photos and
   * article number. Includes this product, flagged `current`.
   */
  colourSiblings?: Array<{
    id: string;
    slug: string;
    name: string;
    colour: string | null;
    thumbnail: string | null;
    current: boolean;
  }>;
  material?: string | null;
  materialCare?: string | null;
  sizeAndFit?: string | null;
  countriesOfOrigin?: string[];
  netQuantity?: number | null;
  netQuantityUnit?: string | null;
  packageContains?: string | null;
  manufacturerDetails?: string | null;
  packerDetails?: string | null;
  importerDetails?: string | null;
  /** "Garment Measurements in" or "To-Fit Denotes Body Measurements in". */
  measurementBasis?: string | null;
  /** Catalogue attribute key → value, e.g. { fabric: 'Cotton', neck: 'Round Neck' }. */
  attributes?: Record<string, string | string[]> | null;
}

/** A colour card as returned on a listing row. */
export interface ProductColor {
  id: string;
  name: string;
  hex: string | null;
  image: string | null;
  /** Units across this colour's sizes. */
  stock?: number;
  /** The fixed colour family it files under ("Navy Blue"); what filters match. */
  family?: string | null;
}

/** A colour on the product detail page: its gallery and the sizes beneath it. */
export interface ProductColorDetail extends ProductColor {
  images: string[];
  sizes: Array<{ id: string; size: string | null; sku: string; stock: number }>;
  stock: number;
}

export interface BulkPricing {
  id: string;
  productId: string;
  minQty: number;
  /** `null` means "and above". */
  maxQty?: number | null;
  /** Discount off the base price in basis points (1000 = 10%). */
  discountBp: number;
  /** Final per-unit price, already discounted. */
  pricePaise: number;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  size?: string | null;
  color?: string | null;
  material?: string | null;
  /** Null when the variant sells at the product's price. */
  pricePaise?: number | null;
  quantity: number;
  images: string[];
  isDefault: boolean;
  standardSize?: string | null;
  /** Catalogue measurement key → inches, e.g. { bustIn: 34, frontLengthIn: 40 }. */
  measurements?: Record<string, number> | null;
  /** Extra option values beside the size, e.g. { Storage: '128 GB' }. */
  options?: Record<string, string> | null;
}

export interface ProductCustomization {
  id: string;
  name: string;
  /** Upper case: TEXT, SELECT, FILE, COLOR, IMAGE, EMBROIDERY… */
  type: string;
  isRequired: boolean;
  /** Select options — may arrive as an array or a JSON-encoded string. */
  options?: string[] | string | null;
  additionalPaise: number;
  maxCharacters?: number | null;
}

// Cart & Order Types

/** The slice of the product a bag line carries, repriced on every read. */
export interface CartLineProduct {
  id: string;
  name: string;
  slug: string;
  thumbnail?: string | null;
  pricePaise: number;
  mrpPaise?: number | null;
  /** Units in stock for this line's product or size. */
  quantity: number;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  /** Price of one unit today, add-ons and bulk tier included. */
  unitPaise: number;
  lineTotalPaise: number;
  /** False when the product was withdrawn or the size has fewer units than the line. */
  available: boolean;
  /**
   * What the shopper asked for, keyed by option. Values are heterogeneous by
   * design: the product page stores typed answers, while custom wear stores
   * placements, uploaded filenames and fees. `unknown` rather than `any` so a
   * reader has to decide how to render each one.
   */
  customization?: Record<string, unknown> | null;
  mockupImage?: string | null;
  product: CartLineProduct;
  variant?: { id: string; size?: string | null; color?: string | null; sku?: string | null } | null;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotalPaise: number;
  itemCount: number;
  /** Plain-English reasons a line cannot be bought as it stands. */
  problems: string[];
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'READY_FOR_SHIPMENT'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
export type PaymentMethod = 'COD' | 'RAZORPAY';

/** An address as an order snapshotted it. */
export interface OrderAddress {
  fullName: string;
  phone: string;
  email?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string | null;
  gstin?: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  contactEmail?: string | null;
  subtotalPaise: number;
  discountPaise: number;
  couponCode?: string | null;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  refundedPaise?: number;
  notes?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  deliveredAt?: string | null;
  /** An unpaid online order is cancelled after this moment. */
  paymentDueBy?: string | null;
  items: OrderItem[];
  /** One part per shop, each shipped and tracked on its own. */
  sellerOrders?: SellerOrderPart[];
  shippingAddress?: OrderAddress | null;
  billingAddress?: OrderAddress | null;
  timeline?: OrderTimelineEntry[];
  returnRequest?: ReturnRequest | null;
  createdAt: string;
}

/** A row of the order list: enough for a summary line, not the whole order. */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  totalPaise: number;
  itemCount: number;
  firstItemName?: string | null;
  firstItemThumbnail?: string | null;
  createdAt: string;
}

export interface SellerOrderPart {
  id: string;
  orderNumber: string;
  sellerId: string;
  shopName?: string | null;
  status: OrderStatus;
  totalPaise: number;
  trackingNumber?: string | null;
  carrier?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

/** One return raised against a delivered order. At most one per order. */
export interface ReturnRequest {
  id: string;
  reason: string;
  requestType: string;
  description?: string | null;
  images?: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  refundPaise?: number | null;
  refundedAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

/** One recorded status change on an order, oldest first. */
export interface OrderTimelineEntry {
  status: string;
  message?: string | null;
  createdAt: string;
}

/** A line as the order snapshotted it — name, size and price at the time. */
export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string | null;
  sellerId?: string | null;
  name: string;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  thumbnail?: string | null;
  quantity: number;
  unitPaise: number;
  discountPaise?: number;
  /** See CartItem.customization. */
  customization?: Record<string, unknown> | null;
  mockupImage?: string | null;
}

// Address Types
export type AddressLabel = 'HOME' | 'OFFICE' | 'OTHER';

export interface Address {
  id: string;
  label: AddressLabel | string;
  fullName: string;
  phone: string;
  email?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstin?: string | null;
  isDefault: boolean;
}

/** What the address form sends. */
export type AddressInput = Omit<Address, 'id' | 'country'> & { country?: string };

// Wishlist & Reviews
export interface WishlistItem {
  productId: string;
  name: string;
  slug: string;
  thumbnail?: string | null;
  pricePaise: number;
  mrpPaise?: number | null;
  inStock: boolean;
  /** False once the product is withdrawn from sale. */
  available: boolean;
  addedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  images: string[];
  /** The reviewer bought the product. */
  isVerified: boolean;
  helpfulCount: number;
  /** "Asha R" — first name and initial. */
  authorName?: string | null;
  createdAt: string;
}

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: Record<string, number>;
}

// API Response Types
/**
 * `unknown` rather than `any` as the default: a caller that does not name the
 * payload type has to narrow it before use, instead of silently getting a
 * value the compiler will let them do anything with.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}
