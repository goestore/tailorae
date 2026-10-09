'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * The buyer's side of wholesale: business profile, quote requests, bulk
 * orders. Any signed-in account can keep a profile and ask for quotes; the
 * profile starts unverified and wholesale pricing unlocks once our team
 * verifies it.
 */

export type RfqStatus = 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface B2BProfile {
  id: string;
  companyName: string;
  companyRegistration: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  businessType: string;
  businessCategory: string | null;
  monthlyBudget: number | null;
  employeeCount: number | null;
  businessDescription: string | null;
  website: string | null;
  isVerified: boolean;
  minOrderQuantity: number;
  discountTier: string;
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
  monthlyBudget: number | null;
  employeeCount: number | null;
}>;

export interface B2BProductSummary {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  price: number;
}

export interface Rfq {
  id: string;
  rfqNumber: string;
  productId: string;
  product: B2BProductSummary | null;
  quantity: number;
  desiredPrice: number | null;
  deliveryDate: string | null;
  specialRequirements: string | null;
  status: RfqStatus;
  quotedPrice: number | null;
  quotedDate: string | null;
  notes: string | null;
  expiryDate: string | null;
  createdAt: string;
}

export interface BulkOrder {
  id: string;
  orderNumber: string;
  productId: string;
  product: B2BProductSummary | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  expectedDelivery: string | null;
  specialRequirements: string | null;
  paymentTerms: string | null;
  createdAt: string;
}

export interface RfqInput {
  productId: string;
  quantity: number;
  companyName?: string;
  targetPrice?: number;
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
    // Changing company identity on a verified profile changes the role; the
    // API reissues a token for that, same as becoming a seller.
    const token: string | undefined = response.data?.data?.token ?? undefined;
    if (token) localStorage.setItem('token', token);
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
