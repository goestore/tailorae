'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { ListingFields, VariantListingFields } from '@/lib/catalogue-api';

/**
 * Admin catalog client.
 *
 * The backend already had full product CRUD under `/api/admin/products`; what
 * was missing was any way to reach it. This is that way — one typed module so
 * the pages never hand-roll a URL or an auth header, and one place to fix if
 * the contract moves.
 */

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'DISCONTINUED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  parentId?: string | null;
  displayOrder?: number;
  image?: string | null;
  description?: string | null;
  /** The category's own template key; children inherit it when unset. */
  listingTemplate?: string | null;
  /** Own template, else the nearest parent's. */
  resolvedTemplate?: string | null;
  family?: 'apparel' | 'general' | null;
  /** Commission % for items in this category; children inherit when unset. */
  commissionRate?: number | null;
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
  commissionRate: number | null;
  showOnHome?: boolean;
  homeOrder?: number;
}

export interface AdminProduct extends ListingFields {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  shortDescription: string | null;
  price: number;
  originalPrice: number | null;
  costPrice: number | null;
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
  /** Null is house stock — the platform's own listing, owing no commission. */
  vendorId?: string | null;
  vendor?: { id: string; shopName: string; shopSlug: string } | null;
  sizeGuide: string | null;
  videoUrl: string | null;
  barcode: string | null;
  weight: number | null;
  dimensions: string | null;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  thumbnail?: string | null;
  moderationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  customizations?: ProductCustomizationRow[];
  bulkPricings?: BulkPricingRow[];
  createdAt: string;
  updatedAt: string;
}

/**
 * One personalisation the shopper fills in — a name to embroider, a print
 * position to choose. `additionalCost` is added to the price on the product
 * page as options are picked.
 */
export interface ProductCustomizationRow {
  id?: string;
  name: string;
  type: 'text' | 'color' | 'image' | 'embroidery';
  isRequired: boolean;
  /** Stored as a JSON string on the model; a list everywhere else. */
  options: string[] | string | null;
  additionalCost: number;
  maxCharacters: number | null;
}

/** A quantity band and what it costs. `price` is derived server-side. */
export interface BulkPricingRow {
  id?: string;
  minQty: number;
  maxQty: number | null;
  discount: number;
  price?: number;
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
  _count?: { products: number };
}

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

/** The fields the create/update endpoints accept. */
export interface ProductInput extends ListingFields {
  name: string;
  /** Empty string clears the brand; the API maps it to null. */
  brandId?: string;
  slug: string;
  sku: string;
  categoryId: string;
  price: number;
  originalPrice?: number | null;
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
  /** Empty string means house stock; the API maps it to null. */
  vendorId?: string;
  costPrice?: number | null;
  discountPercentage?: number;
  sizeGuide?: string;
  videoUrl?: string;
  barcode?: string;
  weight?: number | null;
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
  moderationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  thumbnail?: string | null;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    size: string | null;
    color: string | null;
    quantity: number;
    price: number | null;
  }>;
}

export interface ProductListParams {
  search?: string;
  page?: number;
  limit?: number;
  status?: string;
  categoryId?: string;
  stock?: StockBand | '';
  moderation?: string;
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
      products: Array.isArray(data.products) ? data.products : [],
      pagination: data.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load products.'));
  }
}

export async function getProduct(id: string): Promise<AdminProduct> {
  try {
    // The admin list has no by-id route, but the public one resolves an id or a
    // slug and returns the same row.
    const res = await apiClient.get(`/products/${encodeURIComponent(id)}`);
    const product = res.data?.data?.product;
    if (!product) throw new Error('That product no longer exists.');
    return product as AdminProduct;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that product.'));
  }
}

export async function createProduct(input: ProductInput): Promise<AdminProduct> {
  try {
    const res = await apiClient.post('/admin/products', input);
    return res.data?.data?.product as AdminProduct;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create the product.'));
  }
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>
): Promise<AdminProduct> {
  try {
    const res = await apiClient.put(`/admin/products/${encodeURIComponent(id)}`, input);
    return res.data?.data?.product as AdminProduct;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save the product.'));
  }
}

