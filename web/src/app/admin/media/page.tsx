'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  deleteMedia,
  formatBytes,
  listMedia,
  updateMediaAlt,
  uploadMedia,
  type MediaAsset,
} from '@/content/media-api';
import { Boxes } from '@/components/admin/icons';
import { ConfirmDialog } from '../operations/[section]/editors';

/**
 * The staff image library (`/admin/media`, CONTENT or MODERATOR).
 *
 * Every image the content editor and banners point at lives here. Uploading
 * the same file twice returns the asset already stored; alt text is edited in
 * place; the URL copies to the clipboard for use in a banner or a content
 * field typed by hand. Deleting removes the file, so anything still pointing
 * at it shows a placeholder — the dialog says so.
 */

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: 12,
};

const thumbStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  aspectRatio: '4 / 3',
  objectFit: 'contain',
  background: 'var(--a-surface-2)',
  borderRadius: 8,
};

const AssetCard: React.FC<{
  asset: MediaAsset;
  onSaved: (asset: MediaAsset) => void;
  onRemove: (asset: MediaAsset) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}> = ({ asset, onSaved, onRemove, onError, onNotice }) => {
  const [alt, setAlt] = useState(asset.alt ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = alt.trim() !== (asset.alt ?? '').trim();

  const save = async () => {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      onSaved(await updateMediaAlt(asset.id, alt));
      onNotice('Alt text saved.');
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asset.url);
      onNotice('Image URL copied.');
    } catch {
      onError('Could not copy — select the URL from the image’s link instead.');
    }
  };

  return (
    <li className="admin-card" style={{ padding: 10, display: 'grid', gap: 8 }}>
      <a href={asset.url} target="_blank" rel="noopener noreferrer" title="Open full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.alt ?? ''} loading="lazy" style={thumbStyle} />
      </a>
      <p
        className="admin-row-title"
        title={asset.filename}
        style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {asset.filename}
      </p>
      <p className="admin-kpi-sub" style={{ margin: 0 }}>
        {asset.width}×{asset.height} · {formatBytes(asset.bytes)} ·{' '}
        {new Date(asset.createdAt).toLocaleDateString('en-IN')}
      </p>
      <label style={{ display: 'grid', gap: 4 }}>
        <span className="admin-kpi-sub">Alt text</span>
        <input
          value={alt}
          maxLength={300}
          placeholder="Describe the image"
          onChange={(event) => setAlt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
        />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {isDirty && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={isSaving}
            onClick={() => void save()}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => void copy()}>
          Copy URL
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          style={{ color: 'var(--a-bad)' }}
          onClick={() => onRemove(asset)}
        >
          Delete
        </button>
      </div>
    </li>
  );
};

export default function AdminMediaPage() {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [removing, setRemoving] = useState<MediaAsset | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listMedia()
      .then((list) => {
        if (!cancelled) setAssets(list);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setIsUploading(true);
    setError(null);
    setNotice(null);
    const added: MediaAsset[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await uploadMedia(file));
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message}`);
      }
    }
    setAssets((current) => {
      const known = new Set(added.map((asset) => asset.id));
      return [...added, ...(current ?? []).filter((asset) => !known.has(asset.id))];
    });
    if (added.length) setNotice(`Uploaded ${added.length} image${added.length === 1 ? '' : 's'}.`);
    if (failed.length) setError(failed.join(' · '));
    setIsUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const confirmRemoval = async () => {
    if (!removing) return;
    setIsRemoving(true);
    setError(null);
    try {
      await deleteMedia(removing.id);
      setAssets((current) => (current ?? []).filter((asset) => asset.id !== removing.id));
      setNotice(`${removing.filename} deleted.`);
      setRemoving(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRemoving(false);
    }
  };

  const needle = search.trim().toLowerCase();
  const visible = (assets ?? []).filter(
    (asset) =>
      needle === '' ||
      asset.filename.toLowerCase().includes(needle) ||
      (asset.alt ?? '').toLowerCase().includes(needle)
  );

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Media library</h1>
          <p className="admin-page-sub">
            Images for the homepage, banners and site content. Uploading the same file twice keeps
            one copy.
          </p>
        </div>
        <div className="admin-page-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => void upload(event.target.files)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={isUploading}
            onClick={() => fileInput.current?.click()}
          >
            {isUploading ? 'Uploading…' : 'Upload images'}
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="admin-alert" style={{ marginBottom: 16 }}>
          <span>{notice}</span>
        </div>
      )}

      <div className="admin-card admin-index">
        {assets && assets.length > 0 && (
          <div className="admin-toolbar">
            <input
              type="search"
              aria-label="Search images"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by file name or alt text"
            />
            <span className="admin-toolbar-meta" style={{ marginLeft: 'auto' }}>
              {visible.length} of {assets.length}
            </span>
          </div>
        )}

        {assets === null && !error ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">
              <Boxes size={22} />
            </span>
            <p className="admin-empty-title">{needle ? 'No matches' : 'No images yet'}</p>
            <p className="admin-empty-text">
              {needle
                ? 'Try a different search.'
                : 'Upload an image to use it on the homepage, in banners or in site content.'}
            </p>
          </div>
        ) : (
          <ul style={{ ...gridStyle, listStyle: 'none', margin: 0, padding: 16 }}>
            {visible.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onSaved={(saved) =>
                  setAssets((current) =>
                    (current ?? []).map((item) => (item.id === saved.id ? saved : item))
                  )
                }
                onRemove={setRemoving}
                onError={(message) => {
                  setNotice(null);
                  setError(message);
                }}
                onNotice={(message) => {
                  setError(null);
                  setNotice(message);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {removing && (
        <ConfirmDialog
          title="Delete image"
          subject={removing.filename}
          detail="The file is removed for good. Any banner or content field still pointing at it will show a placeholder until it is given another image."
          confirmLabel="Delete image"
          isBusy={isRemoving}
          onConfirm={() => void confirmRemoval()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
