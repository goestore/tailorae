'use client';

import axios from 'axios';
import { apiClient, realmOf } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';
import type { components } from '@/lib/api/schema';
import type { Page, Present } from '@/lib/api/types';
import type { OrderStatus, ProductStatus } from '@/types';
import type { ListingFields, VariantListingFields } from '@/lib/catalogue-api';

/**
 * Seller Central's calls to the API (docs/API_MIGRATION.md §3, §4, §6).
 *
 * Every route is under `/seller/...`, so the shared client sends the seller
 * session cookie and, on a 401, refreshes the seller realm. The business a call
 * acts for is never sent in a body or a path: the API takes it from the
 * caller's membership. A person who works for several shops picks one with the
 * `X-Seller-Id` header, which this module adds (see `setActiveSeller`).
 *
 * Money is integer paise in and out; `formatPaise` turns it into rupees only
 * where it is shown.
 */

type Schemas = components['schemas'];

// ── Shapes ───────────────────────────────────────────────────────────

export type SellerStatus = Schemas['ShopView']['status'];
export type SellerRole = Schemas['MembershipView']['role'];
export type BusinessType = Schemas['CreateBusinessRequest']['businessType'];
export type KycKind = Schemas['KycDocumentView']['kind'];

export type PostalAddress = Schemas['PostalAddress'];
export type Shop = Present<Schemas['ShopView']>;
export type Membership = Present<Schemas['MembershipView']>;
export type KycDocument = Present<Schemas['KycDocumentView']>;
export type BankAccount = Present<Schemas['BankAccountView']>;
export type Member = Present<Schemas['MemberView']>;
export type Invite = Present<Schemas['InviteView']>;
export type Withdrawal = Present<Schemas['WithdrawalView']>;
export type HeldOrder = Present<Schemas['HeldOrder']>;
export type CreateBusinessInput = Schemas['CreateBusinessRequest'];
export type UpdateBusinessInput = Schemas['UpdateBusinessRequest'];
export type BankAccountInput = Schemas['BankAccountRequest'];

/** `GET /seller/me`: the active shop (null before one exists) and the person's place in it. */
export interface SellerMe {
  shop: Shop | null;
  role: SellerRole | null;
  memberships: Membership[];
  /** What is still missing before the application can be submitted; empty when ready. */
  checklist: string[];
  applicationsOpen: boolean;
}

/** The address a seller ships to: name and address only, never the customer's contact details. */
export interface ShipTo {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

export type SellerOrderItem = Present<Schemas['OrderItemView']>;

/** This shop's part of a customer order. */
export interface SellerOrder extends Omit<Present<Schemas['SellerOrderView']>, 'shipTo' | 'items' | 'status'> {
  status: OrderStatus;
  shipTo: ShipTo;
  items: SellerOrderItem[];
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  thumbnail: string | null;
}

export interface SellerDashboard {
  ordersToShip: number;
  ordersThisMonth: number;
  salesThisMonthPaise: number;
  lowStock: LowStockItem[];
  recentOrders: SellerOrder[];
}

export interface EarningsSummary {
  /** Cleared the return window and payable now. */
  balancePaise: number;
  /** Earned, but not payable yet; each order says why in `held`. */
  heldPaise: number;
  held: HeldOrder[];
  lifetimeSalesPaise: number;
  lifetimePayoutsPaise: number;
  openWithdrawal: Withdrawal | null;
}

export type LedgerType = 'SALE' | 'PAYOUT' | 'RETURN_REVERSAL' | 'ADJUSTMENT';

export interface StatementLine {
  entry: {
    id: string;
    createdAt: string;
    type: LedgerType;
    orderNumber: string | null;
    reference: string | null;
    note: string | null;
    /** Signed: credits positive, payouts and reversals negative. */
    amountPaise: number;
  };
  balanceAfterPaise: number;
}

export interface Statement {
  openingPaise: number;
  closingPaise: number;
  lines: StatementLine[];
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  INDIVIDUAL: 'Individual',
  PROPRIETORSHIP: 'Sole proprietorship',
  PARTNERSHIP: 'Partnership firm',
  LLP: 'LLP',
  PRIVATE_LIMITED: 'Private limited company',
  PUBLIC_LIMITED: 'Public limited company',
  OTHER: 'Other',
};

export const KYC_KIND_LABELS: Record<KycKind, string> = {
  PAN: 'PAN card',
  GST_CERTIFICATE: 'GST certificate',
  ADDRESS_PROOF: 'Address proof',
  CANCELLED_CHEQUE: 'Cancelled cheque',
  OTHER: 'Other document',
};

export const ROLE_LABELS: Record<SellerRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CATALOG: 'Catalogue',
  FULFILMENT: 'Fulfilment',
  FINANCE: 'Finance',
};

