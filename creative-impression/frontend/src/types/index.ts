// User & Authentication Types
export type UserRole = 'ADMIN' | 'VENDOR' | 'B2B_BUYER' | 'RETAIL_CUSTOMER';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface User {
  id: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  preferredLanguage: string;
  isDarkMode: boolean;
  subscribeToNewsletter: boolean;
  createdAt: string;
  updatedAt: string;
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
 * A shop selling on the marketplace.
 *
 * Only the public half of `VendorProfile` — bank details, tax id, commission
 * rate and earnings live on the same record and never leave the server.
 */
export interface Seller {
  id: string;
  shopName: string;
  shopSlug: string;
  shopDescription?: string | null;
  shopImage?: string | null;
  shopBanner?: string | null;
  isVerified?: boolean;
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
  description?: string;
  icon?: string;
  image?: string;
  children?: Category[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  status: ProductStatus;
  price: number;
  originalPrice?: number;
  discountPercentage: number;
  sku: string;
  quantity: number;
  minOrderQuantity: number;
  isFeatured: boolean;
  isCustomizable: boolean;
  allowBulkOrders: boolean;
  thumbnail?: string;
  images: string[];
  videoUrl?: string;
  /** Product-specific measurements, shown in place of the standard chart. */
  sizeGuide?: string | null;
  rating: number;
  ratingCount: number;
  reviewCount: number;
  metaTitle?: string;
  metaDescription?: string;
  category?: Category;
  /** The label the product is sold under. Null when it carries none. */
  brandId?: string | null;
  brand?: Brand | null;
  /** The shop that listed this product. Null for house stock. */
  vendorId?: string | null;
  vendor?: Seller | null;
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
   * guide), and readable names for its attributes. Null for legacy products.
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
  /** Percentage off the base price. */
  discount: number;
  /** Final per-unit price, already discounted. */
  price: number;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  size?: string;
  color?: string;
  material?: string;
  price?: number;
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
  /** Backend values include e.g. 'select', 'text', 'file', 'color', 'image', 'embroidery'. */
  type: string;
  isRequired: boolean;
  /** Select options — may arrive as an array or a JSON-encoded string. */
  options?: string[] | string | null;
  additionalCost: number;
  maxCharacters?: number | null;
}

// Cart & Order Types
export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  variantId?: string;
  variant?: ProductVariant;
  quantity: number;
  price: number;
  /**
   * What the shopper asked for, keyed by option. Values are heterogeneous by
   * design: the product page stores typed answers, while custom wear stores
   * placements, uploaded filenames and fees. `unknown` rather than `any` so a
   * reader has to decide how to render each one.
   */
  customization?: Record<string, unknown>;
  mockupImage?: string;
  isBulkOrder: boolean;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'READY_FOR_SHIPMENT' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
export type PaymentMethod = 'CREDIT_CARD' | 'DEBIT_CARD' | 'NETBANKING' | 'UPI' | 'WALLET' | 'RAZORPAY' | 'STRIPE' | 'PAYPAL' | 'COD';

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  isBulkOrder: boolean;
  isB2B: boolean;
  subtotal: number;
  discount: number;
  tax: number;
  shippingCost: number;
  total: number;
  discountCode?: string | null;
  gstNumber?: string | null;
  notes?: string | null;
  trackingNumber?: string;
  carrier?: string | null;
  estimatedDelivery?: string;
  actualDelivery?: string;
  items: OrderItem[];
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  timeline?: OrderTimelineEntry[];
  returnRequest?: ReturnRequest | null;
  createdAt: string;
  updatedAt: string;
}

/** One return raised against a delivered order. At most one per order. */
export interface ReturnRequest {
  id: string;
  orderId: string;
  reason: string;
  requestType: string;
  description?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  refundAmount?: number | null;
  createdAt: string;
}

/** One recorded status change on an order, oldest first. */
export interface OrderTimelineEntry {
  id: string;
  orderId: string;
  status: string;
  message?: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  product: Product;
  variantId?: string | null;
  /** Snapshotted at order time — the variant SKU where there was one. */
  sku?: string | null;
  quantity: number;
  price: number;
  /**
   * What the shopper asked for, keyed by option. Values are heterogeneous by
   * design: the product page stores typed answers, while custom wear stores
   * placements, uploaded filenames and fees. `unknown` rather than `any` so a
   * reader has to decide how to render each one.
   */
  customization?: Record<string, unknown>;
  mockupImage?: string;
}

// Address Types
export interface Address {
  id: string;
  userId: string;
  type: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

// B2B Types
export interface B2BProfile {
  id: string;
  userId: string;
  companyName: string;
  gstNumber?: string;
  minOrderQuantity: number;
  discountTier: string;
  isVerified: boolean;
  creditLimit: number;
  creditUsed: number;
}

export interface RFQ {
  id: string;
  rfqNumber: string;
  b2bProfileId: string;
  productId: string;
  quantity: number;
  status: string;
  quotedPrice?: number;
  expiryDate?: string;
  createdAt: string;
}

export interface BulkOrder {
  id: string;
  orderNumber: string;
  b2bProfileId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  expectedDelivery?: string;
}

// Wishlist & Reviews
export interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  product: Product;
  createdAt: string;
}

export interface Review {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  title?: string;
  comment?: string;
  images: string[];
  isVerified: boolean;
  helpful: number;
  createdAt: string;
}

// Coupon Types
export interface Coupon {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  minOrderAmount: number;
  maxDiscount?: number;
  usageLimit?: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'ORDER' | 'PROMOTION' | 'ACCOUNT' | 'SYSTEM';
  isRead: boolean;
  readAt?: string;
  link?: string;
  createdAt: string;
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
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// Filter Types
export interface ProductFilters {
  search?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  isCustomizable?: boolean;
  sortBy?: 'newest' | 'price-asc' | 'price-desc' | 'rating' | 'trending';
  page?: number;
  limit?: number;
}

// Auth Types
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken?: string;
}
