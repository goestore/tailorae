'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

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
  _count?: { products: number };
}

export interface AdminProduct {
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
  createdAt: string;
  updatedAt: string;
}

export interface ProductPage {
  products: AdminProduct[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** The fields the create/update endpoints accept. */
export interface ProductInput {
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
  images?: string[];
  color?: string;
  material?: string;
  isFeatured?: boolean;
  isCustomizable?: boolean;
  allowBulkOrders?: boolean;
}

export async function listProducts(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<ProductPage> {
  try {
    const res = await apiClient.get('/admin/products', { params });
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

export async function createCategory(input: {
  name: string;
  slug: string;
}): Promise<AdminCategory> {
  try {
    const res = await apiClient.post('/admin/categories', input);
    return res.data?.data?.category as AdminCategory;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create the category.'));
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
