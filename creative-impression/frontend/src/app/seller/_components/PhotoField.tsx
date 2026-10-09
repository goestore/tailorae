'use client';

import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ProductThumb } from '@/components/product';
import { uploadSellerPhoto } from '@/lib/seller-api';

/**
 * The photos on a listing, in the order they are shown.
 *
 * Position matters and is the only thing that decides which picture is the
 * main one — the first photo becomes the thumbnail on save. That is why there
 * is a "make main" control and no separate thumbnail field: a listing whose
 * thumbnail is a picture missing from its own gallery is a state nobody
 * intends and everybody has to reason about later.
 *
 * Uploads go through the seller media route, which re-encodes every file to
 * webp and names it after its hash, so what comes back is a relative
 * `/uploads/...` path the storefront can already serve.
 */

export interface PhotoFieldProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/** Six is the practical ceiling the gallery on a product page is built around. */
const MAX_PHOTOS = 6;

export const PhotoField: React.FC<PhotoFieldProps> = ({ value, onChange, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Clearing the input is what lets the same file be chosen twice running —
    // without it the change event never fires the second time.
    event.target.value = '';
    if (files.length === 0) return;

    const room = MAX_PHOTOS - value.length;
    if (room <= 0) {
      toast.error(`A listing can carry ${MAX_PHOTOS} photos.`);
      return;
    }

    setIsUploading(true);
    const added: string[] = [];
    try {
      for (const file of files.slice(0, room)) {
        added.push(await uploadSellerPhoto(file));
      }
      // Whatever uploaded is kept even if a later file failed, so a seller
      // does not lose four good photos to one bad one.
      onChange([...value, ...added]);
    } catch (error) {
      if (added.length > 0) onChange([...value, ...added]);
      toast.error((error as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const remove = (url: string) => onChange(value.filter((item) => item !== url));

  const makeMain = (url: string) => onChange([url, ...value.filter((item) => item !== url)]);

  return (
    <div className="space-y-2">
      <p className="m-0 text-sm font-medium text-black">Photos</p>

      {value.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
          {value.map((url, index) => (
            <li key={url} className="w-[116px]">
              <div className="relative border border-line">
                <ProductThumb src={url} alt={`Photo ${index + 1}`} className="h-[116px] w-full" />
                {index === 0 && (
                  <span
                    className="absolute left-0 top-0 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                    style={{ background: 'var(--brand)', color: 'var(--ink)' }}
                  >
                    Main
                  </span>
                )}
              </div>
              {/* The badge above already says which one is main, so the first
                  tile carries no second label — only the action it still has. */}
              <div className="mt-1 flex items-center justify-between gap-2 text-[12px]">
                {index === 0 ? (
                  <span aria-hidden="true" />
                ) : (
                  <button
                    type="button"
                    onClick={() => makeMain(url)}
                    disabled={disabled}
                    className="underline underline-offset-2 disabled:opacity-40"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    Make main
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(url)}
                  disabled={disabled}
                  aria-label={`Remove photo ${index + 1}`}
                  className="underline underline-offset-2 disabled:opacity-40"
                  style={{ color: 'var(--sale)' }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={pick}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isUploading || value.length >= MAX_PHOTOS}
        className="btn btn-outline btn-sm"
      >
        {isUploading ? 'Uploading…' : value.length === 0 ? 'Add photos' : 'Add more'}
      </button>
      <p className="m-0 text-sm text-neutral-500">
        Up to {MAX_PHOTOS}. The first one is what shoppers see in the shop; drag is not needed,
        use &ldquo;make main&rdquo;.
      </p>
    </div>
  );
};
