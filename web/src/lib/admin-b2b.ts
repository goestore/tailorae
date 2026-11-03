'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { B2BProductSummary, RfqStatus } from '@/lib/b2b-api';

/**
 * Admin wholesale desk: price quote requests, verify business profiles, move
 * bulk orders along. Verifying a profile is what grants the B2B_BUYER role.
 */

export interface AdminB2BProfileSummary {
  id: string;
  companyName: string;
  businessType: string;
  gstNumber: string | null;
  panNumber: string | null;
  isVerified: boolean;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    role: string;
  };
}

export interface AdminRfq {
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
  b2bProfile: AdminB2BProfileSummary;
}

export type RfqCounts = Record<RfqStatus, number>;

export interface AdminB2BProfile extends AdminB2BProfileSummary {
  companyRegistration: string | null;
  businessCategory: string | null;
  businessDescription: string | null;
  website: string | null;
  createdAt: string;
  user: AdminB2BProfileSummary['user'] & { status: string };
  _count: { rfqs: number; bulkOrders: number };
}

export interface AdminBulkOrder {
  id: string;
  orderNumber: string;
  productId: string;
  product: B2BProductSummary | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  expectedDelivery: string | null;
  createdAt: string;
  b2bProfile: AdminB2BProfileSummary;
}

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

export type QuoteDecision =
  | { status: 'QUOTED'; quotedPrice: number; expiryDate?: string; notes?: string }
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

export async function setB2BProfileVerified(
  id: string,
  isVerified: boolean
): Promise<{ profile: AdminB2BProfile; message: string }> {
  try {
    const response = await apiClient.patch(`/admin/b2b/profiles/${encodeURIComponent(id)}`, {
      isVerified,
    });
    return { profile: response.data?.data?.profile, message: response.data?.message ?? 'Saved.' };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that profile.'));
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
