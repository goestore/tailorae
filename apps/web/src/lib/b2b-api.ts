'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { BulkOrderView, CreditView, RfqView } from '@/lib/api/types';

/**
 * The buyer's side of wholesale: business profile, quote requests, bulk
 * orders. Any signed-in shopper can keep a profile (it belongs to the customer
 * account — its id is the customer id) and ask for quotes; the profile starts
 * unverified and wholesale pricing unlocks once our team verifies it. Money is
 * paise throughout.
 */

export type RfqStatus = 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface B2BProfile {
  /** The customer's own id: one profile per account. */
  id: string;
  companyName: string;
  companyRegistration: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  businessType: string;
  businessCategory: string | null;
  monthlyBudgetPaise: number | null;
  employeeCount: number | null;
  businessDescription: string | null;
  website: string | null;
  isVerified: boolean;
  verifiedAt?: string | null;
  minOrderQuantity: number;
  discountTier: string;
  creditLimitPaise?: number;
  creditUsedPaise?: number;
  createdAt: string;
  updatedAt: string;
}

export type B2BProfileInput = Partial<{
  companyName: string;
  businessType: string;
  companyRegistration: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  businessCategory: string | null;
  businessDescription: string | null;
  website: string | null;
  monthlyBudgetPaise: number | null;
  employeeCount: number | null;
}>;

/** A quote request as the API returns it (`RfqView`), status narrowed. */
export type Rfq = Omit<RfqView, 'status'> & {
  id: string;
  rfqNumber: string;
  quantity: number;
  status: RfqStatus;
  createdAt: string;
};

export type BulkOrder = BulkOrderView & {
  id: string;
  orderNumber: string;
  quantity: number;
  status: string;
  createdAt: string;
};

export type B2BCredit = CreditView;

/** The product a quote or bulk order is for. */
export interface B2BProductSummary {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  pricePaise: number;
}

export interface RfqInput {
  productId: string;
  quantity: number;
  companyName?: string;
  /** Per piece, in paise. */
  targetPricePaise?: number;
  deadline?: string;
  description?: string;
}

export async function getMyB2BProfile(): Promise<B2BProfile | null> {
  try {
    const response = await apiClient.get('/b2b/profile');
    return response.data?.data?.profile ?? null;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your business profile.'));
  }
}

/** Create or update. Returns the saved profile and the server's message. */
export async function saveMyB2BProfile(
  input: B2BProfileInput
): Promise<{ profile: B2BProfile; message: string }> {
  try {
    const response = await apiClient.post('/b2b/profile', input);
    return {
      profile: response.data?.data?.profile,
      message: response.data?.message ?? 'Profile saved.',
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save your business profile.'));
  }
}

export async function submitRfq(input: RfqInput): Promise<{ rfq: Rfq; message: string }> {
  try {
    const response = await apiClient.post('/b2b/rfq', input);
    return {
      rfq: response.data?.data?.rfq,
      message: response.data?.message ?? 'Quote request received.',
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not submit your quote request.'));
  }
}

export async function getMyRfqs(): Promise<Rfq[]> {
  try {
    const response = await apiClient.get('/b2b/rfq');
    return response.data?.data?.rfqs ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your quote requests.'));
  }
}

export async function respondToQuote(
  id: string,
  decision: 'accept' | 'reject'
): Promise<{ rfq: Rfq; bulkOrder: BulkOrder | null; message: string }> {
  try {
    const response = await apiClient.patch(`/b2b/rfq/${encodeURIComponent(id)}/respond`, {
      decision,
    });
    return {
      rfq: response.data?.data?.rfq,
      bulkOrder: response.data?.data?.bulkOrder ?? null,
      message: response.data?.message ?? 'Response recorded.',
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record your response.'));
  }
}

export async function getMyBulkOrders(): Promise<BulkOrder[]> {
  try {
    const response = await apiClient.get('/b2b/bulk-orders');
    return response.data?.data?.bulkOrders ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your bulk orders.'));
  }
}

/** The account's trade credit, or null when none has been granted. */
export async function getMyCredit(): Promise<B2BCredit | null> {
  try {
    const response = await apiClient.get('/b2b/credit');
    return response.data?.data?.credit ?? null;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load your credit.'));
  }
}
