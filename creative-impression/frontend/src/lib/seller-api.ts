'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';
import type { OrderStatus, ProductStatus } from '@/types';
import type { ListingFields, VariantListingFields } from '@/lib/catalogue-api';

/**
 * A seller's own shop.
 *
 * Every call is scoped server-side to the signed-in user's `VendorProfile` —
 * no shop id is ever sent, so there is no request this module can make that
 * reads another shop's orders or earnings.
 */

/** Shop name typed on the /sell landing page, carried through sign-in to the application form. */
export const PENDING_SHOP_KEY = 'ci:pendingShopName';

export interface MyShop {
  id: string;
  shopName: string;
  shopSlug: string;
  shopDescription: string | null;
  shopImage: string | null;
  shopBanner: string | null;
  bankAccountName: string | null;
  bankIFSC: string | null;
  bankName: string | null;
  /** The full number is never returned — only enough to recognise it. */
  bankAccountLast4: string | null;
  hasBankDetails: boolean;
  isVerified: boolean;
  isActive: boolean;
  commissionRate: number;
  rating: number;
  ratingCount: number;
  pan: string | null;
  gstin: string | null;
  kycStatus: KycStatus;
  kycDocuments: string[];
  kycSubmittedAt: string | null;
  kycReviewedAt: string | null;
  kycRejectionReason: string | null;
  /** Stock at or below this shows on the dashboard's low-stock list. */
  lowStockThreshold: number;
  // The business behind the shop.
  legalName: string | null;
  businessType: BusinessType | null;
  registeredAddress: RegisteredAddress | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** The owner's decision on the application; only APPROVED may list products. */
  applicationStatus: SellerApplicationStatus;
  /** Why it was rejected or suspended, written for the seller. */
  applicationNote: string | null;
  applicationReviewedAt: string | null;
  createdAt: string;
}

export type SellerApplicationStatus = 'APPLIED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type BusinessType =
  | 'INDIVIDUAL'
  | 'PROPRIETORSHIP'
  | 'PARTNERSHIP'
  | 'LLP'
  | 'PRIVATE_LIMITED'
  | 'PUBLIC_LIMITED'
  | 'OTHER';

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  INDIVIDUAL: 'Individual',
  PROPRIETORSHIP: 'Sole proprietorship',
  PARTNERSHIP: 'Partnership firm',
  LLP: 'LLP',
  PRIVATE_LIMITED: 'Private limited company',
  PUBLIC_LIMITED: 'Public limited company',
  OTHER: 'Other',
};

export interface RegisteredAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface CompanyDetails {
  legalName: string;
  businessType: BusinessType | '';
  registeredAddress: RegisteredAddress;
  contactPhone: string;
  contactEmail: string;
}

export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LowStockItem {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  quantity: number;
  thumbnail: string | null;
}

export interface SellerStats {
  products: number;
  liveProducts: number;
  orders: number;
  openOrders: number;
  grossSales: number;
  commissionCharged: number;
  /** Cleared the return window and payable now. */
  payoutDue: number;
  ordersDue: number;
  /** Earned, but still in fulfilment or inside the customer's return window. */
  payoutHeld: number;
  ordersHeld: number;
  payoutSettled: number;
  /** Listings waiting for the platform to check them. */
  awaitingReview: number;
  /** Listings sent back with a note to fix. */
  rejected: number;
}

/** One line of a sub-order, with the commission snapshotted when it was ordered. */
export interface SellerEarningItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  commissionRate: number;
  commissionAmount: number;
}

/** One unsettled sub-order, with the reason it is not payable yet. */
export interface SellerEarningRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  /** Effective rate across the order's lines. */
  commissionRate: number;
  commissionAmount: number;
  payoutAmount: number;
  deliveredAt: string | null;
  settledAt: string | null;
  createdAt: string;
  /** Null when the money is payable; otherwise why it is being held. */
  hold: string | null;
  items: SellerEarningItem[];
}