export const ROLE_DESCRIPTIONS: Record<SellerRole, string> = {
  OWNER: 'Everything, including business details, KYC and bank',
  MANAGER: 'Team, listings, orders and returns',
  CATALOG: 'Listings and stock',
  FULFILMENT: 'Orders and returns',
  FINANCE: 'Earnings, statements and withdrawals',
};

// ── Permissions ──────────────────────────────────────────────────────

/** One row of the permission matrix in docs/ACCOUNTS.md; the API enforces the same. */
export type SellerPermission = 'PROFILE' | 'MEMBERS' | 'CATALOG' | 'ORDERS' | 'RETURNS' | 'FINANCE';

const PERMISSIONS: Record<SellerPermission, SellerRole[]> = {
  PROFILE: ['OWNER'],
  MEMBERS: ['OWNER', 'MANAGER'],
  CATALOG: ['OWNER', 'MANAGER', 'CATALOG'],
  ORDERS: ['OWNER', 'MANAGER', 'FULFILMENT'],
  RETURNS: ['OWNER', 'MANAGER', 'FULFILMENT'],
  FINANCE: ['OWNER', 'FINANCE'],
};

export const roleCan = (role: SellerRole | null | undefined, permission: SellerPermission): boolean =>
  Boolean(role && PERMISSIONS[permission].includes(role));

// ── Statuses ─────────────────────────────────────────────────────────

/** States in which the seller may still change their legal details and submit. */
export const EDITABLE_STATUSES: SellerStatus[] = ['DRAFT', 'NEEDS_INFO'];

export const STATUS_LABELS: Record<SellerStatus, string> = {
  DRAFT: 'Not submitted',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_INFO: 'Needs changes',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  SUSPENDED: 'Suspended',
};

// ── The active shop (X-Seller-Id) ────────────────────────────────────

/** The shop a person in several shops last picked. The only seller value kept in localStorage. */
export const ACTIVE_SELLER_KEY = 'tl:seller:active';

let headerSellerId: string | null = null;

export function readStoredSeller(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SELLER_KEY);
  } catch {
    return null;
  }
}

/**
 * Remember the shop to act for and send it on every seller call from now on.
 * `null` forgets the choice, which leaves the API on the person's first shop.
 */
export function setActiveSeller(sellerId: string | null): void {
  headerSellerId = sellerId;
  try {
    if (sellerId) localStorage.setItem(ACTIVE_SELLER_KEY, sellerId);
    else localStorage.removeItem(ACTIVE_SELLER_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page load only.
  }
}

/**
 * Decides whether the stored choice is sent. The API defaults to the first
 * membership, so the header only goes out when another shop was picked —
 * which also keeps it off every call for the many sellers with one shop.
 */
export function syncActiveSeller(memberships: Membership[]): string | null {
  const stored = readStoredSeller();
  const valid = stored && memberships.some((m) => m.sellerId === stored) ? stored : null;
  if (stored && !valid) setActiveSeller(null);
  headerSellerId = valid && memberships[0]?.sellerId !== valid ? valid : null;
  return valid ?? memberships[0]?.sellerId ?? null;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** false: ask as the person's default shop, whatever was picked (see `getSellerMe`). */
    sellerHeader?: boolean;
  }
}

