'use client';

import axios from 'axios';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { downloadFromApi } from '@/lib/admin-download';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';
import {
  ListingSaveError,
  type ListingFields,
  type MissingField,
  type SavedProduct,
  type VariantListingFields,
} from '@/lib/catalogue-api';

/**
 * Staff catalogue client (`/admin/products…`, `/admin/categories`, MODERATOR;
 * categories also CONTENT).
 *
 * The API speaks integer paise (`pricePaise`, `mrpPaise`, `costPaise`, variant
 * `pricePaise`, customisation `additionalPaise`, bulk tier `discountBp` /
 * `pricePaise`) and names the owning shop `sellerId` / `seller`. Screens show
 * paise with `formatPaise`.
 *
 * The shared listing form (also used by the seller console) still works in
 * rupees with the legacy names (`price`, `originalPrice`, `costPrice`,
 * `vendorId`). So every product this module returns carries both — the API's
 * paise fields and rupee mirrors derived from them — and every body it sends
 * goes through `toApiProductBody`, which turns legacy rupee keys into paise
 * keys and passes paise keys through untouched. Whichever shape a caller
 * uses, the API only ever receives paise.
 */

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'DISCONTINUED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** The platform's own shop ("house stock"): every product has a seller row. */
export const PLATFORM_SELLER_ID = '01900000-0000-7000-8000-000000000001';

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  parentId?: string | null;
  displayOrder?: number;
  image?: string | null;
  icon?: string | null;
  description?: string | null;
  /** The category's own template key; children inherit it when unset. */
  listingTemplate?: string | null;
  /** Own template, else the nearest parent's. */
  resolvedTemplate?: string | null;
  family?: 'apparel' | 'general' | null;
  /** Commission in basis points (1000 = 10%) for items in this category; children inherit when unset. */
  commissionRateBp?: number | null;
  /** Homepage "Explore all categories" tile (uses `image`), ordered by homeOrder. */
  showOnHome?: boolean;
  homeOrder?: number;
  /** 0 for a top-level department; the list comes parents-first. */
  depth?: number;
  path?: string[];
  _count?: { products: number; children?: number };
}

/** The editable fields of a category. Empty strings clear optional ones. */
export interface CategoryInput {
  name: string;
  slug: string;
  parentId: string | null;
  displayOrder: number;
  isActive: boolean;
  image: string | null;
  description: string | null;
  listingTemplate: string | null;
  /** Basis points; sending it at all needs FINANCE. Leave it out to keep the stored rate. */
  commissionRateBp?: number | null;
  showOnHome?: boolean;
  homeOrder?: number;
}

/** The owning shop as the API sends it. */
export interface ProductSeller {
  id: string;
  shopName: string;
  shopSlug: string;
  shopImage?: string | null;
  isVerified?: boolean;
  isPlatform?: boolean;
}

export interface AdminProduct extends ListingFields {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  shortDescription: string | null;
  pricePaise: number;
  mrpPaise: number | null;
  costPaise: number | null;
  weightGrams?: number | null;
  discountPercentage: number;
  quantity: number;
  status: ProductStatus;
  isFeatured: boolean;
  isCustomizable: boolean;
  allowBulkOrders: boolean;
  images: string[];
  color: string | null;
  material: string | null;
  categoryId: string;
  category?: { id: string; name: string; slug: string };
  brandId?: string | null;
  brand?: { id: string; name: string; slug: string } | null;
  sellerId: string;
  seller?: ProductSeller | null;
  sizeGuide: string | null;
  videoUrl: string | null;
  barcode: string | null;
  dimensions: string | null;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  thumbnail?: string | null;
  moderationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  moderationNote?: string | null;
  customizations?: ProductCustomizationRow[];
  bulkPricings?: BulkPricingRow[];
  variants?: AdminVariant[];
  createdAt: string;
  updatedAt: string;