/** One movement in the seller's account with the platform. */
export interface SellerLedgerEntry {
  id: string;
  type: 'SALE' | 'PAYOUT' | 'RETURN_REVERSAL' | 'ADJUSTMENT';
  /** Signed rupees: credits positive, payouts and reversals negative. */
  amount: number;
  balanceAfter: number;
  orderNumber: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface SellerWithdrawal {
  id: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  transactionId: string | null;
  rejectionReason: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SellerOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  payoutAmount: number;
  createdAt: string;
}

export interface SellerOrder extends SellerOrderSummary {
  subtotal: number;
  discount: number;
  shippingCost: number;
  commissionRate: number;
  commissionAmount: number;
  settledAt: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  items: Array<{
    id: string;
    quantity: number;
    price: number;
    sku: string;
    product: { id: string; name: string; slug: string; thumbnail: string | null } | null;
  }>;
  order: {
    orderNumber: string;
    createdAt: string;
    shippingAddress: { city: string; state: string; postalCode: string } | null;
  };
}

export interface SellerProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  quantity: number;
  status: string;
  moderationStatus: ModerationStatus;
  moderationNote: string | null;
  thumbnail: string | null;
  category: { name: string } | null;
  brand: { name: string } | null;
}

/**
 * The caller's shop, or `null` when they do not have one.
 *
 * "No shop yet" is the ordinary state for most signed-in users, so a 404 is
 * mapped to null rather than thrown — the dashboard branches on it to show the
 * application form.
 */
export async function getMyShop(): Promise<MyShop | null> {
  try {
    const response = await apiClient.get('/seller/me');
    return response.data?.data?.shop ?? null;
  } catch (error) {
    if (getApiErrorStatus(error) === 404) return null;
    throw new Error(getApiErrorMessage(error, 'Could not load your shop.'));
  }
}

export async function applyToSell(
  input: {
    shopName: string;
    shopDescription?: string;
  } & Partial<CompanyDetails>
): Promise<MyShop> {
  try {
    const response = await apiClient.post('/seller/apply', input);

    /**
     * Becoming a seller changes the account's role, and the role lives in the
     * token. The API hands back a reissued one; storing it is what lets the
     * new seller list a product immediately rather than after their old token
     * expires.
     */
    const token: string | undefined = response.data?.data?.token;
    if (token) localStorage.setItem('token', token);

    return response.data?.data?.shop;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create your seller account.'));
  }
}

export async function updateMyShop(
  input: Partial<Record<string, string | number | null | RegisteredAddress>>
): Promise<MyShop> {
  try {
    const response = await apiClient.put('/seller/me', input);
    return response.data?.data?.shop;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save your shop.'));
  }
}

export async function getSellerSummary(): Promise<{
  shop: MyShop;
  stats: SellerStats;
  lowStock: LowStockItem[];
  lowStockThreshold: number;
  recentOrders: SellerOrderSummary[];
} | null> {
  try {
    const response = await apiClient.get('/seller/summary');
    return response.data?.data ?? null;
  } catch (error) {
    // 404: no shop yet. 403: not a seller yet — a shopper who has just
    // signed up from /sell, who should see the application form, not a red
    // "Forbidden" banner above it.
    const status = getApiErrorStatus(error);
    if (status === 404 || status === 403) return null;
    throw new Error(getApiErrorMessage(error, 'Could not load your dashboard.'));
  }
}

export async function getSellerOrders(): Promise<SellerOrder[]> {
  try {
    const response = await apiClient.get('/seller/orders');
    return response.data?.data?.orders ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your orders.'));
  }
}

export async function getSellerProducts(): Promise<SellerProduct[]> {
  try {
    const response = await apiClient.get('/seller/products');
    return response.data?.data?.products ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your products.'));
  }
}

