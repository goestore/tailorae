'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * The listing review queue.
 *
 * A seller's new or edited listing waits here until an admin approves it;
 * nothing in the queue is visible to shoppers. Rejecting sends it back to the
 * seller with a note, which is the only guidance they get on what to fix.
 */

export type ModerationStatus = 'PENDING' | 'REJECTED';

export interface ModerationProduct {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  pricePaise: number;
  mrpPaise: number | null;
  quantity: number;
  status: string;
  thumbnail: string | null;
  images: string[];
  shortDescription: string | null;
  description: string | null;
  moderationStatus: string;
  moderationNote: string | null;
  updatedAt: string;
  category: { name: string } | null;
  brand: { id?: string; name: string; isActive?: boolean } | null;
  seller: {
    id: string;
    shopName: string;
    shopSlug: string;
    isVerified: boolean;
    isPlatform?: boolean;
  } | null;
}

export interface ModerationQueue {
  products: ModerationProduct[];
  counts: { pending: number; rejected: number };
}

export async function getModerationQueue(status: ModerationStatus): Promise<ModerationQueue> {
  try {
    const response = await apiClient.get('/admin/moderation/products', { params: { status } });
    const data = response.data?.data;
    return {
      products: data?.products ?? [],
      counts: data?.counts ?? { pending: 0, rejected: 0 },
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the review queue.'));
  }
}

/** Approve or reject one listing. Rejecting requires a note for the seller. */
export async function decideListing(
  id: string,
  decision: 'approve' | 'reject',
  note?: string
): Promise<string> {
  try {
    const response = await apiClient.patch(`/admin/moderation/products/${encodeURIComponent(id)}`, {
      decision,
      ...(note ? { note } : {}),
    });
    return (
      response.data?.message ??
      (decision === 'approve' ? 'Listing approved.' : 'Listing sent back to the seller.')
    );
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that decision.'));
  }
}

/**
 * Pages that decide queue items fire this so the sidebar counts update without
 * waiting for the next navigation.
 */
export const ADMIN_QUEUES_CHANGED = 'admin:queues-changed';

export function announceQueuesChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ADMIN_QUEUES_CHANGED));
}

/** Review queues' sizes (`GET /admin/queues`), for the sidebar badges and the dashboard. */
export interface AdminQueueCounts {
  productsAwaitingModeration: number;
  sellersAwaitingReview: number;
  brandsAwaitingReview: number;
  /** Legacy name the API still sends; same as sellersAwaitingReview. */
  sellersAwaitingKyc: number;
  returnsOpen: number;
  withdrawalsOpen: number;
  paymentAnomalies: number;
}

const QUEUE_KEYS: Array<keyof AdminQueueCounts> = [
  'productsAwaitingModeration',
  'sellersAwaitingReview',
  'brandsAwaitingReview',
  'sellersAwaitingKyc',
  'returnsOpen',
  'withdrawalsOpen',
  'paymentAnomalies',
];

export function toQueueCounts(data: Record<string, unknown> | null | undefined): AdminQueueCounts {
  const counts = {} as AdminQueueCounts;
  for (const key of QUEUE_KEYS) counts[key] = Number(data?.[key]) || 0;
  return counts;
}

export async function getQueueCounts(): Promise<AdminQueueCounts> {
  try {
    const response = await apiClient.get('/admin/queues');
    return toQueueCounts(response.data?.data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load review counts.'));
  }
}