/**
 * Discontinues a product.
 *
 * The endpoint is a DELETE but the row survives — it is set to DISCONTINUED,
 * which takes it out of the shop while leaving it in the catalog and in the
 * orders that reference it. Named for what it does rather than for its verb,
 * so no caller promises a customer their history is being erased.
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

/**
 * Turns a product name into a URL-safe slug.
 *
 * Slug and SKU are required by the API but are plumbing, not decisions — an
 * admin adding a product should not have to invent either. Both are derived
 * here and stay editable, which is what keeps "add a product" to a name, a
 * price and a category.
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
 * A SKU derived from the name plus a short random tail.
 *
 * The tail matters: SKU is unique, and two products called "Blue Polo" would
 * otherwise collide on save with an error the admin cannot act on.
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

export const formatMoney = (value: number): string => `₹${value.toLocaleString('en-IN')}`;

// ============================================
// Variants — one size of one colour
// ============================================

export interface AdminVariant extends VariantListingFields {
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

/** The fields the variant endpoints accept. */
export interface VariantInput extends VariantListingFields {
  name?: string;
  sku: string;
  size?: string | null;
  color?: string | null;
  price?: number | null;
  quantity?: number;
  images?: string[];
}

export async function listVariants(productId: string): Promise<AdminVariant[]> {
  try {
    const res = await apiClient.get(`/admin/products/${encodeURIComponent(productId)}/variants`);
    return (res.data?.data?.variants ?? []) as AdminVariant[];
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
      input
    );
    return res.data?.data?.variant as AdminVariant;
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
      input
    );
    return res.data?.data?.variant as AdminVariant;
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

/**
 * The shops a product can be attributed to.
 *
 * Every shop, not only the approved ones — a listing is often prepared while
 * the seller's application is still being reviewed.
 */
export interface SellerOption {
  id: string;
  shopName: string;
  isVerified: boolean;
  isActive: boolean;
}

export async function listSellerOptions(): Promise<SellerOption[]> {
  try {
    const res = await apiClient.get('/admin/vendors');
    return (res.data?.data?.vendors ?? []).map(
      (vendor: { id: string; shopName: string; isVerified: boolean; isActive: boolean }) => ({
        id: vendor.id,
        shopName: vendor.shopName,
        isVerified: vendor.isVerified,
        isActive: vendor.isActive,
      })
    );
  } catch {
    // A missing seller list must not block editing; the picker falls back to
    // house stock only.
    return [];
  }
}

/**
 * Replace a product's personalisation options.
 *
 * Sent as a whole list rather than row by row: it is an ordered set the shopper
 * reads top to bottom, and the API turns `isCustomizable` on or off to match, so
 * the flag and the options can never disagree.
 */
export async function saveCustomizations(
  productId: string,
  customizations: ProductCustomizationRow[],
  /** A seller saves through the shop's own route, which checks ownership. */
  as: 'admin' | 'seller' = 'admin'
): Promise<ProductCustomizationRow[]> {
  try {
    const base = as === 'admin' ? '/admin/products' : '/products';
    const res = await apiClient.put(`${base}/${encodeURIComponent(productId)}/customizations`, {
      customizations,
    });
    return res.data?.data?.customizations ?? [];
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
      { tiers }
    );
    return res.data?.data?.bulkPricings ?? [];
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
 * Check a catalogue file, or apply it.
 *
 * The same endpoint does both; `commit` is what separates "tell me what this
 * would do" from "do it". The screen always runs the first before offering the
 * second, because a seller's whole catalogue arriving at once is the worst
 * possible time to discover a column was misread.
 */
export async function importCatalog(
  csv: string,
  options: { commit?: boolean; vendorId?: string; createCategories?: boolean } = {}
): Promise<{ message: string; plan?: ImportPlan; result?: ImportResult }> {
  try {
    const res = await apiClient.post('/admin/products/import', { csv, ...options });
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

/** The catalogue as CSV text, in the shape the importer reads back. */
export async function exportCatalog(vendorId?: string): Promise<string> {
  try {
    const res = await apiClient.get('/admin/products/export', {
      params: vendorId ? { vendorId } : undefined,
      responseType: 'text',
    });
    return String(res.data ?? '');
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not export the catalogue.'));
  }
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