/** The itemisation behind the dashboard's "due" and "held" figures. */
export async function getSellerEarnings(): Promise<{
  returnWindowDays: number;
  orders: SellerEarningRow[];
  withdrawals: SellerWithdrawal[];
  /** Balance (positive: owed to the seller) and the latest entries, newest first. */
  ledger: { balance: number; entries: SellerLedgerEntry[] };
}> {
  try {
    const response = await apiClient.get('/seller/earnings');
    const data = response.data?.data ?? {};
    return {
      returnWindowDays: data.returnWindowDays ?? 7,
      orders: data.orders ?? [],
      withdrawals: data.withdrawals ?? [],
      ledger: data.ledger ?? { balance: 0, entries: [] },
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your earnings.'));
  }
}

/**
 * Ask to be paid what has cleared the return window.
 *
 * By default no amount is sent and the server requests the whole ledger
 * balance. A smaller `amount` may be asked for; the server refuses anything
 * above the balance, so this cannot request a figure that was not earned.
 */
export async function requestWithdrawal(amount?: number): Promise<string> {
  try {
    const response = await apiClient.post(
      '/seller/withdrawals',
      amount !== undefined ? { amount } : {}
    );
    return response.data?.message ?? 'Payout requested.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not request that payout.'));
  }
}

/** Advance a sub-order, or attach tracking to it. */
export async function updateSellerOrder(
  id: string,
  input: { status?: OrderStatus; trackingNumber?: string; carrier?: string }
): Promise<void> {
  try {
    await apiClient.patch(`/seller/orders/${encodeURIComponent(id)}`, input);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that order.'));
  }
}

/**
 * The one step a seller may take next, mirroring the server's transition map.
 * Shown so the button says what it does rather than offering every status and
 * letting the API refuse most of them.
 */
export const NEXT_STEP: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  PENDING: { status: 'CONFIRMED', label: 'Accept order' },
  CONFIRMED: { status: 'PROCESSING', label: 'Start preparing' },
  PROCESSING: { status: 'READY_FOR_SHIPMENT', label: 'Mark ready to ship' },
  READY_FOR_SHIPMENT: { status: 'SHIPPED', label: 'Mark shipped' },
  SHIPPED: { status: 'DELIVERED', label: 'Mark delivered' },
};

// ============================================
// Catalogue — a seller's own listings
// ============================================
//
// Every route below is a *public* `/products` one, not an `/admin` one. Both
// accept a VENDOR, but the admin router is mounted behind an admin-only guard,
// so each seller CTA that pointed there answered 403 before it could refuse on
// ownership grounds. The public routes take the owning shop from the session
// and treat another shop's listing as not found, which is the rule this module
// wants anyway.

/** A category a listing can be filed under. */
export interface SellerCategory {
  id: string;
  name: string;
  slug: string;
}

/** One size of one colour. `price` null means it costs the same as the product. */
export interface SellerVariant extends VariantListingFields {
  id: string;
  productId: string;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  material: string | null;
  price: number | null;
  quantity: number;
  images: string[];
  isDefault: boolean;
}

/** One of the seller's own listings in full, as the edit form needs it. */
export interface SellerProductDetail extends ListingFields {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  shortDescription: string | null;
  price: number;
  originalPrice: number | null;
  quantity: number;
  status: ProductStatus;
  categoryId: string;
  category: { id: string; name: string; slug: string } | null;
  brand: { id: string; name: string; slug: string } | null;
  color: string | null;
  material: string | null;
  thumbnail: string | null;
  images: string[];
  sizeGuide: string | null;
  brandId?: string | null;
  moderationStatus?: ModerationStatus;
  moderationNote?: string | null;
  variants: SellerVariant[];
}

/**
 * The fields a seller may send.
 *
 * A deliberate subset of what the endpoint accepts: commission, featured
 * placement and which shop a listing belongs to are the platform's to decide,
 * and a field that is never sent is a field a seller cannot set by accident.
 */
export interface SellerProductInput extends ListingFields {
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  price: number;
  originalPrice?: number | null;
  quantity?: number;
  status?: ProductStatus;
  description?: string;
  shortDescription?: string;
  color?: string;
  material?: string;
  sizeGuide?: string;
  thumbnail?: string;
  images?: string[];
  /** Empty string clears the brand. */
  brandId?: string;
}

export interface SellerVariantInput extends VariantListingFields {
  sku: string;
  size?: string | null;
  color?: string | null;
  price?: number | null;
  quantity?: number;
}

/**
 * Categories with something live in them.
 *
 * The admin category list is admin-only; this is the public one, which is all a
 * seller needs — it is the same set of shelves a shopper browses, and a listing
 * filed anywhere else would have nowhere to appear.
 */