apiClient.interceptors.request.use((config) => {
  if (
    headerSellerId &&
    config.sellerHeader !== false &&
    realmOf(config.url) === 'seller' &&
    !/^\/?seller\/auth\//.test(config.url ?? '')
  ) {
    config.headers.set('X-Seller-Id', headerSellerId);
  }
  return config;
});

// ── Helpers ──────────────────────────────────────────────────────────

const id = (value: string) => encodeURIComponent(value);

async function call<T>(request: Promise<{ data?: { data?: unknown } }>, fallback: string): Promise<T> {
  try {
    const response = await request;
    return response.data?.data as T;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, fallback));
  }
}

/** The server's own message, for a toast after a write. */
async function message(request: Promise<{ data?: { message?: string } }>, fallback: string, ok: string): Promise<string> {
  try {
    const response = await request;
    return response.data?.message || ok;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, fallback));
  }
}

const upload = { timeout: 60000 };

// ── Account: who am I, email and phone ───────────────────────────────

/**
 * Who the person is in the active shop. `defaultShop` asks without the
 * `X-Seller-Id` choice — the first read on load, which is what tells us the
 * person's shops and so whether the stored choice is still one of them.
 */
export function getSellerMe(options: { defaultShop?: boolean } = {}): Promise<SellerMe> {
  return call<SellerMe>(
    apiClient.get('/seller/me', options.defaultShop ? { sellerHeader: false } : undefined),
    'Could not load your shop.'
  ).then((me) => ({
    shop: me?.shop ?? null,
    role: me?.role ?? null,
    memberships: me?.memberships ?? [],
    checklist: me?.checklist ?? [],
    applicationsOpen: me?.applicationsOpen !== false,
  }));
}

/** Whether the signed-in seller account has confirmed its email and phone. */
export function getContactVerification(): Promise<{ email: boolean; phone: boolean }> {
  return call<{ email?: boolean; phone?: boolean }>(
    apiClient.get('/seller/auth/verification'),
    'Could not check your email and phone.'
  ).then((v) => ({ email: Boolean(v?.email), phone: Boolean(v?.phone) }));
}

export function sendPhoneCode(): Promise<string> {
  return message(apiClient.post('/seller/auth/phone/send-code'), 'Could not send the code.', 'Code sent.');
}

export function verifyPhoneCode(code: string): Promise<string> {
  return message(
    apiClient.post('/seller/auth/phone/verify', { code: code.trim() }),
    'That code did not work.',
    'Phone confirmed.'
  );
}

export function resendEmailConfirmation(): Promise<string> {
  return message(
    apiClient.post('/seller/auth/verify-email/resend'),
    'Could not send the email.',
    'Confirmation email sent.'
  );
}

// ── Business ─────────────────────────────────────────────────────────

export function createBusiness(input: CreateBusinessInput): Promise<Shop> {
  return call<Shop>(apiClient.post('/seller/business', input), 'Could not create your shop.');
}

export function updateBusiness(input: UpdateBusinessInput): Promise<Shop> {
  return call<Shop>(apiClient.put('/seller/business', input), 'Could not save your shop.');
}

/** Sends the application for review once `checklist` is empty. */
export function submitApplication(): Promise<Shop> {
  return call<Shop>(apiClient.post('/seller/business/submit'), 'Could not submit your application.');
}

/**
 * Whether the public can apply to sell. The owner can switch this off from the
 * admin console; /sell and the overview then say "by invitation" instead of
 * offering a form the server would refuse. A failed check reads as open — the
 * server still has the final say.
 */
export async function getApplicationsOpen(): Promise<boolean> {
  try {
    const response = await apiClient.get('/seller/applications-open', { silent: true });
    return response.data?.data?.open !== false;
  } catch {
    return true;
  }
}

/** Shop name typed on the /sell landing page, carried through sign-up to the business form. */
export const PENDING_SHOP_KEY = 'tl:pendingShopName';

// ── KYC documents ────────────────────────────────────────────────────

export function listKycDocuments(): Promise<KycDocument[]> {
  return call<KycDocument[]>(apiClient.get('/seller/kyc/documents'), 'Could not load your documents.').then(
    (rows) => rows ?? []
  );
}

