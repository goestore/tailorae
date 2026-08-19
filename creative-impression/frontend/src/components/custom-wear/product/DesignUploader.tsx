'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { customWearContent } from '@/config/custom-wear/content';
import {
  acceptAttribute,
  createDesignUpload,
  formatFileSize,
  isBackendSupported,
  releaseDesignUpload,
} from '@/lib/custom-wear/uploads';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import type { DesignUpload } from '@/types/custom-wear';

export interface DesignUploaderProps {
  uploads: DesignUpload[];
  onChange: (uploads: DesignUpload[]) => void;
  productId: string;
}

/**
 * Artwork upload with drag-and-drop, validation and previews.
 *
 * Files stay in the browser: their names travel with the cart item or quote
 * request. `uploadDesignFile` in `lib/custom-wear/uploads.ts` is where storage
 * gets wired in.
 */
export const DesignUploader: React.FC<DesignUploaderProps> = ({ uploads, onChange, productId }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);

  const { maxFiles, maxFileSizeMb, helpText, acceptedExtensions } = customWearContent.upload;

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const room = maxFiles - uploads.length;
    if (room <= 0) {
      setLimitError(`You can attach up to ${maxFiles} files. Remove one to add another.`);
      return;
    }

    setLimitError(
      fileList.length > room
        ? `Only the first ${room} file(s) were added — the limit is ${maxFiles}.`
        : null
    );

    const next = Array.from(fileList)
      .slice(0, room)
      .map((file) => createDesignUpload(file));

    next.forEach((upload) => {
      if (upload.status === 'ready') {
        trackCustomWearEvent('custom_wear_design_uploaded', {
          productId,
          extension: upload.extension,
          size: upload.size,
        });
      }
    });

    onChange([...uploads, ...next]);
  };

  const remove = (upload: DesignUpload) => {
    releaseDesignUpload(upload);
    onChange(uploads.filter((entry) => entry.id !== upload.id));
    setLimitError(null);
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className="flex flex-col items-center px-4 py-6 text-center transition-colors"
        style={{
          border: `1.5px dashed ${isDragging ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
          borderRadius: 'var(--cw-radius-control)',
          backgroundColor: isDragging ? 'var(--cw-primary-soft)' : 'var(--cw-surface-alt)',
        }}
      >
        <svg
          aria-hidden="true"
          className="mb-2 h-7 w-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          style={{ color: 'var(--cw-ink-subtle)' }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
          />
        </svg>

        <p
          style={{
            margin: 0,
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            fontWeight: 600,
            color: 'var(--cw-ink)',
          }}
        >
          Drag artwork here, or
        </p>

        <button
          suppressHydrationWarning
          type="button"
          onClick={() => inputRef.current?.click()}
          className="cw-cta cw-cta--outline mt-2.5"
        >
          Choose files
        </button>

        <input
          suppressHydrationWarning
          ref={inputRef}
          type="file"
          multiple
          accept={acceptAttribute()}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
          className="sr-only"
          aria-label="Upload design files"
        />

        <p
          style={{
            margin: '10px 0 0',
            color: 'var(--cw-ink-subtle)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
            lineHeight: 1.6,
            maxWidth: '420px',
          }}
        >
          {acceptedExtensions.map((extension) => extension.toUpperCase()).join(', ')} · up to{' '}
          {maxFileSizeMb} MB each · {maxFiles} files max. {helpText}
        </p>
      </div>

      {limitError && (
        <p
          role="alert"
          style={{
            margin: '10px 0 0',
            color: 'var(--cw-danger)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
          }}
        >
          {limitError}
        </p>
      )}

      {uploads.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {uploads.map((upload) => {
            const hasError = upload.status === 'error';
            const pendingFormat = !hasError && !isBackendSupported(upload.extension);
            return (
              <li
                key={upload.id}
                className="flex items-center gap-3 p-2.5"
                style={{
                  border: `1px solid ${hasError ? 'var(--cw-danger)' : 'var(--cw-border)'}`,
                  borderRadius: 'var(--cw-radius-control)',
                }}
              >
                <span
                  className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden"
                  style={{
                    backgroundColor: 'var(--cw-surface-alt)',
                    borderRadius: '6px',
                    color: 'var(--cw-ink-subtle)',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  {upload.previewUrl ? (
                    <Image
                      src={upload.previewUrl}
                      alt={`Preview of ${upload.name}`}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    upload.extension.toUpperCase()
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate"
                    style={{
                      fontFamily: 'var(--cw-font-body)',
                      fontSize: 'var(--cw-fs-micro)',
                      fontWeight: 600,
                      color: 'var(--cw-ink)',
                    }}
                    title={upload.name}
                  >
                    {upload.name}
                  </span>
                  <span
                    className="block"
                    style={{
                      fontFamily: 'var(--cw-font-body)',
                      fontSize: '11px',
                      color: hasError ? 'var(--cw-danger)' : 'var(--cw-ink-subtle)',
                    }}
                  >
                    {hasError
                      ? upload.error
                      : `${formatFileSize(upload.size)} · attached${
                          pendingFormat ? ' · our team will confirm this format' : ''
                        }`}
                  </span>
                </span>

                <button
                  suppressHydrationWarning
                  type="button"
                  onClick={() => remove(upload)}
                  aria-label={`Remove ${upload.name}`}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-neutral-100"
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    style={{ color: 'var(--cw-ink-muted)' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