export async function getSellerCategories(): Promise<SellerCategory[]> {
  try {
    const response = await apiClient.get('/products/categories/list');
    return response.data?.data?.categories ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load categories.'));
  }
}

/**
 * One of the seller's own listings, draft or live.
 *
 * Read through `/seller` rather than the public product route: that one answers
 * 404 for anything not ACTIVE in an approved shop, which is precisely the state
 * of every listing a seller most needs to edit.
 */
export async function getSellerProduct(id: string): Promise<SellerProductDetail> {
  try {
    const response = await apiClient.get(`/seller/products/${encodeURIComponent(id)}`);
    const product = response.data?.data?.product;
    if (!product) throw new Error('That product no longer exists.');
    return product as SellerProductDetail;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that product.'));
  }
}

export async function createSellerProduct(
  input: SellerProductInput
): Promise<{ id: string; name: string }> {
  try {
    const response = await apiClient.post('/products', input);
    return response.data?.data?.product;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create that listing.'));
  }
}

export async function updateSellerProduct(
  id: string,
  input: Partial<SellerProductInput>
): Promise<void> {
  try {
    await apiClient.put(`/products/${encodeURIComponent(id)}`, input);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save that listing.'));
  }
}

/**
 * Takes a listing out of the shop.
 *
 * The endpoint is a DELETE but the row survives — it becomes DISCONTINUED,
 * which removes it from the storefront while leaving it in the orders that
 * reference it. Named for what it does, so nothing here promises a seller their
 * sales history is being erased.
 */