export function uploadKycDocument(kind: KycKind, file: File): Promise<KycDocument> {
  const form = new FormData();
  form.append('file', file);
  return call<KycDocument>(
    apiClient.post(`/seller/kyc/documents?kind=${id(kind)}`, form, upload),
    'Could not upload that document.'
  );
}

/** A five-minute link to the private file. */
export function kycDocumentUrl(documentId: string): Promise<string> {
  return call<{ url: string }>(
    apiClient.get(`/seller/kyc/documents/${id(documentId)}/url`),
    'Could not open that document.'
  ).then((data) => data.url);
}

export async function deleteKycDocument(documentId: string): Promise<void> {
  await call(apiClient.delete(`/seller/kyc/documents/${id(documentId)}`), 'Could not remove that document.');
}

// ── Bank ─────────────────────────────────────────────────────────────

/** The payout account, masked; null when none is on file yet. */
export async function getBankAccount(): Promise<BankAccount | null> {
  try {
    const response = await apiClient.get('/seller/bank');
    return (response.data?.data as BankAccount | null) ?? null;
  } catch (error) {
    if (getApiErrorStatus(error) === 404) return null;
    throw new Error(getApiErrorMessage(error, 'Could not load your bank account.'));
  }
}

export function saveBankAccount(input: BankAccountInput): Promise<BankAccount> {
  return call<BankAccount>(apiClient.put('/seller/bank', input), 'Could not save your bank account.');
}

// ── Team ─────────────────────────────────────────────────────────────

export function getTeam(): Promise<{ members: Member[]; invites: Invite[] }> {
  return call<{ members?: Member[]; invites?: Invite[] }>(
    apiClient.get('/seller/members'),
    'Could not load your team.'
  ).then((data) => ({ members: data?.members ?? [], invites: data?.invites ?? [] }));
}

export function inviteMember(email: string, role: SellerRole): Promise<Invite> {
  return call<Invite>(
    apiClient.post('/seller/members/invites', { email: email.trim(), role }),
    'Could not send that invite.'
  );
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await call(apiClient.delete(`/seller/members/invites/${id(inviteId)}`), 'Could not withdraw that invite.');
}

export async function removeMember(accountId: string): Promise<void> {
  await call(apiClient.delete(`/seller/members/${id(accountId)}`), 'Could not remove that member.');
}

export function acceptInvite(token: string): Promise<Membership> {
  return call<Membership>(apiClient.post('/seller/invites/accept', { token }), 'Could not accept the invite.');
}

// ── Overview ─────────────────────────────────────────────────────────

/** The dashboard figures, or null when the person has no shop yet (404). */
export async function getSellerSummary(): Promise<SellerDashboard | null> {
  try {
    const response = await apiClient.get('/seller/summary');
    const data = response.data?.data ?? {};
    return {
      ordersToShip: data.ordersToShip ?? 0,
      ordersThisMonth: data.ordersThisMonth ?? 0,
      salesThisMonthPaise: data.salesThisMonthPaise ?? 0,
      lowStock: data.lowStock ?? [],
      recentOrders: data.recentOrders ?? [],
    };
  } catch (error) {
    if (getApiErrorStatus(error) === 404) return null;
    throw new Error(getApiErrorMessage(error, 'Could not load your dashboard.'));
  }
}

// ── Orders ───────────────────────────────────────────────────────────

export function getSellerOrders(
  params: { status?: OrderStatus | ''; page?: number; limit?: number } = {}
): Promise<Page<SellerOrder>> {
  return call<Page<SellerOrder>>(
    apiClient.get('/seller/orders', {
      params: { status: params.status || undefined, page: params.page ?? 1, limit: params.limit ?? 20 },
    }),
    'Could not load your orders.'
  ).then((page) => ({
    items: page?.items ?? [],
    total: page?.total ?? 0,
    page: page?.page ?? 1,
    limit: page?.limit ?? 20,
    pages: page?.pages ?? 0,
  }));
}

export function getSellerOrder(orderId: string): Promise<SellerOrder> {
  return call<SellerOrder>(apiClient.get(`/seller/orders/${id(orderId)}`), 'Could not load that order.');
}

