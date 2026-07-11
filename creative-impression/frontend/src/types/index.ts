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
  rating: number;
  ratingCount: number;
  reviewCount: number;
  metaTitle?: string;
  metaDescription?: string;
  variants?: ProductVariant[];
  createdAt: string;
  updatedAt: string;
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
}

export interface ProductCustomization {
  id: string;
  name: string;
  type: 'text' | 'color' | 'image' | 'embroidery';
  isRequired: boolean;
  options?: string[];
  additionalCost: number;
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
  customization?: Record<string, any>;
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
  trackingNumber?: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  product: Product;
  quantity: number;
  price: number;
  customization?: Record<string, any>;
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
export interface ApiResponse<T = any> {
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
