'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { StoredValue } from './resolve';

/**
 * Admin transport for content values.
 *
 * The editor used to persist to `localStorage`, which made it look like it
 * worked while nothing it saved ever reached the storefront. Every call here
 * goes to the content API, so a save is a real save and a publish is visible
 * to shoppers.
 *
 * `apiClient` attaches the bearer token and redirects on 401, so these calls
 * inherit the same auth handling as the rest of the admin.
 */

export interface ContentStages {
  published: StoredValue[];
  draft: StoredValue[];
}

const toValues = (raw: unknown): StoredValue[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is StoredValue =>
      typeof entry === 'object' && entry !== null && typeof (entry as StoredValue).path === 'string'
  );
};

/** Both stages for a namespace. Admin only. */
export async function fetchStages(namespace: string): Promise<ContentStages> {
  try {
    const res = await apiClient.get(`/admin/content/${encodeURIComponent(namespace)}`);
    const data = res.data?.data ?? {};
    return { published: toValues(data.published), draft: toValues(data.draft) };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load content.'));
  }
}

export interface DraftEntry extends StoredValue {
  /**
   * Mirrors the registry's `field.private`. Only the caller knows it — the
   * registry is a frontend module — and the server relies on it to keep the
   * value off the public read, so it must be sent with every write.
   */
  isPrivate?: boolean;
}

/** Upserts draft values. Returns the draft as the server now holds it. */
export async function saveDraft(
  namespace: string,
  values: DraftEntry[]
): Promise<StoredValue[]> {
  try {
    const res = await apiClient.put(`/admin/content/${encodeURIComponent(namespace)}`, { values });
    return toValues(res.data?.data?.draft);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save the draft.'));
  }
}

export interface PublishResult extends ContentStages {
  /**
   * Whether the storefront dropped its cached copy. False means the values are
   * live but the site may serve the old ones for a while — worth saying out
   * loud, since the admin would otherwise read it as a failed publish.
   */
  revalidated: boolean;
}

/** Promotes the whole draft to published at the next version. */
export async function publishDraft(namespace: string): Promise<PublishResult> {
  try {
    const res = await apiClient.post(`/admin/content/${encodeURIComponent(namespace)}/publish`);
    const data = res.data?.data ?? {};
    return {
      published: toValues(data.published),
      draft: [],
      revalidated: data.revalidated === true,
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not publish.'));
  }
}

/** Throws the draft away, leaving published untouched. */
export async function discardDraft(namespace: string): Promise<void> {
  try {
    await apiClient.delete(`/admin/content/${encodeURIComponent(namespace)}/draft`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not discard the draft.'));
  }
}
