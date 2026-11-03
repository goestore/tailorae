'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { StoredValue } from './resolve';

/**
 * Admin transport for content values (`/admin/content/{namespace}`, CONTENT).
 *
 * Every call goes to the content API, so a save is a real save and a publish
 * is visible to shoppers. The staff session is an httpOnly cookie; the API
 * client refreshes it on a 401 and sends the reader to the staff sign-in page
 * when it has ended.
 *
 * The API's draft write is an upsert of the paths it is sent, and refuses an
 * empty list. The editor's model is "the draft is exactly the fields the form
 * has moved off the live value", so `saveDraft` replaces: it throws the old
 * draft away and writes the new one.
 */

export interface ContentStages {
  published: StoredValue[];
  draft: StoredValue[];
}

const toValues = (raw: unknown): StoredValue[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is StoredValue =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StoredValue).path === 'string'
    )
    .map((entry) => ({ path: entry.path, value: entry.value }));
};

const ns = (namespace: string) => `/admin/content/${encodeURIComponent(namespace)}`;

/** Both stages for a namespace. */
export async function fetchStages(namespace: string): Promise<ContentStages> {
  try {
    const res = await apiClient.get(ns(namespace));
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

/** The API takes at most this many values per write. */
const MAX_VALUES_PER_WRITE = 200;

/**
 * Replaces the draft with `values`. Returns the draft as the server now holds
 * it — empty when `values` is (the form matches what is published).
 */
export async function saveDraft(namespace: string, values: DraftEntry[]): Promise<StoredValue[]> {
  try {
    await apiClient.delete(`${ns(namespace)}/draft`);
    let draft: StoredValue[] = [];
    for (let start = 0; start < values.length; start += MAX_VALUES_PER_WRITE) {
      const res = await apiClient.put(ns(namespace), {
        values: values.slice(start, start + MAX_VALUES_PER_WRITE),
      });
      draft = toValues(res.data?.data?.draft);
    }
    return draft;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save the draft.'));
  }
}

export interface PublishResult extends ContentStages {
  /** The namespace's version after this publish. */
  version: number;
  /**
   * Whether the API is configured to tell the storefront to drop its cached
   * copy. False means the values are live but the site may serve the old ones
   * for a while — worth saying out loud, since the admin would otherwise read
   * it as a failed publish.
   */
  revalidated: boolean;
}

/** Promotes the whole draft to published at the next version. */
export async function publishDraft(namespace: string): Promise<PublishResult> {
  try {
    const res = await apiClient.post(`${ns(namespace)}/publish`);
    const data = res.data?.data ?? {};
    return {
      published: toValues(data.published),
      draft: [],
      version: Number(data.version) || 0,
      revalidated: data.revalidated === true,
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not publish.'));
  }
}

/** Throws the draft away, leaving published untouched. */
export async function discardDraft(namespace: string): Promise<void> {
  try {
    await apiClient.delete(`${ns(namespace)}/draft`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not discard the draft.'));
  }
}

export interface PublishSnapshot {
  version: number;
  values: StoredValue[];
}

export interface PublishHistoryEntry {
  publishedAt: string;
  publishedById: string | null;
  /** What was live before this publish (null for the first one). */
  before: PublishSnapshot | null;
  after: PublishSnapshot | null;
}

/**
 * Each publish of a namespace with the values before and after it, newest
 * first. Restoring one is "save `before.values` as the draft, then publish".
 */
export async function fetchHistory(namespace: string, limit = 20): Promise<PublishHistoryEntry[]> {
  try {
    const res = await apiClient.get(`${ns(namespace)}/history`, { params: { limit } });
    const raw = res.data?.data?.publishes;
    if (!Array.isArray(raw)) return [];
    return raw.map((entry: Record<string, unknown>) => {
      const snapshot = (value: unknown): PublishSnapshot | null =>
        value && typeof value === 'object'
          ? {
              version: Number((value as PublishSnapshot).version) || 0,
              values: toValues((value as PublishSnapshot).values),
            }
          : null;
      return {
        publishedAt: String(entry.publishedAt ?? ''),
        publishedById: (entry.publishedById as string | null) ?? null,
        before: snapshot(entry.before),
        after: snapshot(entry.after),
      };
    });
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the publish history.'));
  }
}
