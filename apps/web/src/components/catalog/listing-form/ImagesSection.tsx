'use client';

import React, { useRef, useState } from 'react';
import { ImagePicker } from '@/components/admin/ImagePicker';
import { ProductThumb } from '@/components/product';
import { uploadSellerPhoto } from '@/lib/seller-api';
import { RequiredMark } from './controls';
import { ANGLES, imageId, type FormMode } from './model';

interface SellerSlotProps {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  onChange: (url: string) => void;
}

/**
 * One angle for a seller. Uploads go through the same seller media route as
 * the gallery field (re-encoded to webp, stored as a relative path).
 */
const SellerSlot: React.FC<SellerSlotProps> = ({ id, label, value, invalid, onChange }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadSellerPhoto(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="lf-slot-body">
      {value ? (
        <ProductThumb src={value} alt={`${label} image`} className="lf-thumb" />
      ) : (
        <div className="lf-thumb lf-thumb--empty" aria-hidden="true">
          No image
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      <div className="lf-inline lf-wrap">
        <button
          id={id}
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          aria-describedby={invalid ? `${id}-missing` : undefined}
          aria-label={`${value ? 'Replace' : 'Upload'} ${label} image`}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
        </button>
        {value && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={`Remove ${label} image`}
            onClick={() => onChange('')}
          >
            Remove
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
};

interface ImagesSectionProps {
  mode: FormMode;
  angles: Record<string, string>;
  missing: Set<string>;
  onChange: (angle: string, url: string) => void;
  /** A look shot is a garment on a model; shoes and gadgets have none. */
  withLookShot?: boolean;
}

/** Seven fixed angles, Myntra's order. Front is the thumbnail. */
export const ImagesSection: React.FC<ImagesSectionProps> = ({
  mode,
  angles,
  missing,
  onChange,
  withLookShot = true,
}) => {
  const slots = withLookShot ? ANGLES : ANGLES.filter((angle) => angle.key !== 'lookShot');
  const filled = slots.filter((angle) => (angles[angle.key] ?? '').trim() !== '').length;
  return (
    <>
      <p className="lf-hint">
        {filled} of {slots.length} angles filled. The front image becomes the thumbnail; the
        gallery follows this order.
      </p>
      <ul className="lf-slots">
        {slots.map((angle) => {
          const id = imageId(angle.key);
          const value = angles[angle.key] ?? '';
          const isRequired = angle.key === 'front';
          return (
            <li
              key={angle.key}
              className="lf-slot"
              data-filled={value ? true : undefined}
              data-missing={missing.has(id) || undefined}
            >
              <div className="lf-slot-head">
                {mode === 'admin' ? (
                  <label htmlFor={id} className="lf-label">
                    <span>{angle.label}</span>
                    {isRequired && <RequiredMark />}
                  </label>
                ) : (
                  <p className="lf-label">
                    <span>{angle.label}</span>
                    {isRequired && <RequiredMark />}
                  </p>
                )}
                <span className="lf-slot-state">{value ? 'Filled' : 'Empty'}</span>
              </div>
              {mode === 'admin' ? (
                <ImagePicker
                  id={id}
                  value={value}
                  invalid={missing.has(id)}
                  onChange={(url) => onChange(angle.key, url)}
                  onBlur={() => {}}
                />
              ) : (
                <SellerSlot
                  id={id}
                  label={angle.label}
                  value={value}
                  invalid={missing.has(id)}
                  onChange={(url) => onChange(angle.key, url)}
                />
              )}
              {missing.has(id) && (
                <p id={`${id}-missing`} className="lf-missing-msg">
                  Needed to go live
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
};
