'use client';

import axios from 'axios';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/api-utils';

/**
 * Seller accounts, from an admin's side.
 *
 * Two ways a shop comes into existence: someone applies at /seller and waits to
 * be approved, or an admin creates it here. Both end at the same record — this
 * module is the second path plus the decisions taken over both.
 */

export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type ApplicationStatus = 'APPLIED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

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
  country?: string;
}

export interface AdminSeller {
  id: string;
  shopName: string;
  shopSlug: string;
  shopDescription: string | null;
  isVerified: boolean;
  isActive: boolean;
  /** Null: no override, so each item's category rate (or the platform default) applies. */
  commissionRate: number | null;
  totalEarnings: number;
  rating: number;
  ratingCount: number;
  createdAt: string;
  /** Identity check. Approving it is what lets the shop itself be verified. */
  kycStatus: KycStatus;
  pan: string | null;
  gstin: string | null;
  /** Stored file names, fetched one at a time through `fetchKycDocument`. */
  kycDocuments: string[];
  kycSubmittedAt: string | null;
  kycReviewedAt: string | null;
  kycRejectionReason: string | null;
  /** The full account number is never in this payload — see `revealBank`. */
  bankAccountLast4: string | null;
  hasBankDetails: boolean;
  /** The business behind the shop, as the seller applied with it. */
  legalName: string | null;
  businessType: BusinessType | null;
  registeredAddress: RegisteredAddress | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** The owner's decision; only APPROVED shops may list products. */
  applicationStatus: ApplicationStatus;
  applicationNote: string | null;
  applicationReviewedAt: string | null;
  /** Brands the shop registered, with their review state. */
  brands: Array<{
    id: string;
    name: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    authorizationType: string | null;
    authorizationDoc: string | null;
  }>;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
  } | null;
  _count: { products: number; sellerOrders: number };
}

export interface NewSellerInput {
  email: string;
  shopName: string;
  firstName?: string;
  lastName?: string;
  shopDescription?: string;
  /** Null or omitted: no override. */
  commissionRate?: number | null;
  isVerified?: boolean;
  legalName?: string;
  businessType?: BusinessType;
  registeredAddress?: RegisteredAddress;
  contactPhone?: string;
  contactEmail?: string;
}

export async function getSellers(): Promise<AdminSeller[]> {
  try {
    const response = await apiClient.get('/admin/vendors');
    return response.data?.data?.vendors ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load sellers.'));
  }
}

/**
 * Create a seller.
 *
 * `temporaryPassword` comes back only when a brand-new login was created, and
 * only on this one response — it is hashed on the way in and cannot be read
 * back afterwards, so it has to be handed over now or reset later.
 */
export async function createSeller(input: NewSellerInput): Promise<{
  message: string;
  temporaryPassword: string | null;
  seller: AdminSeller;
}> {
  try {
    const response = await apiClient.post('/admin/vendors', input);
    return {
      message: response.data?.message ?? 'Seller created.',
      temporaryPassword: response.data?.data?.temporaryPassword ?? null,
      seller: response.data?.data?.vendor,
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create that seller.'));
  }
}

/**
 * Raised when the server refuses to verify a shop whose identity check has not
 * been approved. Carries the server's own wording so the screen can show it,
 * and lets the caller offer the explicit override instead of failing quietly.
 */
export class KycRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KycRequiredError';
  }
}

/**
 * Change a shop's standing or its commission.
 *
 * Verifying a shop is refused (409) until its identity check is approved;
 * `overrideKyc` is the deliberate escape hatch for that rule.
 */
export async function updateSeller(
  id: string,
  input: Partial<Pick<AdminSeller, 'isVerified' | 'isActive' | 'commissionRate' | 'shopName'>> & {
    overrideKyc?: boolean;
  }
): Promise<AdminSeller> {
  try {
    const response = await apiClient.put(`/admin/vendors/${encodeURIComponent(id)}`, input);
    return response.data?.data?.vendor;
  } catch (error) {
    const message = getApiErrorMessage(error, 'Could not update that seller.');
    if (getApiErrorStatus(error) === 409 && input.isVerified === true) {
      throw new KycRequiredError(message);
    }
    throw new Error(message);
  }
}

