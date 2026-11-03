'use client';

import axios from 'axios';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Saves a file the API generates (CSV reports, statements, spreadsheet
 * exports) under the staff session.
 *
 * Fetched as a blob through the API client rather than opened as a link: the
 * session is an httpOnly cookie on the API's origin, the request needs the
 * client's refresh-on-401, and an error has to come back as a message rather
 * than a JSON page in a new tab. The file name comes from the caller —
 * `Content-Disposition` is not readable cross-origin (only `X-Total-Count` is
 * exposed).
 */
export async function downloadFromApi(
  path: string,
  filename: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<void> {
  try {
    const clean = params
      ? Object.fromEntries(
          Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
        )
      : undefined;
    const response = await apiClient.get(path, {
      params: clean,
      responseType: 'blob',
      timeout: 60000,
    });
    saveBlob(response.data as Blob, filename);
  } catch (error) {
    throw new Error(await blobErrorMessage(error, 'Could not download that file.'));
  }
}

/** Hands a blob to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** A blob request's error body is a Blob too; read the envelope's message out of it. */
export async function blobErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const parsed = JSON.parse(await error.response.data.text()) as { message?: string };
      if (parsed?.message) return parsed.message;
    } catch {
      // not JSON — fall through
    }
  }
  return getApiErrorMessage(error, fallback);
}
