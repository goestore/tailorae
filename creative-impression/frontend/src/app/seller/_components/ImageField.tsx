'use client';

import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ProductThumb } from '@/components/product';
import { uploadSellerPhoto } from '@/lib/seller-api';

/**
 * One picture, uploaded and replaced in place.
 *
 * The shop's logo and banner are single images, so they get a control that
 * shows the current one rather than the gallery `PhotoField` renders. Both go
 * through the same seller media route, which re-encodes to webp and returns a
 * relative `/uploads/...` path.
 */

export interface ImageFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  helperText?: string;
  /** CSS aspect-ratio for the preview, so a banner is not shown as a square. */
  aspect?: string;
  disabled?: boolean;
}

export const ImageField: React.FC<ImageFieldProps> = ({
  id,
  label,
  value,
  onChange,
  helperText,
  aspect = '1 / 1',
  disabled,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clearing the input is what lets the same file be chosen twice running.
    event.target.value = '';
    if (!file) return;

    setIsUploading(true);
    try {
      onChange(await uploadSellerPhoto(file));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="m-0 text-sm font-medium text-black">{label}</p>

      <div className="flex items-start gap-4">
        <div className="w-[140px] flex-shrink-0 border border-line" style={{ aspectRatio: aspect }}>
          <ProductThumb src={value || null} alt={label} className="h-full w-full" />
        </div>

        <div className="flex flex-col items-start gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pick}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || isUploading}
            className="btn btn-outline btn-sm"
          >
            {isUploading ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled || isUploading}
              className="text-[12px] underline underline-offset-2 disabled:opacity-40"
              style={{ color: 'var(--ink-3)' }}
            >
              Remove
            </button>
          )}
          {helperText && <p className="m-0 text-sm text-neutral-500">{helperText}</p>}
        </div>
      </div>
    </div>
  );
};
