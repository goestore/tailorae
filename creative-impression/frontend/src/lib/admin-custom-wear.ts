'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Custom Wear quote requests, for the admin console.
 *
 * Custom garments are priced by a person: each request is worked from NEW
 * through CONTACTED and QUOTED to WON or LOST, with the quoted price and
 * private notes kept on the request.
 */

export const QUOTE_STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'] as const;
export type AdminQuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<AdminQuoteStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUOTED: 'Quoted',
  WON: 'Won',
  LOST: 'Lost',
};

export interface AdminCustomWearQuote {
  id: string;
  reference: string;
  userId: string | null;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  colorName: string | null;
  sizes: string[];
  quantity: number;
  method: string | null;
  locations: string[];
  designFiles: string[];
  notes: string | null;
  customerName: string;
  company: string | null;
  email: string;
  phone: string | null;
  country: string;
  postcode: string | null;
  requiredBy: string | null;
  status: AdminQuoteStatus;
  quotedPrice: number | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type QuoteCounts = Record<AdminQuoteStatus | 'ALL', number>;

export interface QuoteListResult {
  quotes: AdminCustomWearQuote[];
  counts: QuoteCounts;
  pagination: { page: number; limit: number; total: number; pages: number };
}

export async function listCustomWearQuotes(params: {
  status?: AdminQuoteStatus | 'ALL';
  search?: string;
  page?: number;
}): Promise<QuoteListResult> {
  try {
    const response = await apiClient.get('/admin/custom-wear/quotes', {
      params: {
        status: params.status && params.status !== 'ALL' ? params.status : undefined,
        search: params.search?.trim() || undefined,
        page: params.page ?? 1,
        limit: 50,
      },
    });
    return response.data.data as QuoteListResult;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load quote requests.'));
  }
}

export async function getCustomWearQuote(id: string): Promise<AdminCustomWearQuote> {
  try {
    const response = await apiClient.get(`/admin/custom-wear/quotes/${encodeURIComponent(id)}`);
    return response.data.data.quote as AdminCustomWearQuote;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that quote.'));
  }
}

export async function updateCustomWearQuote(
  id: string,
  patch: { status?: AdminQuoteStatus; quotedPrice?: number | null; adminNotes?: string | null }
): Promise<AdminCustomWearQuote> {
  try {
    const response = await apiClient.patch(
      `/admin/custom-wear/quotes/${encodeURIComponent(id)}`,
      patch
    );
    return response.data.data.quote as AdminCustomWearQuote;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that quote.'));
  }
}
