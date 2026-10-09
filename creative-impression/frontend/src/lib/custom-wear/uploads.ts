/**
 * Design-file validation, preview handling and upload.
 *
 * Files are checked in the browser first (extension, size) for a fast answer,
 * then sent to `POST /api/custom-wear/artwork`, which decides the real type
 * from the bytes, re-encodes it and returns the stored URL.
 */

import { customWearContent } from '@/config/custom-wear/content';
import type { DesignUpload } from '@/types/custom-wear';
import { uploadArtwork, type UploadedArtwork } from './api';

const RASTER_PREVIEWABLE = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg']);

/** What the artwork endpoint accepts. Larger files are refused server-side. */
export const ARTWORK_SERVER_MAX_MB = 15;

export interface UploadValidationConfig {
  acceptedExtensions: string[];
  maxFileSizeMb: number;
}

export const defaultUploadConfig: UploadValidationConfig = {
  acceptedExtensions: customWearContent.upload.acceptedExtensions,
  maxFileSizeMb: customWearContent.upload.maxFileSizeMb,
};

export const getExtension = (fileName: string): string => {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

/** `accept` attribute for the file input, e.g. `.png,.jpg,...`. */
export const acceptAttribute = (config: UploadValidationConfig = defaultUploadConfig): string =>
  config.acceptedExtensions.map((extension) => `.${extension}`).join(',');

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateDesignFile(
  file: File,
  config: UploadValidationConfig = defaultUploadConfig
): string | null {
  const extension = getExtension(file.name);

  if (!extension) return 'That file has no extension, so we cannot tell what format it is.';

  if (!config.acceptedExtensions.includes(extension)) {
    return `${extension.toUpperCase()} files are not supported. Use ${config.acceptedExtensions
      .map((entry) => entry.toUpperCase())
      .join(', ')}.`;
  }

  if (file.size === 0) return 'That file is empty.';

  const limitMb = Math.min(config.maxFileSizeMb, ARTWORK_SERVER_MAX_MB);
  if (file.size > limitMb * 1024 * 1024) {
    return `File is ${formatFileSize(file.size)}. The limit is ${limitMb} MB.`;
  }

  return null;
}

let uploadCounter = 0;

/** Creates the tracked upload record, generating a preview for raster formats. */
export function createDesignUpload(
  file: File,
  config: UploadValidationConfig = defaultUploadConfig
): DesignUpload {
  uploadCounter += 1;
  const extension = getExtension(file.name);
  const error = validateDesignFile(file, config);

  const base: DesignUpload = {
    id: `upload-${uploadCounter}-${file.size}`,
    name: file.name,
    size: file.size,
    mimeType: file.type || `application/${extension || 'octet-stream'}`,
    extension,
    status: error ? 'error' : 'ready',
    error: error ?? undefined,
  };

  if (!error && RASTER_PREVIEWABLE.has(extension) && typeof URL !== 'undefined') {
    base.previewUrl = URL.createObjectURL(file);
  }

  return base;
}

export function releaseDesignUpload(upload: DesignUpload): void {
  if (upload.previewUrl && typeof URL !== 'undefined') {
    URL.revokeObjectURL(upload.previewUrl);
  }
}

/**
 * Store the file on the server. The record moves from `ready` (validated in
 * the browser) to carrying a `url`; the caller tracks `uploading` / `error`.
 */
export async function uploadDesignFile(file: File): Promise<UploadedArtwork> {
  return uploadArtwork(file);
}
