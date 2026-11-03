'use client';

import React, { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { ImagePicker, MediaThumb } from '@/components/admin/ImagePicker';
import { Home } from '@/components/admin/icons';
import { ConfirmDialog } from '../operations/[section]/editors';

/**
 * Banners (`/admin/banners`, CONTENT): artwork with a headline and a link,
 * shown by position (homepage, category, product page) inside an optional
 * date window. The storefront reads the live ones from `GET /banners`.
 *
 * Writes are partial on the API — a field left out is unchanged, an explicit
 * null clears it — so the form always sends every field it shows.
 */

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image: string;
  imageAlt: string | null;
  link: string | null;
  position: string;
  type: string;
  displayOrder: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type BannerInput = Partial<Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>>;

const POSITIONS = ['HOMEPAGE', 'CATEGORY', 'PRODUCT'] as const;
const TYPES = ['HERO', 'CATEGORY', 'PROMOTIONAL'] as const;

const label = (value: string) =>
  value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

async function listBanners(): Promise<Banner[]> {
  try {
    const response = await apiClient.get('/admin/banners');
    return (response.data?.data?.banners as Banner[]) ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load banners.'));
  }
}

async function saveBanner(id: string | null, input: BannerInput): Promise<Banner> {
  try {
    const response = id
      ? await apiClient.put(`/admin/banners/${encodeURIComponent(id)}`, input)
      : await apiClient.post('/admin/banners', input);
    return response.data?.data?.banner as Banner;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save that banner.'));
  }
}

async function deleteBanner(id: string): Promise<void> {
  try {
    await apiClient.delete(`/admin/banners/${encodeURIComponent(id)}`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not delete that banner.'));
  }
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN') : null;

/** "Always", "From 3/11/2026", "Until …", "3/11/2026 – 30/11/2026". */
const windowText = (banner: Banner) => {
  const start = shortDate(banner.startDate);
  const end = shortDate(banner.endDate);
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return 'Always';
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  overflowY: 'auto',
  background: 'rgba(0,0,0,0.6)',
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 12,
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--admin-text-2)',
  fontSize: 13,
};

const BannerEditor: React.FC<{
  banner: Banner | null;
  onClose: () => void;
  onSaved: (banner: Banner, message: string) => void;
}> = ({ banner, onClose, onSaved }) => {
  const [form, setForm] = useState({
    title: banner?.title ?? '',
    subtitle: banner?.subtitle ?? '',
    image: banner?.image ?? '',
    imageAlt: banner?.imageAlt ?? '',
    link: banner?.link ?? '',
    position: banner?.position ?? 'HOMEPAGE',
    type: banner?.type ?? 'HERO',
    displayOrder: String(banner?.displayOrder ?? 0),
    startDate: day(banner?.startDate ?? null),
    endDate: day(banner?.endDate ?? null),
    isActive: banner?.isActive ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setError('The end date must be on or after the start date.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveBanner(banner?.id ?? null, {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        image: form.image.trim(),
        imageAlt: form.imageAlt.trim() || null,
        link: form.link.trim() || null,
        position: form.position,
        type: form.type,
        displayOrder: Number(form.displayOrder) || 0,
        // Whole days in local time: from the start of the first to the end of the last.
        startDate: form.startDate ? new Date(`${form.startDate}T00:00:00`).toISOString() : null,
        endDate: form.endDate ? new Date(`${form.endDate}T23:59:59`).toISOString() : null,
        isActive: form.isActive,
      });
      onSaved(saved, banner ? 'Banner saved.' : 'Banner created.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={banner ? `Edit ${banner.title}` : 'New banner'}
      style={overlayStyle}
    >
      <form className="admin-card" style={{ maxWidth: 640, width: '100%' }} onSubmit={submit}>
        <p className="admin-kpi-label">{banner ? 'Edit banner' : 'New banner'}</p>
        <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
          Shown where its position says, while active and inside its dates.
        </p>

        {error && (
          <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        )}

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Title</span>
            <input
              required
              maxLength={160}
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            <span style={labelStyle}>Subtitle</span>
            <input
              maxLength={240}
              value={form.subtitle}
              onChange={(event) => set('subtitle', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>Image</span>
          <ImagePicker
            id="banner-image"
            value={form.image}
            invalid={false}
            onChange={(value) => set('image', value)}
            onBlur={() => {}}
          />
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Image description (alt)</span>
            <input
              maxLength={300}
              value={form.imageAlt}
              onChange={(event) => set('imageAlt', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            <span style={labelStyle}>Link</span>
            <input
              maxLength={500}
              value={form.link}
              placeholder="/products/men"
              onChange={(event) => set('link', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Position</span>
            <select
              value={form.position}
              onChange={(event) => set('position', event.target.value)}
              style={{ width: '100%' }}
            >
              {POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {label(position)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Type</span>
            <select
              value={form.type}
              onChange={(event) => set('type', event.target.value)}
              style={{ width: '100%' }}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {label(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Order</span>
            <input
              type="number"
              step={1}
              value={form.displayOrder}
              onChange={(event) => set('displayOrder', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Starts (optional)</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => set('startDate', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            <span style={labelStyle}>Ends (optional)</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(event) => set('endDate', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 18,
            fontSize: 12.5,
            color: 'var(--admin-text-2)',
          }}
        >
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => set('isActive', event.target.checked)}
          />
          Active
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSaving || !form.title.trim() || !form.image.trim()}
          >
            {isSaving ? 'Saving…' : banner ? 'Save banner' : 'Create banner'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [reloads, setReloads] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ banner: Banner | null } | null>(null);
  const [removing, setRemoving] = useState<Banner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBanners()
      .then((list) => {
        if (!cancelled) setBanners(list);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const reload = () => setReloads((count) => count + 1);

  const toggle = async (banner: Banner) => {
    setBusyId(banner.id);
    setError(null);
    try {
      await saveBanner(banner.id, { isActive: !banner.isActive });
      setNotice(banner.isActive ? `${banner.title} switched off.` : `${banner.title} is active.`);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemoval = async () => {
    if (!removing) return;
    setBusyId(removing.id);
    setError(null);
    try {
      await deleteBanner(removing.id);
      setNotice(`${removing.title} deleted.`);
      setRemoving(null);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Banners</h1>
          <p className="admin-page-sub">
            Promotional artwork for the homepage, category and product pages.
          </p>
        </div>
        <div className="admin-page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing({ banner: null })}
          >
            New banner
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
        {banners === null && !error ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading…</p>
          </div>
        ) : !banners?.length ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">
              <Home size={22} />
            </span>
            <p className="admin-empty-title">No banners yet</p>
            <p className="admin-empty-text">
              Create one to promote a collection, a sale or a new arrival.
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap" style={{ width: '100%', margin: 0, borderTop: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '1%' }}>
                    <span className="sr-only">Image</span>
                  </th>
                  <th>Banner</th>
                  <th style={{ width: '1%' }}>Where</th>
                  <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Shown</th>
                  <th style={{ width: '1%', textAlign: 'right' }}>Order</th>
                  <th style={{ width: '1%' }}>Status</th>
                  <th style={{ width: '1%' }}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {banners.map((banner) => (
                  <tr key={banner.id}>
                    <td>
                      <MediaThumb
                        url={banner.image}
                        variant="banner"
                        className="block h-10 w-16 rounded bg-cover bg-center"
                      />
                    </td>
                    <td>
                      <span className="admin-row-title">{banner.title}</span>
                      {banner.subtitle && (
                        <span className="admin-kpi-sub" style={{ display: 'block' }}>
                          {banner.subtitle}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {label(banner.position)} · {label(banner.type)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{windowText(banner)}</td>
                    <td style={{ textAlign: 'right' }}>{banner.displayOrder}</td>
                    <td>
                      <span
                        className="admin-status-badge"
                        data-status={banner.isActive ? 'ACTIVE' : 'NEUTRAL'}
                      >
                        {banner.isActive ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busyId === banner.id}
                          onClick={() => void toggle(banner)}
                        >
                          {banner.isActive ? 'Switch off' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setEditing({ banner })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ color: 'var(--a-bad)' }}
                          onClick={() => setRemoving(banner)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <BannerEditor
          banner={editing.banner}
          onClose={() => setEditing(null)}
          onSaved={(_banner, message) => {
            setEditing(null);
            setNotice(message);
            reload();
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Delete banner"
          subject={removing.title}
          detail="The banner is removed from the storefront and from this list. Switching it off instead keeps it for later."
          confirmLabel="Delete banner"
          isBusy={busyId === removing.id}
          onConfirm={() => void confirmRemoval()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