  /* Rupee mirrors for the shared listing form — derived, never sent back as-is. */
  /** Rupees, from `pricePaise`. */
  price: number;
  /** Rupees, from `mrpPaise`. */
  originalPrice: number | null;
  /** Rupees, from `costPaise`. */
  costPrice: number | null;
  /** The seller's id, or null for house stock. */
  vendorId: string | null;
  /** The seller, or null for house stock. */
  vendor: ProductSeller | null;
}

/**
 * One personalisation the shopper fills in — a name to embroider, a print
 * position to choose. The editor works in rupees and lower-case types; the API
 * stores `additionalPaise` and upper-case types (see `saveCustomizations`).
 */
export interface ProductCustomizationRow {
  id?: string;
  name: string;
  type: 'text' | 'color' | 'image' | 'embroidery' | 'print';
  isRequired: boolean;
  /** A list; older rows may hold a JSON or comma-separated string. */
  options: string[] | string | null;
  /** Rupees, for the editor. */
  additionalCost: number;
  maxCharacters: number | null;
}

/** A quantity band and what it costs. `pricePaise` is derived server-side. */
export interface BulkPricingRow {
  id?: string;
  minQty: number;
  maxQty: number | null;
  /** Percent off, for the editor (the API stores basis points). */
  discount: number;
  pricePaise?: number;
}

export interface ProductPage {
  products: ProductListRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isFeatured: boolean;
  status?: string;
  _count?: { products: number };
}

/* ── Shape conversion ──────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;

const num = (value: unknown): number | null =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);

const rupees = (paise: unknown): number | null => {
  const n = num(paise);
  return n === null ? null : paiseToRupees(n);
};

const toPaise = (value: unknown): number | null => {
  const n = num(value);
  return n === null ? null : rupeesToPaise(n);
};

/** A customisation from the API (or already in editor shape) as the editor works with it. */
export function toCustomizationRow(raw: Raw): ProductCustomizationRow {
  const type = String(raw.type ?? 'text').toLowerCase() as ProductCustomizationRow['type'];
  const additionalCost =
    raw.additionalPaise !== undefined
      ? (rupees(raw.additionalPaise) ?? 0)
      : (num(raw.additionalCost) ?? 0);
  return {
    id: raw.id as string | undefined,
    name: String(raw.name ?? ''),
    type,
    isRequired: Boolean(raw.isRequired),
    options: (raw.options as ProductCustomizationRow['options']) ?? null,
    additionalCost,
    maxCharacters: num(raw.maxCharacters),
  };
}

/** A bulk tier from the API (or already in editor shape). */
export function toBulkPricingRow(raw: Raw): BulkPricingRow {
  return {
    id: raw.id as string | undefined,
    minQty: Number(raw.minQty) || 0,
    maxQty: num(raw.maxQty),
    discount: raw.discountBp !== undefined ? (Number(raw.discountBp) || 0) / 100 : Number(raw.discount) || 0,
    pricePaise: num(raw.pricePaise) ?? undefined,
  };
}

function toVariant(raw: Raw): AdminVariant {
  return {
    ...(raw as unknown as AdminVariant),
    pricePaise: num(raw.pricePaise),
    price: rupees(raw.pricePaise),
  };
}

/** An API product with the rupee mirrors the listing form reads. */
export function fromApiProduct<T extends AdminProduct = AdminProduct>(raw: Raw): T {
  const seller = (raw.seller as ProductSeller | null | undefined) ?? null;
  const sellerId = String(raw.sellerId ?? seller?.id ?? '');
  const isHouse = seller ? Boolean(seller.isPlatform) : sellerId === PLATFORM_SELLER_ID;
  return {
    ...(raw as unknown as T),
    pricePaise: Number(raw.pricePaise) || 0,
    mrpPaise: num(raw.mrpPaise),
    costPaise: num(raw.costPaise),
    price: rupees(raw.pricePaise) ?? 0,
    originalPrice: rupees(raw.mrpPaise),
    costPrice: rupees(raw.costPaise),
    vendorId: isHouse || !sellerId ? null : sellerId,
    vendor: isHouse ? null : seller,
    variants: Array.isArray(raw.variants) ? (raw.variants as Raw[]).map(toVariant) : undefined,
    customizations: Array.isArray(raw.customizations)
      ? (raw.customizations as Raw[]).map(toCustomizationRow)
      : undefined,
    bulkPricings: Array.isArray(raw.bulkPricings)
      ? (raw.bulkPricings as Raw[]).map(toBulkPricingRow)
      : undefined,
  };
}