/** Moves the shop's part of an order. SHIPPED needs a tracking number. */
export function updateSellerOrder(
  orderId: string,
  input: { status: OrderStatus; trackingNumber?: string; carrier?: string; message?: string }
): Promise<SellerOrder> {
  return call<SellerOrder>(
    apiClient.patch(`/seller/orders/${id(orderId)}`, input),
    'Could not update that order.'
  );
}

/**
 * The step a seller would normally take next. The API also accepts skipping
 * ahead (never back), and cancelling before shipment.
 */
export const NEXT_STEP: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  PENDING: { status: 'CONFIRMED', label: 'Accept order' },
  CONFIRMED: { status: 'PROCESSING', label: 'Start preparing' },
  PROCESSING: { status: 'READY_FOR_SHIPMENT', label: 'Mark ready to ship' },
  READY_FOR_SHIPMENT: { status: 'SHIPPED', label: 'Mark shipped' },
  SHIPPED: { status: 'DELIVERED', label: 'Mark delivered' },
};

// ── Money ────────────────────────────────────────────────────────────

export function getEarnings(): Promise<EarningsSummary> {
  return call<EarningsSummary>(apiClient.get('/seller/earnings'), 'Could not load your earnings.').then((e) => ({
    balancePaise: e?.balancePaise ?? 0,
    heldPaise: e?.heldPaise ?? 0,
    held: e?.held ?? [],
    lifetimeSalesPaise: e?.lifetimeSalesPaise ?? 0,
    lifetimePayoutsPaise: e?.lifetimePayoutsPaise ?? 0,
    openWithdrawal: e?.openWithdrawal ?? null,
  }));
}

/** `from`/`to` are ISO instants; either may be left out. */
export function getStatement(range: { from?: string; to?: string } = {}): Promise<Statement> {
  return call<Statement>(
    apiClient.get('/seller/earnings/statement', { params: { from: range.from, to: range.to } }),
    'Could not load your statement.'
  ).then((s) => ({ openingPaise: s?.openingPaise ?? 0, closingPaise: s?.closingPaise ?? 0, lines: s?.lines ?? [] }));
}

/** The same statement as CSV, for the seller's accountant. */
export async function downloadStatementCsv(range: { from?: string; to?: string } = {}): Promise<Blob> {
  try {
    const response = await apiClient.get('/seller/earnings/statement', {
      params: { from: range.from, to: range.to, format: 'csv' },
      responseType: 'blob',
    });
    return response.data as Blob;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not download the statement.'));
  }
}

export function getWithdrawals(page = 1): Promise<Page<Withdrawal>> {
  return call<Page<Withdrawal>>(
    apiClient.get('/seller/withdrawals', { params: { page, limit: 20 } }),
    'Could not load your withdrawals.'
  ).then((p) => ({
    items: p?.items ?? [],
    total: p?.total ?? 0,
    page: p?.page ?? 1,
    limit: p?.limit ?? 20,
    pages: p?.pages ?? 0,
  }));
}

/**
 * Ask to be paid. Without an amount the whole payable balance is requested;
 * the server refuses anything above it.
 */
export function requestWithdrawal(amountPaise?: number): Promise<Withdrawal> {
  return call<Withdrawal>(
    apiClient.post('/seller/withdrawals', amountPaise !== undefined ? { amountPaise } : {}),
    'Could not request that withdrawal.'
  );
}

// ── Catalogue ────────────────────────────────────────────────────────

export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A row of the seller's product list. */
export interface SellerProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  pricePaise: number;
  mrpPaise: number | null;
  quantity: number;
  status: ProductStatus;
  moderationStatus: ModerationStatus;
  moderationNote: string | null;
  thumbnail: string | null;
  category: { name: string } | null;
  brand: { name: string } | null;
}

/** One size of one colour. `pricePaise` null means it costs the same as the product. */
export interface SellerVariant extends VariantListingFields {
  id: string;
  productId: string;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  material: string | null;
  pricePaise: number | null;
  quantity: number;
  images: string[];
  isDefault: boolean;
}

