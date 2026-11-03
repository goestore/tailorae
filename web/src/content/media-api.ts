'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * The admin's image library.
 *
 * Uploads go to the backend, which re-encodes everything to webp and names each
 * file after the hash of its bytes. The value stored in content is the returned
 * relative path, so it stays valid if the API ever moves host.
 */

export interface MediaAsset {
  id: string;
  /** Relative, e.g. "/uploads/ab12….webp". */
  url: string;
  filename: string;
  alt: string;
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

/** The library, newest first. */
export async function listMedia(): Promise<MediaAsset[]> {
  try {
    const res = await apiClient.get('/admin/media');
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
  if (alt) form.append('alt', alt);

  try {
    // Content-Type is deliberately unset: the browser has to add the multipart
    // boundary itself, and naming the type here would omit it.
    const res = await apiClient.post('/admin/media', form);
    const asset = toAsset(res.data?.data?.asset);
    if (!asset) throw new Error('The server did not return an image.');
    return asset;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Upload failed.'));
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