export interface KycDecisionResult {
  message: string;
  vendor: {
    id: string;
    shopName: string;
    kycStatus: KycStatus;
    isVerified: boolean;
    kycRejectionReason: string | null;
  };
}

/**
 * Approve or reject a seller's identity check.
 *
 * Approving also verifies the shop. Rejecting needs a reason — the seller is
 * shown it, and it is the only guidance they get on what to resubmit.
 */
export async function decideKyc(
  id: string,
  decision: 'approve' | 'reject',
  reason?: string
): Promise<KycDecisionResult> {
  try {
    const response = await apiClient.patch(`/admin/vendors/${encodeURIComponent(id)}/kyc`, {
      decision,
      ...(reason ? { reason } : {}),
    });
    return {
      message:
        response.data?.message ??
        (decision === 'approve' ? 'Identity approved.' : 'Identity check rejected.'),
      vendor: response.data?.data?.vendor,
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that decision.'));
  }
}

export interface RevealedBank {
  shopName: string;
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
}

/**
 * The full bank account, on an explicit request only.
 *
 * Every call is written to the audit log against the admin who made it, so
 * this is never prefetched and the result is never cached — the caller holds
 * it in component state and drops it when hidden.
 */
export async function revealBank(id: string): Promise<RevealedBank> {
  try {
    const response = await apiClient.get(`/admin/vendors/${encodeURIComponent(id)}/bank`, {
      headers: { 'Cache-Control': 'no-store' },
    });
    return response.data?.data?.bank;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load bank details.'));
  }
}

/**
 * One identity document, as a Blob.
 *
 * Fetched through the API client because the route needs the admin's bearer
 * token — a plain link would arrive unauthenticated. The caller turns it into
 * an object URL and must revoke it when done.
 */
export async function fetchKycDocument(id: string, name: string): Promise<Blob> {
  try {
    const response = await apiClient.get(
      `/admin/vendors/${encodeURIComponent(id)}/kyc/documents/${encodeURIComponent(name)}`,
      { responseType: 'blob', timeout: 30000 }
    );
    return response.data as Blob;
  } catch (error) {
    // A blob response hides the JSON error envelope; read it back out.
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      try {
        const body = JSON.parse(await error.response.data.text()) as { message?: string };
        if (body.message) throw new Error(body.message);
      } catch (parsed) {
        if (parsed instanceof Error && !(parsed instanceof SyntaxError)) throw parsed;
      }
    }
    throw new Error(getApiErrorMessage(error, 'Could not open that document.'));
  }
}

/**
 * Decide a seller application.
 *
 * Rejecting or suspending needs a note, which the seller reads on their
 * dashboard. Approving needs the identity check approved first; the server
 * answers 409 otherwise, surfaced as `KycRequiredError` so the screen can offer
 * the explicit override.
 */
export async function decideApplication(
  id: string,
  input: { status: Exclude<ApplicationStatus, 'APPLIED'>; note?: string; overrideKyc?: boolean }
): Promise<string> {
  try {
    const response = await apiClient.patch(
      `/admin/vendors/${encodeURIComponent(id)}/application`,
      input
    );
    return response.data?.message ?? 'Decision recorded.';
  } catch (error) {
    const message = getApiErrorMessage(error, 'Could not record that decision.');
    if (getApiErrorStatus(error) === 409 && input.status === 'APPROVED') {
      throw new KycRequiredError(message);
    }
    throw new Error(message);
  }
}

/** A brand's trademark certificate or reseller letter, as a Blob (private, behind auth). */
export async function fetchBrandAuthorizationDoc(brandId: string): Promise<Blob> {
  try {
    const response = await apiClient.get(
      `/admin/brands/${encodeURIComponent(brandId)}/authorization-doc`,
      { responseType: 'blob', timeout: 30000 }
    );
    return response.data as Blob;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not open that document.'));
  }
}

/** Approve or reject a seller-registered brand. Rejecting needs a reason. */
export async function reviewBrand(
  brandId: string,
  decision: 'approve' | 'reject',
  reason?: string
): Promise<string> {
  try {
    const response = await apiClient.patch(`/admin/brands/${encodeURIComponent(brandId)}/review`, {
      decision,
      ...(reason ? { reason } : {}),
    });
    return response.data?.message ?? 'Decision recorded.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that decision.'));
  }
}