/** One personalisation option, as the API stores it. */
export interface SellerCustomization {
  id?: string;
  name: string;
  /** Upper-case on the way out of the API: TEXT, COLOR, IMAGE, EMBROIDERY, PRINT. */
  type: string;
  isRequired: boolean;
  options: string[] | null;
  additionalPaise: number;
  maxCharacters: number | null;
}

/** One of the seller's own listings in full, as the edit form needs it. */
export interface SellerProductDetail extends ListingFields {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  shortDescription: string | null;
  pricePaise: number;
  mrpPaise: number | null;
  costPaise: number | null;
  quantity: number;
  status: ProductStatus;
  categoryId: string;
  category: { id: string; name: string; slug: string } | null;
  brand: { id: string; name: string; slug: string } | null;
  brandId: string | null;
  color: string | null;
  material: string | null;
  thumbnail: string | null;
  images: string[];
  sizeGuide: string | null;
  moderationStatus: ModerationStatus;
  moderationNote: string | null;
  variants: SellerVariant[];
  customizations: SellerCustomization[];
}

export interface SellerProductPage {
  products: SellerProduct[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function getSellerProducts(
  params: { status?: string; q?: string; page?: number; limit?: number } = {}
): Promise<SellerProductPage> {
  return call<SellerProductPage>(
    apiClient.get('/seller/products', {
      params: { status: params.status || undefined, q: params.q || undefined, page: params.page ?? 1, limit: params.limit ?? 50 },
    }),
    'Could not load your products.'
  ).then((data) => ({
    products: data?.products ?? [],
    pagination: data?.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 0 },
  }));
}

/**
 * One of the seller's own listings, draft or live. Read through `/seller`:
 * the public product route hides anything not live, which is exactly the state
 * of every listing a seller most needs to edit.
 */
export async function getSellerProduct(productId: string): Promise<SellerProductDetail> {
  const data = await call<{ product?: SellerProductDetail }>(
    apiClient.get(`/seller/products/${id(productId)}`),
    'Could not load that product.'
  );
  if (!data?.product) throw new Error('That product no longer exists.');
  return data.product;
}

/** The API's save, keeping the status and any go-live field list for the form. */
export class SellerSaveError extends Error {
  status?: number;
  data?: unknown;
  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function productWrite(
  request: Promise<{ data?: { data?: { product?: unknown }; message?: string } }>,
  fallback: string
): Promise<{ product: Record<string, unknown>; message: string }> {
  try {
    const response = await request;
    return {
      product: (response.data?.data?.product ?? {}) as Record<string, unknown>,
      message: String(response.data?.message ?? ''),
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const body = axios.isAxiosError(error) ? error.response?.data : undefined;
    throw new SellerSaveError(getApiErrorMessage(error, fallback), status, body);
  }
}

export function createSellerProduct(body: Record<string, unknown>) {
  return productWrite(apiClient.post('/seller/products', body), 'Could not create that listing.');
}

export function updateSellerProduct(productId: string, body: Record<string, unknown>) {
  return productWrite(apiClient.put(`/seller/products/${id(productId)}`, body), 'Could not save that listing.');
}

/**
 * Takes a listing out of the shop. The row survives as DISCONTINUED, so the
 * orders that reference it keep it; nothing here promises the sales history is
 * erased.
 */
export async function discontinueSellerProduct(productId: string): Promise<void> {
  await call(apiClient.delete(`/seller/products/${id(productId)}`), 'Could not remove that listing.');
}

export function getSellerVariants(productId: string): Promise<SellerVariant[]> {
  return call<{ variants?: SellerVariant[] }>(
    apiClient.get(`/seller/products/${id(productId)}/variants`),
    'Could not load the sizes on that listing.'
  ).then((data) => data?.variants ?? []);
}

export function createSellerVariant(productId: string, body: Record<string, unknown>): Promise<SellerVariant> {
  return call<{ variant: SellerVariant }>(
    apiClient.post(`/seller/products/${id(productId)}/variants`, body),
    'Could not add that size.'
  ).then((data) => data.variant);
}

export async function updateSellerVariant(
  productId: string,
  variantId: string,
  body: Record<string, unknown>
): Promise<void> {
  await call(
    apiClient.put(`/seller/products/${id(productId)}/variants/${id(variantId)}`, body),
    'Could not save that size.'
  );
}

export async function deleteSellerVariant(productId: string, variantId: string): Promise<void> {
  await call(
    apiClient.delete(`/seller/products/${id(productId)}/variants/${id(variantId)}`),
    'Could not remove that size.'
  );
}

export function saveSellerCustomizations(
  productId: string,
  customizations: SellerCustomization[]
): Promise<SellerCustomization[]> {
  return call<{ customizations?: SellerCustomization[] }>(
    apiClient.put(`/seller/products/${id(productId)}/customizations`, { customizations }),
    'Could not save those options.'
  ).then((data) => data?.customizations ?? []);
}

/** Uploads one photo and returns its URL. */
export function uploadSellerPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  return call<{ asset?: { url?: string } }>(
    apiClient.post('/seller/media', form, upload),
    'Could not upload that photo.'
  ).then((data) => {
    if (!data?.asset?.url) throw new Error('The upload did not return a picture.');
    return data.asset.url;
  });
}

/** Brands the listing form offers: approved ones, and this shop's own pending ones. */
export function getListingBrands(): Promise<Array<{ id: string; name: string; isActive?: boolean }>> {
  return call<{ brands?: Array<{ id: string; name: string; isActive?: boolean }> }>(
    apiClient.get('/seller/catalogue/brands'),
    'Could not load brands.'
  ).then((data) => data?.brands ?? []);
}

/** Add a brand by name from the listing form (or get the existing one). */
export function quickAddBrand(name: string): Promise<{ id: string; name: string }> {
  return call<{ brand: { id: string; name: string } }>(
    apiClient.post('/seller/catalogue/brands', { name }),
    'Could not add that brand.'
  ).then((data) => data.brand);
}

/** Manufacturer, packer, importer and origin from the shop's last listing. */
export async function getLastBusinessDetails(): Promise<Record<string, unknown> | null> {
  try {
    const response = await apiClient.get('/seller/catalogue/last-business-details');
    return (response.data?.data?.details ?? null) as Record<string, unknown> | null;
  } catch {
    // Prefill is a convenience; without it the fields simply start empty.
    return null;
  }
}

// ── Brands ───────────────────────────────────────────────────────────

export type BrandAuthorizationType = 'OWNER' | 'AUTHORISED_RESELLER';
export type BrandStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A brand this shop registered to sell under, with its own authorisation's review. */
export interface SellerBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  /** The brand's own review (shared by every shop that sells it). */
  status: BrandStatus;
  isActive: boolean;
  authorizationType: BrandAuthorizationType | null;
  /** This shop's proof, reviewed per shop. */
  authorizationStatus: BrandStatus | null;
  authorizationRejectionReason: string | null;
  hasDocument: boolean;
  requestedAt: string;
  _count: { products: number };
}

export function getSellerBrands(): Promise<SellerBrand[]> {
  return call<{ brands?: SellerBrand[] }>(apiClient.get('/seller/brands'), 'Could not load your brands.').then(
    (data) => data?.brands ?? []
  );
}

/** Registers a brand, or resubmits proof for one this shop already asked for. */
export function registerSellerBrand(input: {
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
  return call<{ brand: SellerBrand }>(
    apiClient.post('/seller/brands', form, upload),
    'Could not register that brand.'
  ).then((data) => data.brand);
}

/** A five-minute link to the authorisation document on file. */
export function sellerBrandDocumentUrl(brandId: string): Promise<string> {
  return call<{ url: string }>(
    apiClient.get(`/seller/brands/${id(brandId)}/document`),
    'Could not open that document.'
  ).then((data) => data.url);
}

// ── Small helpers the pages share ────────────────────────────────────

/**
 * Turns a listing name into a URL-safe slug. Slug and SKU are plumbing, not
 * decisions — a seller should not have to invent either.
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

/** Saves a blob the API returned as a file the browser downloads. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
