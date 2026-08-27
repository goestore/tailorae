'use client';

import React, { useRef, useState } from 'react';
import {
  deleteMedia,
  formatBytes,
  listMedia,
  uploadMedia,
  type MediaAsset,
} from '@/content/media-api';
import { cn } from '@/utils/helpers';
import { LABEL_VOICE } from './ContentField';

/**
 * Chooses the image a content field points at.
 *
 * Three ways in, because all three are real: upload a new file, pick one
 * already uploaded, or type a path by hand. The last matters more than it
 * looks — the site ships with images in `public/images` that were never
 * uploaded through here, and a picker that could not address them would make
 * every existing default uneditable.
 *
 * The value is always a plain relative path. Nothing here stores a hostname.
 */

/**
 * Only paths that cannot break out of the `url("…")` they are interpolated
 * into are previewed: React does not escape inline CSS and this value can be
 * typed by hand. A path that fails still saves — it just shows no thumbnail.
 */
const previewable = (value: string): boolean => value !== '' && /^[^"'()\s]+$/.test(value);

const Thumb: React.FC<{ url: string; className?: string }> = ({ url, className }) => (
  <span
    aria-hidden="true"
    className={cn('block bg-surface-2 bg-contain bg-center bg-no-repeat', className)}
    style={previewable(url) ? { backgroundImage: `url("${url}")` } : undefined}
  />
);

interface ImagePickerProps {
  id: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

export const ImagePicker: React.FC<ImagePickerProps> = ({
  id,
  value,
  invalid,
  describedBy,
  onChange,
  onBlur,
}) => {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listMedia()
      .then(setAssets)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  /**
   * Opening the drawer is what loads the library — an event, not a
   * synchronisation, so it belongs in the handler rather than an effect. It
   * also means the fetch only happens for fields someone actually opens, and
   * an editor mounts dozens of them.
   */
  const toggleLibrary = () => {
    setOpen((current) => {
      const next = !current;
      if (next && assets.length === 0 && !loading) refresh();
      return next;
    });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await uploadMedia(file);
      // Uploading is an act of choosing: the field takes the new image rather
      // than making someone find it in the grid they just added to.
      onChange(asset.url);
      onBlur();
      setAssets((current) =>
        current.some((a) => a.id === asset.id) ? current : [asset, ...current]
      );
      // Show the grid so the new image is visibly in the library, not just in
      // the field.
      setOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMedia(asset.id);
      setAssets((current) => current.filter((a) => a.id !== asset.id));
      // A field still pointing at the deleted file would render a broken
      // image, so it is cleared rather than left dangling.
      if (value === asset.url) {
        onChange('');
        onBlur();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {previewable(value) && <Thumb url={value} className="h-14 w-14 shrink-0 border border-line" />}

        <input
          id={id}
          suppressHydrationWarning
          type="text"
          value={value}
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 font-mono text-sm"
          placeholder="/images/example.webp"
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <button
          type="button"
          className="btn btn-sm btn-outline"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? 'Uploading…' : 'Upload image'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          aria-expanded={open}
          onClick={toggleLibrary}
        >
          {open ? 'Hide library' : 'Choose from library'}
        </button>
        {value !== '' && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              onChange('');
              onBlur();
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {open && (
        <div className="border border-line bg-surface-2 p-3">
          {loading && <p className="text-sm text-ink-3">Loading the library…</p>}

          {!loading && assets.length === 0 && (
            <p className="text-sm text-ink-3">
              Nothing uploaded yet. Use “Upload image”, or type a path to one of the images that
              ship with the site.
            </p>
          )}

          {assets.length > 0 && (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {assets.map((asset) => {
                const selected = asset.url === value;
                return (
                  <li key={asset.id} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        'block w-full border p-1 text-left',
                        selected ? 'border-primary-500 bg-brand-soft' : 'border-line bg-surface'
                      )}
                      onClick={() => {
                        onChange(asset.url);
                        onBlur();
                      }}
                    >
                      <Thumb url={asset.url} className="h-20 w-full" />
                      <span className="mt-1 block truncate text-[11px] text-ink" title={asset.filename}>
                        {asset.filename}
                      </span>
                      <span className={cn(LABEL_VOICE, 'block')}>
                        {asset.width}×{asset.height} · {formatBytes(asset.bytes)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="mt-0.5 text-[11px] text-ink-3 underline hover:text-red-600"
                      disabled={busy}
                      onClick={() => void handleDelete(asset)}
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
