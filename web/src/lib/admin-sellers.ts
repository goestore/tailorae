'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { Page } from '@/lib/api/types';

/**
 * Seller businesses, from the staff side (`/admin/sellers`).
 *
 * A seller registers their own account, fills in the business, KYC documents
 * and bank, and submits (docs/ACCOUNTS.md). Staff move the application through
 * one state machine on `shop.status`:
 *
 *   DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED ⇄ SUSPENDED
 *                     ↘ REJECTED       ↖ NEEDS_INFO (back to the seller)
 *
 * The list is open to KYC_REVIEW, SUPPORT and FINANCE; the review (documents,
 * bank, history) and every decision need KYC_REVIEW; commission needs FINANCE.
 */

export const SELLER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_INFO',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;

export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const SELLER_STATUS_LABEL: Record<SellerStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_INFO: 'Needs info',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

export type SellerAction =
  'SUBMIT' | 'START_REVIEW' | 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND' | 'REINSTATE';

/** Decisions the seller reads a note on; the API refuses them without one. */
export const ACTIONS_NEEDING_NOTE: SellerAction[] = ['REJECT', 'REQUEST_INFO', 'SUSPEND'];

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

export interface PostalAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface AdminShop {
  id: string;
  shopName: string;
  shopSlug: string;
  legalName: string | null;
  businessType: BusinessType | null;
  pan: string | null;
  gstin: string | null;
  registeredAddress: PostalAddress | null;
  pickupAddress: PostalAddress | null;
  contactPhone: string | null;
  contactEmail: string | null;
  shopDescription: string | null;
  shopImage: string | null;
  shopBanner: string | null;
  status: SellerStatus;
  /** The note sent with the last decision (rejection reason, what to fix…). */
  statusNote: string | null;
  /** Null: no override, so each item's category rate (or the platform default) applies. */
  commissionRateBp: number | null;
  lowStockThreshold: number;
  rating: number;
  ratingCount: number;
  isPlatform: boolean;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  canSell: boolean;
}

export type KycDocumentKind =
  'PAN' | 'GST_CERTIFICATE' | 'ADDRESS_PROOF' | 'CANCELLED_CHEQUE' | 'OTHER';

export const KYC_KIND_LABEL: Record<KycDocumentKind, string> = {
  PAN: 'PAN card',
  GST_CERTIFICATE: 'GST certificate',
  ADDRESS_PROOF: 'Address proof',
  CANCELLED_CHEQUE: 'Cancelled cheque',
  OTHER: 'Other document',
};

export interface ReviewDocument {
  document: {
    id: string;
    kind: KycDocumentKind;
    filename: string;
    contentType: string;
    bytes: number;
    createdAt: string;
  };
  /** A signed link, valid for five minutes from when the review was loaded. */
  url: string;
}

export interface SellerReview {
  shop: AdminShop;
  owner: {
    accountId: string;
    fullName: string;
    email: string;
    role: string;
    since: string;
  } | null;
  documents: ReviewDocument[];
  /** Masked: the full account number never reaches the browser. */
  bank: {
    accountName: string;
    accountNumberMasked: string;
    ifsc: string;
    bankName: string | null;
    verified: boolean;
    updatedAt: string;
  } | null;
  history: Array<{
    fromStatus: SellerStatus | null;
    toStatus: SellerStatus;
    note: string | null;
    actorRealm: string;
    createdAt: string;
  }>;
  /** The decisions the state machine allows from the current status. */
  allowedActions: SellerAction[];
}

export async function getSellers(params: {
  status?: SellerStatus | '';
  q?: string;
  page?: number;
  limit?: number;
}): Promise<Page<AdminShop>> {
  try {
    const response = await apiClient.get('/admin/sellers', {
      params: {
        page: params.page ?? 1,
        limit: params.limit ?? 25,
        ...(params.status ? { status: params.status } : {}),
        ...(params.q ? { q: params.q } : {}),
      },
    });
    return response.data?.data as Page<AdminShop>;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load sellers.'));
  }
}

/** The full application (KYC_REVIEW): business, owner, documents, bank, history. */
export async function getSellerReview(id: string): Promise<SellerReview> {
  try {
    const response = await apiClient.get(`/admin/sellers/${encodeURIComponent(id)}`);
    const data = response.data?.data as SellerReview;
    return {
      ...data,
      documents: data?.documents ?? [],
      history: data?.history ?? [],
      allowedActions: data?.allowedActions ?? [],
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that seller.'));
  }
}

/** Move the application along (KYC_REVIEW). REJECT, REQUEST_INFO and SUSPEND need a note. */
export async function decideSeller(
  id: string,
  action: SellerAction,
  note?: string
): Promise<{ message: string; shop: AdminShop }> {
  try {
    const response = await apiClient.post(`/admin/sellers/${encodeURIComponent(id)}/decision`, {
      action,
      ...(note ? { note } : {}),
    });
    return {
      message: response.data?.message ?? 'Decision saved.',
      shop: response.data?.data as AdminShop,
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that decision.'));
  }
}

/**
 * The shop's own commission (FINANCE), in basis points; null removes the
 * override so category rates apply. Orders already placed keep their rate.
 */
export async function setSellerCommission(id: string, rateBp: number | null): Promise<AdminShop> {
  try {
    const response = await apiClient.put(`/admin/sellers/${encodeURIComponent(id)}/commission`, {
      rateBp,
    });
    return response.data?.data as AdminShop;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save that commission.'));
  }
}

/** Open or close public seller sign-ups (KYC_REVIEW). */
export async function setApplicationsOpen(open: boolean): Promise<string> {
  try {
    const response = await apiClient.put('/admin/sellers/applications-open', { open });
    return (
      response.data?.message ?? (open ? 'Seller sign-ups are open.' : 'Seller sign-ups are closed.')
    );
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not change seller sign-ups.'));
  }
}

/** One shop's request to sell under a brand (`GET /admin/brands/authorizations`). */
export interface BrandAuthorization {
  brand: { id: string; name: string; slug: string; status: string };
  seller: { id: string; shopName: string; shopSlug: string; status: string };
  authorizationType: 'TRADEMARK_OWNER' | 'AUTHORISED_RESELLER' | string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  hasDocument: boolean;
  createdAt: string;
  decidedAt: string | null;
}

/** Every brand request one shop has made, in any state (MODERATOR). */
export async function getShopBrandAuthorizations(sellerId: string): Promise<BrandAuthorization[]> {
  try {
    const lists = await Promise.all(
      (['PENDING', 'APPROVED', 'REJECTED'] as const).map((status) =>
        apiClient
          .get('/admin/brands/authorizations', { params: { status } })
          .then((response) => (response.data?.data?.authorizations ?? []) as BrandAuthorization[])
      )
    );
    return lists.flat().filter((row) => row.seller?.id === sellerId);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that shop’s brands.'));
  }
}
