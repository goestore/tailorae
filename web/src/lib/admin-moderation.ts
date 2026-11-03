'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { KycStatus } from '@/lib/admin-sellers';

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
  price: number;
  originalPrice: number | null;
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
  vendor: {
    id: string;
    shopName: string;
    shopSlug: string;
    isVerified: boolean;
    kycStatus: KycStatus;
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

export interface AdminQueueCounts {
  productsAwaitingModeration: number;
  sellersAwaitingKyc: number;
}

/** The two review queues' sizes, for the sidebar and the dashboard. */
export async function getQueueCounts(): Promise<AdminQueueCounts> {
  try {
    const response = await apiClient.get('/admin/reports');
    const data = response.data?.data ?? {};
    return {
      productsAwaitingModeration: Number(data.productsAwaitingModeration) || 0,
      sellersAwaitingKyc: Number(data.sellersAwaitingKyc) || 0,
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load review counts.'));
  }
}
