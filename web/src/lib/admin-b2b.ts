'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { RfqStatus } from '@/lib/b2b-api';

/**
 * Staff wholesale desk (`/admin/b2b/...`): price quote requests, verify
 * business profiles, move bulk orders along, keep the trade-credit ledger.
 *
 * Permissions: quotes and bulk orders need SUPPORT; verifying a business needs
 * KYC_REVIEW; credit limits and the ledger need FINANCE. Every amount is
 * integer paise. A profile's id is the customer's id, and the account's kind is
 * `user.type` (INDIVIDUAL | BUSINESS) — verifying a profile is what unlocks
 * wholesale pricing.
 */

export interface B2BProductSummary {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  pricePaise: number;
}

export interface B2BUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  /** INDIVIDUAL | BUSINESS */
  type: string;
  status: string;
}

export interface AdminB2BProfileSummary {
  id: string;
  companyName: string;
  businessType: string;
  gstNumber: string | null;
  panNumber: string | null;
  isVerified: boolean;
  user: B2BUser;
}

export interface AdminRfq {
  id: string;
  rfqNumber: string;
  productId: string;
  product: B2BProductSummary | null;
  quantity: number;
  desiredPricePaise: number | null;
  deliveryDate: string | null;
  specialRequirements: string | null;
  status: RfqStatus;
  quotedPricePaise: number | null;
  quotedDate: string | null;
  notes: string | null;
  documents: string[];
  expiryDate: string | null;
  createdAt: string;
  b2bProfile: AdminB2BProfileSummary;
}

export type RfqCounts = Record<RfqStatus, number>;

export interface AdminB2BProfile extends AdminB2BProfileSummary {
  companyRegistration: string | null;
  businessCategory: string | null;
  businessDescription: string | null;
  website: string | null;
  monthlyBudgetPaise: number | null;
  employeeCount: number | null;
  verifiedAt: string | null;
  minOrderQuantity: number;
  discountTier: string;
  creditLimitPaise: number;
  creditUsedPaise: number;
  createdAt: string;
  _count: { rfqs: number; bulkOrders: number };
}

export interface AdminBulkOrder {
  id: string;
  orderNumber: string;
  productId: string;
  product: B2BProductSummary | null;
  rfqId: string | null;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
  status: string;
  expectedDelivery: string | null;
  specialRequirements: string | null;
  paymentTerms: string | null;
  createdAt: string;
  b2bProfile: AdminB2BProfileSummary;
}

export interface CreditTransaction {
  id: string;
  /** CREDIT_ISSUED | PAYMENT_RECEIVED | ADJUSTMENT */
  type: string;
  /** Signed change to the amount owed. */
  amountPaise: number;
  balancePaise: number;
  orderId: string | null;
  description: string | null;
  reference: string | null;
  createdAt: string;
}

export interface CreditLedger {
  creditLimitPaise: number;
  creditUsedPaise: number;
  availablePaise: number;
  transactions: CreditTransaction[];
}

export const CREDIT_TYPES = ['CREDIT_ISSUED', 'PAYMENT_RECEIVED', 'ADJUSTMENT'] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

export const BULK_ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;

export async function getAdminRfqs(
  status: RfqStatus
): Promise<{ rfqs: AdminRfq[]; counts: RfqCounts }> {
  try {
    const response = await apiClient.get('/admin/b2b/rfqs', { params: { status, limit: 100 } });
    const data = response.data?.data;
    return {
      rfqs: data?.rfqs ?? [],
      counts: data?.counts ?? { PENDING: 0, QUOTED: 0, ACCEPTED: 0, REJECTED: 0, EXPIRED: 0 },
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load quote requests.'));
  }
}

/** A quote is a unit price in paise; declining needs a note the buyer reads. */
export type QuoteDecision =
  | { status: 'QUOTED'; quotedPricePaise: number; expiryDate?: string; notes?: string }
  | { status: 'REJECTED'; notes: string };

export async function decideRfq(
  id: string,
  decision: QuoteDecision
): Promise<{ rfq: AdminRfq; message: string }> {
  try {
    const response = await apiClient.patch(`/admin/b2b/rfqs/${encodeURIComponent(id)}`, decision);
    return { rfq: response.data?.data?.rfq, message: response.data?.message ?? 'Saved.' };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save that quote.'));
  }
}

export async function getAdminB2BProfiles(params: {
  verified?: boolean;
  q?: string;
}): Promise<{ profiles: AdminB2BProfile[]; counts: { verified: number; unverified: number } }> {
  try {
    const response = await apiClient.get('/admin/b2b/profiles', {
      params: {
        limit: 100,
        ...(params.verified === undefined ? {} : { verified: String(params.verified) }),
        ...(params.q ? { q: params.q } : {}),
      },
    });
    const data = response.data?.data;
    return {
      profiles: data?.profiles ?? [],
      counts: data?.counts ?? { verified: 0, unverified: 0 },
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load business profiles.'));
  }
}

/** KYC_REVIEW for verification; FINANCE when `creditLimitPaise` is included. */
export async function updateB2BProfile(
  id: string,
  changes: {
    isVerified?: boolean;
    creditLimitPaise?: number;
    minOrderQuantity?: number;
    discountTier?: string;
  }
): Promise<{ profile: AdminB2BProfile; message: string }> {
  try {
    const response = await apiClient.patch(`/admin/b2b/profiles/${encodeURIComponent(id)}`, changes);
    return { profile: response.data?.data?.profile, message: response.data?.message ?? 'Saved.' };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that profile.'));
  }
}

export async function setB2BProfileVerified(
  id: string,
  isVerified: boolean
): Promise<{ profile: AdminB2BProfile; message: string }> {
  return updateB2BProfile(id, { isVerified });
}

export async function getCreditLedger(id: string): Promise<CreditLedger> {
  try {
    const response = await apiClient.get(`/admin/b2b/profiles/${encodeURIComponent(id)}/credit`);
    return response.data?.data?.credit as CreditLedger;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the credit ledger.'));
  }
}

export async function recordCredit(
  id: string,
  entry: {
    type: CreditType;
    amountPaise: number;
    description?: string;
    reference?: string;
  }
): Promise<CreditLedger> {
  try {
    const response = await apiClient.post(
      `/admin/b2b/profiles/${encodeURIComponent(id)}/credit`,
      entry
    );
    return response.data?.data?.credit as CreditLedger;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that entry.'));
  }
}

export async function getAdminBulkOrders(): Promise<AdminBulkOrder[]> {
  try {
    const response = await apiClient.get('/admin/b2b/bulk-orders', { params: { limit: 100 } });
    return response.data?.data?.bulkOrders ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load bulk orders.'));
  }
}

export async function setBulkOrderStatus(
  id: string,
  status: string
): Promise<{ message: string }> {
  try {
    const response = await apiClient.patch(`/admin/b2b/bulk-orders/${encodeURIComponent(id)}`, {
      status,
    });
    return { message: response.data?.message ?? 'Saved.' };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that order.'));
  }
}