/** Legacy rupee key → API paise key. */
const MONEY_KEYS: Array<[string, string]> = [
  ['price', 'pricePaise'],
  ['originalPrice', 'mrpPaise'],
  ['costPrice', 'costPaise'],
];

/**
 * A product body for the API: rupee keys become paise keys, `vendorId`
 * becomes `sellerId` (empty = house stock), legacy-only keys are dropped.
 * Keys already in paise pass through.
 */
export function toApiProductBody(input: Raw): Raw {
  const body: Raw = { ...input };
  for (const [legacy, paise] of MONEY_KEYS) {
    if (!(legacy in body)) continue;
    const value = body[legacy];
    delete body[legacy];
    if (paise in body) continue;
    body[paise] = toPaise(value);
  }
  if ('weight' in body) {
    // Legacy weight was kilograms.
    const kg = num(body.weight);
    delete body.weight;
    if (!('weightGrams' in body)) body.weightGrams = kg === null ? null : Math.round(kg * 1000);
  }
  if ('vendorId' in body) {
    const vendor = body.vendorId;
    delete body.vendorId;
    if (!('sellerId' in body)) body.sellerId = vendor ? String(vendor) : 'house';
  }
  // Derived server-side from price and MRP.
  delete body.discountPercentage;
  return body;
}

/** A variant body for the API: `price` (rupees) becomes `pricePaise`. */
export function toApiVariantBody(input: Raw): Raw {
  const body: Raw = { ...input };
  if ('price' in body) {
    const value = body.price;
    delete body.price;
    if (!('pricePaise' in body)) body.pricePaise = toPaise(value);
  }
  return body;
}

/* ── Brands ────────────────────────────────────────────────────────────── */

/** Every brand, active or not — the product form must offer all of them. */
export async function listBrands(): Promise<AdminBrand[]> {
  try {
    const res = await apiClient.get('/admin/brands');
    return (res.data?.data?.brands ?? []) as AdminBrand[];
  } catch {
    // A missing brand list should not stop someone editing a product; the
    // picker simply offers "No brand".
    return [];
  }
}

/* ── Products ──────────────────────────────────────────────────────────── */

/** The fields the create/update endpoints accept, in either naming (see `toApiProductBody`). */
export interface ProductInput extends ListingFields {
  name: string;
  /** Empty string clears the brand. */
  brandId?: string;
  slug: string;
  sku: string;
  categoryId: string;
  pricePaise?: number;
  mrpPaise?: number | null;
  costPaise?: number | null;
  weightGrams?: number | null;
  /** Rupees (listing form); converted to `pricePaise`. */
  price?: number;
  /** Rupees (listing form); converted to `mrpPaise`. */
  originalPrice?: number | null;
  /** Rupees (listing form); converted to `costPaise`. */
  costPrice?: number | null;
  quantity?: number;
  status?: ProductStatus;
  description?: string;
  shortDescription?: string;
  images?: string[];
  color?: string;
  material?: string;
  isFeatured?: boolean;
  isCustomizable?: boolean;
  allowBulkOrders?: boolean;
  /** The owning shop; empty or `house` means house stock. */
  sellerId?: string;
  /** Legacy name for `sellerId`. */
  vendorId?: string;
  sizeGuide?: string;
  videoUrl?: string;
  barcode?: string;
  dimensions?: string;
  minOrderQuantity?: number;
  maxOrderQuantity?: number | null;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
}

