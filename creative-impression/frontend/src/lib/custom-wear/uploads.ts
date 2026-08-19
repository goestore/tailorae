/**
 * Design-file validation and preview handling.
 *
 * Files are validated and previewed entirely in the browser. Uploading to
 * storage happens at cart/quote submission time — `uploadDesignFile` below is
 * the single place to add that call.
 */

import { customWearContent } from '@/config/custom-wear/content';
import type { DesignUpload } from '@/types/custom-wear';

const RASTER_PREVIEWABLE = new Set(['png', 'jpg', 'jpeg', 'svg']);

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

  if (file.size > config.maxFileSizeMb * 1024 * 1024) {
    return `File is ${formatFileSize(file.size)}. The limit is ${config.maxFileSizeMb} MB.`;
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

/** True for formats the print team can process today. */
export function isBackendSupported(extension: string): boolean {
  return !customWearContent.upload.backendPendingExtensions.includes(extension);
}

/**
 * INTEGRATION POINT — artwork storage.
 *
 * There is no upload endpoint yet, so this intentionally does nothing but
 * report that. Implement `POST /api/custom-wear/designs` (multipart) and return
 * the stored URL here; `DesignUploader` already surfaces the resulting status.
 */
export async function uploadDesignFile(): Promise<never> {
  throw new Error(
    'Artwork storage is not connected yet. Files stay in the browser and their names are attached to the cart item or quote request.'
  );
}
