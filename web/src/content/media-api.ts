'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * The staff image library (`/admin/media`, CONTENT or MODERATOR).
 *
 * Uploads are checked and stored by the API as the original file (it no
 * longer re-encodes to webp), named after the hash of their bytes, so the same
 * file uploaded twice returns the existing asset. Each asset's `url` is
 * absolute — it points at the API's public storage — and that is the value a
 * content field stores.
 */

export interface MediaAsset {
  id: string;
  /** Absolute, e.g. "http://localhost:8081/media/ab12….webp". */
  url: string;
  filename: string;
  alt: string | null;
  contentType?: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

const toAsset = (raw: unknown): MediaAsset | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const asset = raw as MediaAsset;
  return typeof asset.url === 'string' && typeof asset.id === 'string' ? asset : null;
};

/** The library, newest first. The API returns at most `limit` (default 60). */
export async function listMedia(limit = 200): Promise<MediaAsset[]> {
  try {
    const res = await apiClient.get('/admin/media', { params: { limit } });
    const raw = res.data?.data?.assets;
    return Array.isArray(raw) ? raw.map(toAsset).filter((a): a is MediaAsset => a !== null) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the image library.'));
  }
}

/** Uploads one image and returns it. Re-uploading the same bytes returns the existing asset. */
export async function uploadMedia(file: File, alt = ''): Promise<MediaAsset> {
  const form = new FormData();
  form.append('file', file);

  try {
    // Content-Type is deliberately unset: the browser has to add the multipart
    // boundary itself (the API client drops its JSON default for FormData).
    const res = await apiClient.post('/admin/media', form, {
      params: alt ? { alt } : undefined,
      timeout: 60000,
    });
    const asset = toAsset(res.data?.data?.asset);
    if (!asset) throw new Error('The server did not return an image.');
    return asset;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Upload failed.'));
  }
}

/** Changes an asset's alt text (empty clears it). */
export async function updateMediaAlt(id: string, alt: string): Promise<MediaAsset> {
  try {
    const res = await apiClient.patch(`/admin/media/${encodeURIComponent(id)}`, {
      alt: alt.trim() || null,
    });
    const asset = toAsset(res.data?.data?.asset);
    if (!asset) throw new Error('The server did not return the image.');
    return asset;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save that alt text.'));
  }
}

/** Permanently removes an asset and its file. */
export async function deleteMedia(id: string): Promise<void> {
  try {
    await apiClient.delete(`/admin/media/${encodeURIComponent(id)}`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not delete that image.'));
  }
}

/** Bytes as something a person reads, for the picker's captions. */
export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