/** Stock band the server computes for each row: by size when there are sizes. */
export type StockBand = 'healthy' | 'low' | 'out';

export interface ProductListRow extends AdminProduct {
  totalStock: number;
  stockBand: StockBand;
  variants: AdminVariant[];
}

export interface ProductListParams {
  search?: string;
  page?: number;
  limit?: number;
  status?: string;
  categoryId?: string;
  stock?: StockBand | '';
  moderation?: string;
  /** A seller's id, or `house`. */
  sellerId?: string;
  /** Legacy name for `sellerId`. */
  vendorId?: string;
  featured?: 'true' | '';
  images?: 'missing' | '';
  sort?: string;
}

export async function listProducts(params: ProductListParams): Promise<ProductPage> {
  try {
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== '' && value !== undefined)
    );
    const res = await apiClient.get('/admin/products', { params: clean });
    const data = res.data?.data ?? {};
    return {
      products: Array.isArray(data.products)
        ? (data.products as Raw[]).map((row) => fromApiProduct<ProductListRow>(row))
        : [],
      pagination: data.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load products.'));
  }
}

/** One product with its sizes, customisations and bulk tiers, hidden or not. */
export async function getProduct(id: string): Promise<AdminProduct> {
  try {
    const res = await apiClient.get(`/admin/products/${encodeURIComponent(id)}`);
    const product = res.data?.data?.product;
    if (!product) throw new Error('That product no longer exists.');
    return fromApiProduct(product as Raw);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that product.'));
  }
}

export async function createProduct(input: ProductInput): Promise<AdminProduct> {
  try {
    const res = await apiClient.post('/admin/products', toApiProductBody(input as unknown as Raw));
    return fromApiProduct(res.data?.data?.product as Raw);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create the product.'));
  }
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>
): Promise<AdminProduct> {
  try {
    const res = await apiClient.put(
      `/admin/products/${encodeURIComponent(id)}`,
      toApiProductBody(input as unknown as Raw)
    );
    return fromApiProduct(res.data?.data?.product as Raw);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save the product.'));
  }
}

/**
 * The staff save for the shared listing form (its `saveProduct` prop).
 *
 * Takes the form's body (legacy rupee names) and sends paise; a go-live
 * refusal comes back as `ListingSaveError` with the API's `data.missing`, so
 * the form can point at each field still to fill.
 */
