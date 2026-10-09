'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Brands.
 *
 * Until now a brand could only enter the system as a side effect of a sheet
 * import — the console offered an active/inactive toggle and nothing else,
 * while create, update and delete sat unused in the backend. A brand has its
 * own storefront page, so naming one is merchandising, not data entry, and it
 * belongs in the console.
 *
 * Removal is a request, not a promise: the backend deactivates instead of
 * deleting when products still carry the brand, because the relation nulls on
 * delete and a real delete would silently strip the label off every one of
 * them. The message it returns says which happened — show it rather than
 * guessing.
 */

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  isFeatured: boolean;
  isActive: boolean;
  displayOrder: number;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
  /** Seller-registered brands start PENDING; platform brands are APPROVED. */
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Private file name of the trademark certificate or reseller letter, if any. */
  authorizationDoc?: string | null;
  authorizationType?: 'TRADEMARK_OWNER' | 'AUTHORISED_RESELLER' | null;
  rejectionReason?: string | null;
  /** The shop that registered it; null for platform brands. */
  ownerVendor?: { id: string; shopName: string; applicationStatus: string } | null;
}

/** Everything the form can send. Omitted keys are left untouched by the server. */
export interface BrandInput {
  name?: string;
  slug?: string;
  description?: string | null;
  logo?: string | null;
  banner?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}

export async function getBrands(): Promise<AdminBrand[]> {
  try {
    const response = await apiClient.get('/admin/brands');
    return response.data?.data?.brands ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load brands.'));
  }
}

/**
 * Create a brand.
 *
 * The slug is left off deliberately when the admin did not type one: the
 * server derives it from the name, so adding a brand is just typing its name.
 */
export async function createBrand(input: BrandInput): Promise<AdminBrand> {
  try {
    const response = await apiClient.post('/admin/brands', input);
    return response.data?.data?.brand;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create that brand.'));
  }
}

export async function updateBrand(id: string, input: BrandInput): Promise<AdminBrand> {
  try {
    const response = await apiClient.put(`/admin/brands/${encodeURIComponent(id)}`, input);
    return response.data?.data?.brand;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that brand.'));
  }
}

/** Returns the server's own wording, which says whether it deleted or deactivated. */
export async function deleteBrand(id: string): Promise<string> {
  try {
    const response = await apiClient.delete(`/admin/brands/${encodeURIComponent(id)}`);
    return response.data?.message ?? 'Brand removed.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not remove that brand.'));
  }
}