export async function discontinueSellerProduct(id: string): Promise<void> {
  try {
    await apiClient.delete(`/products/${encodeURIComponent(id)}`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not remove that listing.'));
  }
}

export async function getSellerVariants(productId: string): Promise<SellerVariant[]> {
  try {
    const response = await apiClient.get(
      `/seller/products/${encodeURIComponent(productId)}/variants`
    );
    return response.data?.data?.variants ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the sizes on that listing.'));
  }
}

export async function createSellerVariant(
  productId: string,
  input: SellerVariantInput
): Promise<SellerVariant> {
  try {
    const response = await apiClient.post(
      `/seller/products/${encodeURIComponent(productId)}/variants`,
      input
    );
    return response.data?.data?.variant;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not add that size.'));
  }
}

export async function updateSellerVariant(
  productId: string,
  variantId: string,
  input: Partial<SellerVariantInput>
): Promise<void> {
  try {
    await apiClient.put(
      `/seller/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
      input
    );
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save that size.'));
  }
}

export async function deleteSellerVariant(productId: string, variantId: string): Promise<void> {
  try {
    await apiClient.delete(
      `/seller/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`
    );
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not remove that size.'));
  }
}

/**
 * Uploads one photo and returns the path to store on the listing.
 *
 * A relative `/uploads/...` path, never a hostname — the storefront rewrites
 * that prefix to the API, so a stored value keeps working when the API moves.
 */
export async function uploadSellerPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await apiClient.post('/seller/media', form, {
      // The shared client sets JSON for every request. Undoing it here lets
      // the browser write the multipart header itself — which it has to,
      // because only the browser knows the boundary it just generated.
      headers: { 'Content-Type': undefined },
      timeout: 60000,
    });
    return response.data?.data?.asset?.url as string;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not upload that photo.'));
  }
}

/**
 * Turns a listing name into a URL-safe slug.
 *
 * Slug and SKU are required by the API but are plumbing, not decisions — a
 * seller adding a product should not have to invent either. Both are derived
 * here and stay editable, which keeps "list a product" down to a name, a price
 * and a category. The rules match the admin console's on purpose: the same
 * product should get the same address whichever side created it.
 */
export const sellerSlugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

/**
 * A SKU derived from the name plus a short random tail.
 *
 * The tail matters: SKU is unique across the whole catalogue, and two sellers
 * both listing a "Blue Polo" would otherwise collide on save with an error
 * neither of them could act on.
 */
export function suggestSellerSku(name: string): string {
  const stem = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((word) => word.slice(0, 4))
    .join('-');

  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return stem ? `${stem}-${tail}` : `SKU-${tail}`;
}

/** A variant SKU derived from the listing's SKU, the colour and the size. */
export function suggestSellerVariantSku(productSku: string, color: string, size: string): string {
  const part = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return [productSku.toUpperCase(), part(color), part(size)].filter(Boolean).join('-');
}

// ── Identity check (KYC) ──────────────────────────────────────────────

export interface SellerKyc {
  status: KycStatus;
  pan: string | null;
  gstin: string | null;
  documents: string[];
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  maxDocuments: number;
}

export async function getSellerKyc(): Promise<SellerKyc> {
  try {
    const response = await apiClient.get('/seller/kyc');
    return response.data?.data?.kyc;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your verification status.'));
  }
}

/** Upload one PDF or photo. Returns the full document list after the upload. */
export async function uploadKycDocument(file: File): Promise<string[]> {
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await apiClient.post('/seller/kyc/documents', form, {
      headers: { 'Content-Type': undefined },
      timeout: 60000,
    });
    return response.data?.data?.documents ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not upload that document.'));
  }
}

export async function deleteKycDocument(name: string): Promise<string[]> {
  try {
    const response = await apiClient.delete(`/seller/kyc/documents/${encodeURIComponent(name)}`);
    return response.data?.data?.documents ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not remove that document.'));
  }
}

/**
 * The document itself. It sits behind auth, so it cannot be a plain link:
 * the caller turns the blob into an object URL and revokes it afterwards.
 */
export async function fetchKycDocument(name: string): Promise<Blob> {
  try {
    const response = await apiClient.get(`/seller/kyc/documents/${encodeURIComponent(name)}`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not open that document.'));
  }
}

export async function submitKyc(input: { pan: string; gstin?: string }): Promise<MyShop> {
  try {
    const response = await apiClient.post('/seller/kyc/submit', input);
    return response.data?.data?.shop;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not submit your verification.'));
  }
}

// ── Applications ─────────────────────────────────────────────────────

/**
 * Whether the public can apply to sell. The owner can switch this off from the
 * admin console; /sell and the apply form then say "by invitation" instead of
 * offering a form the server would refuse. A failed check reads as open — the
 * server still has the final say.
 */
export async function getApplicationsOpen(): Promise<boolean> {
  try {
    const response = await apiClient.get('/seller/applications-open');
    return response.data?.data?.open !== false;
  } catch {
    return true;
  }
}

// ── Brands ───────────────────────────────────────────────────────────

export type BrandAuthorizationType = 'TRADEMARK_OWNER' | 'AUTHORISED_RESELLER';
export type BrandStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SellerBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  status: BrandStatus;
  isActive: boolean;
  authorizationType: BrandAuthorizationType | null;
  rejectionReason: string | null;
  hasDocument: boolean;
  createdAt: string;
  _count: { products: number };
}

export async function getSellerBrands(): Promise<SellerBrand[]> {
  try {
    const response = await apiClient.get('/seller/brands');
    return response.data?.data?.brands ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your brands.'));
  }
}

/** Registers a brand, or resubmits one this shop already asked for. */
export async function registerSellerBrand(input: {
  name: string;
  description?: string;
  logo?: string;
  authorizationType: BrandAuthorizationType;
  document: File;
}): Promise<SellerBrand> {
  const form = new FormData();
  form.append('name', input.name);
  if (input.description) form.append('description', input.description);
  if (input.logo) form.append('logo', input.logo);
  form.append('authorizationType', input.authorizationType);
  form.append('document', input.document);
  try {
    const response = await apiClient.post('/seller/brands', form, {
      headers: { 'Content-Type': undefined },
      timeout: 60000,
    });
    return response.data?.data?.brand;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not register that brand.'));
  }
}

/** The authorization document on file, as a blob (it sits behind auth). */
export async function fetchSellerBrandDocument(brandId: string): Promise<Blob> {
  try {
    const response = await apiClient.get(`/seller/brands/${encodeURIComponent(brandId)}/document`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not open that document.'));
  }
}