export async function saveAdminListing(
  _mode: 'admin' | 'seller',
  id: string | null,
  body: Record<string, unknown>
): Promise<{ product: SavedProduct; message: string }> {
  const payload = toApiProductBody(body);
  try {
    const res = id
      ? await apiClient.put(`/admin/products/${encodeURIComponent(id)}`, payload)
      : await apiClient.post('/admin/products', payload);
    return {
      product: res.data?.data?.product as SavedProduct,
      message: String(res.data?.message ?? ''),
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const data = axios.isAxiosError(error)
      ? (error.response?.data as { data?: { missing?: MissingField[] }; missing?: MissingField[] })
      : undefined;
    const missing = data?.data?.missing ?? data?.missing;
    throw new ListingSaveError(
      getApiErrorMessage(error, 'Could not save the listing.'),
      status,
      Array.isArray(missing) ? missing : []
    );
  }
}

/**
 * Discontinues a product.
 *
 * The endpoint is a DELETE but the row survives — it is set to DISCONTINUED,
 * which takes it out of the shop while leaving it in the catalog and in the
 * orders that reference it.
 */
export async function discontinueProduct(id: string): Promise<void> {
  try {
    await apiClient.delete(`/admin/products/${encodeURIComponent(id)}`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not discontinue the product.'));
  }
}

export async function setFeatured(id: string, isFeatured: boolean): Promise<void> {
  try {
    await apiClient.patch(`/admin/products/${encodeURIComponent(id)}/featured`, { isFeatured });
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not change the featured flag.'));
  }
}

/* ── Categories ────────────────────────────────────────────────────────── */

export async function listCategories(): Promise<AdminCategory[]> {
  try {
    const res = await apiClient.get('/admin/categories');
    const categories = res.data?.data?.categories;
    return Array.isArray(categories) ? categories : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load categories.'));
  }
}

export async function createCategory(
  input: { name: string; slug: string } & Partial<CategoryInput>
): Promise<AdminCategory> {
  try {
    const res = await apiClient.post('/admin/categories', input);
    return res.data?.data?.category as AdminCategory;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create the category.'));
  }
}

export async function updateCategory(id: string, input: Partial<CategoryInput>): Promise<AdminCategory> {
  try {
    const res = await apiClient.put(`/admin/categories/${encodeURIComponent(id)}`, input);
    return res.data?.data?.category as AdminCategory;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save the category.'));
  }
}

/** Refused by the server while the category still holds products or subcategories. */
export async function deleteCategory(id: string): Promise<string> {
  try {
    const res = await apiClient.delete(`/admin/categories/${encodeURIComponent(id)}`);
    return String(res.data?.message ?? 'Category deleted');
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not delete the category.'));
  }
}

/** Basis points → the percent shown in an input: 1250 → "12.5". */
export const bpToPercent = (bp: number | null | undefined): string =>
  bp === null || bp === undefined ? '' : String(bp / 100);

/** A typed percent → basis points; blank → null (inherit). */
export const percentToBp = (percent: string): number | null =>
  percent.trim() === '' ? null : Math.round(Number(percent) * 100);

/**
 * Turns a product name into a URL-safe slug.
 *
 * Slug and SKU are required by the API but are plumbing, not decisions — an
 * admin adding a product should not have to invent either.
 */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

/**
 * A SKU derived from the name plus a short random tail. SKU is unique per
 * seller, and two products called "Blue Polo" would otherwise collide.
 */
export function suggestSku(name: string): string {
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

// ============================================
// Variants — one size of one colour
// ============================================

export interface AdminVariant extends VariantListingFields {
  id: string;
  productId?: string;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  material?: string | null;
  pricePaise: number | null;
  /** Rupees, from `pricePaise` (listing form). */
  price: number | null;
  quantity: number;
  images?: string[];
  isDefault?: boolean;
}

/** The fields the variant endpoints accept; `price` (rupees) is converted to `pricePaise`. */
export interface VariantInput extends VariantListingFields {
  name?: string;
  sku: string;
  size?: string | null;
  color?: string | null;
  pricePaise?: number | null;
  price?: number | null;
  quantity?: number;
  images?: string[];
}

export async function listVariants(productId: string): Promise<AdminVariant[]> {
  try {
    const res = await apiClient.get(`/admin/products/${encodeURIComponent(productId)}/variants`);
    return ((res.data?.data?.variants ?? []) as Raw[]).map(toVariant);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load this product colours.'));
  }
}

export async function createVariant(
  productId: string,
  input: VariantInput
): Promise<AdminVariant> {
  try {
    const res = await apiClient.post(
      `/admin/products/${encodeURIComponent(productId)}/variants`,
      toApiVariantBody(input as unknown as Raw)
    );
    return toVariant(res.data?.data?.variant as Raw);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not add that size.'));
  }
}

export async function updateVariant(
  productId: string,
  variantId: string,
  input: Partial<VariantInput>
): Promise<AdminVariant> {
  try {
    const res = await apiClient.put(
      `/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
      toApiVariantBody(input as unknown as Raw)
    );
    return toVariant(res.data?.data?.variant as Raw);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save that size.'));
  }
}

export async function deleteVariant(productId: string, variantId: string): Promise<void> {
  try {
    await apiClient.delete(
      `/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`
    );
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not remove that size.'));
  }
}

/** A variant SKU derived from the product SKU, the colour and the size. */
export function suggestVariantSku(productSku: string, color: string, size: string): string {
  const part = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  // Sizes keep their hyphen, the way Myntra sheets write size SKUs
  // (CKGD-0961-BRBR-8-9Y, not …-89Y), so a suggestion matches the sheet.
  const sizePart = size.toUpperCase().replace(/\s+/g, '').replace(/\//g, '-').replace(/[^A-Z0-9.-]/g, '').slice(0, 12);
  return [productSku.toUpperCase(), part(color), sizePart].filter(Boolean).join('-');
}

/* ── Seller pickers ────────────────────────────────────────────────────── */

/** A shop a product can be attributed to. */
export interface SellerOption {
  id: string;
  shopName: string;
  isVerified: boolean;
  isActive: boolean;
}

/**
 * Approved shops, for the seller pickers (`GET /admin/sellers?status=APPROVED`;
 * KYC_REVIEW, SUPPORT or FINANCE). House stock is not in this list — pickers
 * offer it separately — and the platform's own shop is left out of it.
 */
export async function listSellerOptions(): Promise<SellerOption[]> {
  try {
    const options: SellerOption[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const res = await apiClient.get('/admin/sellers', {
        params: { status: 'APPROVED', page, limit: 100 },
      });
      const data = res.data?.data ?? {};
      const items = (data.items ?? []) as Array<Raw>;
      for (const shop of items) {
        const id = String(shop.id ?? '');
        if (!id || id === PLATFORM_SELLER_ID || shop.isPlatform) continue;
        options.push({
          id,
          shopName: String(shop.shopName ?? shop.legalName ?? 'Shop'),
          isVerified: true,
          isActive: true,
        });
      }
      if (page >= Number(data.pages ?? 1)) break;
    }
    return options.sort((a, b) => a.shopName.localeCompare(b.shopName));
  } catch {
    // A missing seller list must not block editing (a MODERATOR may not be
    // allowed to read shops); the picker falls back to house stock only.
    return [];
  }
}

/* ── Customisations and bulk pricing ───────────────────────────────────── */

/**
 * Replace a product's personalisation options.
 *
 * Sent as a whole list: it is an ordered set the shopper reads top to bottom,
 * and the API turns `isCustomizable` on or off to match. The editor's rupees
 * and lower-case types go out as `additionalPaise` and upper-case types.
 */
export async function saveCustomizations(
  productId: string,
  customizations: ProductCustomizationRow[],
  /** A seller saves through the shop's own route, which checks ownership. */
  as: 'admin' | 'seller' = 'admin'
): Promise<ProductCustomizationRow[]> {
  try {
    const base = as === 'admin' ? '/admin/products' : '/seller/products';
    const res = await apiClient.put(`${base}/${encodeURIComponent(productId)}/customizations`, {
      customizations: customizations.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        name: row.name,
        type: row.type.toUpperCase(),
        isRequired: row.isRequired,
        options: parseCustomizationOptions(row.options),
        additionalPaise: rupeesToPaise(Number(row.additionalCost) || 0),
        maxCharacters: row.maxCharacters,
      })),
    });
    return ((res.data?.data?.customizations ?? []) as Raw[]).map(toCustomizationRow);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save those options.'));
  }
}

/** Replace a product's bulk pricing tiers. Per-unit prices are derived server-side. */
export async function saveBulkPricing(
  productId: string,
  tiers: BulkPricingRow[]
): Promise<BulkPricingRow[]> {
  try {
    const res = await apiClient.put(
      `/admin/products/${encodeURIComponent(productId)}/bulk-pricing`,
      {
        tiers: tiers.map((tier) => ({
          minQty: tier.minQty,
          maxQty: tier.maxQty,
          discountBp: Math.round((Number(tier.discount) || 0) * 100),
        })),
      }
    );
    return ((res.data?.data?.bulkPricings ?? []) as Raw[]).map(toBulkPricingRow);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save those tiers.'));
  }
}

/** The options list as the form works with it, whatever shape the API sent. */
export function parseCustomizationOptions(options: string[] | string | null): string[] {
  if (Array.isArray(options)) return options;
  if (!options) return [];
  try {
    const parsed = JSON.parse(options);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    // Older rows stored a plain comma-separated string.
    return options.split(',').map((option) => option.trim()).filter(Boolean);
  }
}

/* ── CSV import / export ───────────────────────────────────────────────── */

/** What a dry run says it would do, before anything is written. */
export interface ImportPlan {
  dryRun: boolean;
  summary: {
    creating: number;
    updating: number;
    variants: number;
    rows: number;
    errors: number;
    missingCategories: string[];
    ignoredColumns: string[];
    knownColumns: string[];
  };
  errors: Array<{ row: number; message: string }>;
  preview: Array<{ sku: string; name: string; action: 'create' | 'update'; variants: number }>;
}

export interface ImportResult {
  created: number;
  updated: number;
  variants: number;
  failures: Array<{ sku: string; message: string }>;
  errors: Array<{ row: number; message: string }>;
}

/**
 * Check a catalogue file, or apply it. `commit` separates "tell me what this
 * would do" from "do it"; the screen always runs the first before the second.
 * The CSV's money columns are rupees, as before.
 */
export async function importCatalog(
  csv: string,
  options: { commit?: boolean; sellerId?: string; createCategories?: boolean } = {}
): Promise<{ message: string; plan?: ImportPlan; result?: ImportResult }> {
  try {
    const { sellerId, ...rest } = options;
    const res = await apiClient.post(
      '/admin/products/import',
      { csv, ...rest, ...(sellerId ? { sellerId } : {}) },
      { timeout: 120000 }
    );
    const data = res.data?.data ?? {};
    return {
      message: res.data?.message ?? '',
      plan: data.dryRun ? (data as ImportPlan) : undefined,
      result: data.dryRun ? undefined : (data as ImportResult),
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not read that file.'));
  }
}

/** Downloads the catalogue as CSV (one seller's, or everyone's), in the importer's shape. */
export async function exportCatalog(sellerId?: string): Promise<void> {
  await downloadFromApi(
    '/admin/products/export',
    sellerId ? `catalogue-${sellerId.slice(0, 8)}.csv` : 'catalogue.csv',
    { sellerId }
  );
}

// ============================================
// Catalogue health and bulk actions
// ============================================

export interface CatalogSummary {
  total: number;
  statuses: Partial<Record<ProductStatus, number>>;
  stock: Record<StockBand, number>;
  lowStockLimit: number;
  pendingReview: number;
  featured: number;
  missingImages: number;
  categories: Array<{
    categoryId: string;
    category: string;
    healthy: number;
    low: number;
    out: number;
    units: number;
  }>;
}

export async function getCatalogSummary(): Promise<CatalogSummary> {
  try {
    const res = await apiClient.get('/admin/products/summary');
    return res.data?.data as CatalogSummary;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the catalogue summary.'));
  }
}

export type BulkAction = 'activate' | 'deactivate' | 'discontinue' | 'feature' | 'unfeature' | 'approve';

/** Apply one action to many products. Returns the server's message. */
export async function bulkUpdateProducts(ids: string[], action: BulkAction): Promise<string> {
  try {
    const res = await apiClient.post('/admin/products/bulk', { ids, action });
    return res.data?.message ?? 'Products updated';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not apply that action.'));
  }
}

/** Set every size of one product (or the product itself, if it has none). */
export async function setAllVariantStock(productId: string, quantity: number): Promise<void> {
  try {
    await apiClient.post(`/admin/products/${encodeURIComponent(productId)}/variants/stock`, {
      quantity,
    });
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update stock.'));
  }
}
