/**
 * Named aliases for the API's schemas, generated from its OpenAPI document
 * (`npm run api:types` rewrites `schema.d.ts`). Import from here rather than
 * reaching into `components['schemas']` at every call site.
 *
 * The document marks a field required only when its Kotlin property is
 * non-null, so a nullable field comes out optional (`field?: T`) although the
 * API always sends it, as `null` when empty. The `Present` helper restores
 * that where a caller would otherwise check for `undefined` as well as `null`.
 */
import type { components } from './schema';

type Schemas = components['schemas'];

/** The same object with every field required — for responses the API always fills. */
export type Present<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

/**
 * A request body whose listed fields have server-side defaults. The OpenAPI
 * document marks every non-null Kotlin property `required`, including ones
 * with a default value, so the client may leave these out.
 */
export type WithDefaults<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type AccountSummary = Present<Schemas['AccountSummary']>;
export type CustomerProfile = Schemas['CustomerProfileView'];
export type CustomerProfileUpdate = Schemas['CustomerProfileUpdate'];
export type CustomerRegisterRequest = WithDefaults<Schemas['CustomerRegisterRequest'], 'lastName' | 'marketingOptIn'>;
export type SellerRegisterRequest = Schemas['SellerRegisterRequest'];
export type LoginRequest = Schemas['LoginRequest'];
export type ChangePasswordRequest = Schemas['ChangePasswordRequest'];
export type SessionView = Schemas['SessionView'];

export type CartView = Schemas['CartView'];
export type CartItemView = Schemas['CartItemView'];
export type AddToCartRequest = WithDefaults<Schemas['AddToCartRequest'], 'isBulkOrder'>;
export type CouponPreview = Schemas['CouponPreview'];

export type AddressRequest = WithDefaults<Schemas['AddressRequest'], 'country' | 'isDefault' | 'label'>;
export type AddressView = Schemas['AddressView'];
export type WishlistEntry = Schemas['WishlistEntry'];

export type ReviewView = Schemas['ReviewView'];
export type ReviewRequest = WithDefaults<Schemas['ReviewRequest'], 'images'>;

export type CheckoutRequest = WithDefaults<Schemas['CheckoutRequest'], 'saveAddress'>;
export type CheckoutSession = Schemas['CheckoutSession'];
export type VerifyResult = Schemas['VerifyResult'];
export type OrderView = Schemas['OrderView'];
export type OrderItemView = Schemas['OrderItemView'];
export type OrderSummaryView = Schemas['OrderSummaryView'];
export type SellerPartView = Schemas['SellerPartView'];
export type TimelineView = Schemas['TimelineView'];
export type ReturnView = Schemas['ReturnView'];
export type ReturnRequestBody = WithDefaults<Schemas['ReturnRequestBody'], 'images'>;

export type DeliveryEstimate = Schemas['DeliveryEstimate'];
export type PincodeInfo = Schemas['PincodeInfo'];

export type PublicShopView = Schemas['PublicShopView'];
export type ColourFamily = Schemas['ColourFamily'];
export type BannerView = Schemas['BannerView'];
export type PublicContentView = Schemas['PublicContentView'];

export type RfqView = Schemas['RfqView'];
export type BulkOrderView = Schemas['BulkOrderView'];
export type CreditView = Schemas['CreditView'];
export type CreditTransactionView = Schemas['CreditTransactionView'];

export type CustomWearProductView = Schemas['CustomWearProduct'];
export type ProductQueryResult = Schemas['ProductQueryResult'];
export type ArtworkView = Schemas['ArtworkView'];

/** The API's list envelope: `Page { items, total, page, limit, pages }`. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/** Every response is `{ success, message, data }`. */
export interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}
