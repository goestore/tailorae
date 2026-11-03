'use client';

import React, { useState, type FormEvent } from 'react';
import {
  createBrand,
  updateBrand,
  type AdminBrand,
  type BrandInput,
} from '@/lib/admin-brands';
import {
  createCoupon,
  updateCoupon,
  type AdminCoupon,
  type CouponInput,
} from '@/lib/admin-coupons';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { BrandReview } from './BrandReview';

/**
 * The bespoke parts of the operations table.
 *
 * Everything else on that screen is one generic table driven by a column
 * config. These three are the records an admin has to be able to author rather
 * than merely toggle — a brand, a promotion, and a stock level — and each
 * needs a real form or a real input, so they live here rather than being bent
 * into the config.
 */

/** Width only: height, padding and border come from the console's field style. */
export const fieldStyle: React.CSSProperties = {
  width: '100%',
};

export const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--admin-text-2)',
  fontSize: 13,
  letterSpacing: '-0.005em',
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

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--admin-text-2)',
  fontSize: 12.5,
};

/**
 * A yes/no the admin cannot walk into by accident.
 *
 * Used for the two destructive actions in the console's list screens. The
 * consequence is spelled out in the dialog rather than in a tooltip, because
 * the difference between removing an unused brand and removing one that
 * fifteen products carry is the whole decision.
 */
export const ConfirmDialog: React.FC<{
  title: string;
  subject: string;
  detail: string;
  confirmLabel: string;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, subject, detail, confirmLabel, isBusy, onConfirm, onCancel }) => (
  <div role="dialog" aria-modal="true" aria-label={title} style={overlayStyle}>
    <div className="admin-card" style={{ maxWidth: 440, width: '100%' }}>
      <p className="admin-kpi-label">{title}</p>
      <p className="admin-kpi-value" style={{ fontSize: 22 }}>
        {subject}
      </p>
      <p className="admin-kpi-sub" style={{ margin: '8px 0 16px' }}>
        {detail}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel} disabled={isBusy}>
          Keep
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isBusy}>
          {isBusy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

/**
 * Create or correct a brand.
 *
 * The slug is left blank on a new brand unless the admin types one — the
 * server derives it from the name — but it is shown when editing, because a
 * live brand page hangs off it and changing it silently would break the link.
 */
export const BrandEditor: React.FC<{
  brand: AdminBrand | null;
  onClose: () => void;
  onSaved: (brand: AdminBrand, message: string) => void;
}> = ({ brand, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: brand?.name ?? '',
    slug: brand?.slug ?? '',
    description: brand?.description ?? '',
    logo: brand?.logo ?? '',
    banner: brand?.banner ?? '',
    displayOrder: String(brand?.displayOrder ?? 0),
    isFeatured: brand?.isFeatured ?? false,
    isActive: brand?.isActive ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const payload: BrandInput = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        logo: form.logo.trim() || null,
        banner: form.banner.trim() || null,
        displayOrder: Number(form.displayOrder) || 0,
        isFeatured: form.isFeatured,
        isActive: form.isActive,
      };
      if (form.slug.trim()) payload.slug = form.slug.trim();

      const saved = brand
        ? await updateBrand(brand.id, payload)
        : await createBrand(payload);
      onSaved(saved, brand ? 'Brand updated.' : 'Brand created.');
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
      aria-label={brand ? `Edit ${brand.name}` : 'New brand'}
      style={overlayStyle}
    >
      <form className="admin-card" style={{ maxWidth: 560, width: '100%' }} onSubmit={submit}>
        <p className="admin-kpi-label">{brand ? 'Edit brand' : 'New brand'}</p>
        <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
          Every brand gets its own storefront page. Featured brands also appear on the homepage
          rail.
        </p>

        {error && (
          <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        )}

        {brand && <BrandReview brand={brand} onDecided={(message) => onSaved(brand, message)} />}

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Name</span>
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Slug</span>
            <input
              maxLength={80}
              value={form.slug}
              placeholder={brand ? undefined : 'From the name'}
              onChange={(event) => set('slug', event.target.value)}
              style={fieldStyle}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>Description</span>
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Logo path</span>
            <input
              value={form.logo}
              placeholder="/images/brand.webp"
              onChange={(event) => set('logo', event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Banner path</span>
            <input
              value={form.banner}
              placeholder="/images/brand-banner.webp"
              onChange={(event) => set('banner', event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Order</span>
            <input
              type="number"
              step={1}
              value={form.displayOrder}
              onChange={(event) => set('displayOrder', event.target.value)}
              style={fieldStyle}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 20, marginBottom: 18, flexWrap: 'wrap' }}>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(event) => set('isFeatured', event.target.checked)}
            />
            Featured on the homepage
          </label>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
            />
            Visible in the shop
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSaving || !form.name.trim()}
          >
            {isSaving ? 'Saving…' : brand ? 'Save brand' : 'Create brand'}
          </button>
        </div>
      </form>
    </div>
  );
};

/** `<input type="date">` wants a plain day; the API sends an ISO instant. */
const dayValue = (iso: string | undefined): string => (iso ? iso.slice(0, 10) : '');

/**
 * Create or correct a promotion code.
 *
 * The same form does both, because the alternative an admin was left with —
 * deactivate the wrong one, create a near-duplicate — leaves two codes in the
 * list that differ by a digit and one of which still works.
 */
export const CouponEditor: React.FC<{
  coupon: AdminCoupon | null;
  onClose: () => void;
  onSaved: (coupon: AdminCoupon, message: string) => void;
}> = ({ coupon, onClose, onSaved }) => {
  const [form, setForm] = useState({
    code: coupon?.code ?? '',
    description: coupon?.description ?? '',
    discountType: coupon?.discountType ?? 'PERCENTAGE',
    discountValue: String(coupon?.discountValue ?? ''),
    minOrderAmount: String(coupon?.minOrderAmount ?? 0),
    maxDiscount: coupon?.maxDiscount === null || coupon?.maxDiscount === undefined
      ? ''
      : String(coupon.maxDiscount),
    usageLimit:
      coupon?.usageLimit === null || coupon?.usageLimit === undefined
        ? ''
        : String(coupon.usageLimit),
    perUserLimit: String(coupon?.perUserLimit ?? 1),
    startDate: dayValue(coupon?.startDate),
    endDate: dayValue(coupon?.endDate),
    isActive: coupon?.isActive ?? true,
    requireB2B: coupon?.requireB2B ?? false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const payload: CouponInput = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        discountType: form.discountType as CouponInput['discountType'],
        discountValue: Number(form.discountValue),
        minOrderAmount: Number(form.minOrderAmount) || 0,
        // Null rather than omitted: these two are the "no ceiling" and "no cap"
        // cases, and omitting them would leave a stale limit in place.
        maxDiscount: form.maxDiscount.trim() === '' ? null : Number(form.maxDiscount),
        usageLimit: form.usageLimit.trim() === '' ? null : Number(form.usageLimit),
        perUserLimit: Number(form.perUserLimit) || 1,
        startDate: form.startDate,
        endDate: form.endDate,
        isActive: form.isActive,
        requireB2B: form.requireB2B,
      };

      const saved = coupon
        ? await updateCoupon(coupon.id, payload)
        : await createCoupon(payload);
      onSaved(saved, coupon ? 'Coupon updated.' : 'Coupon created.');
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
      aria-label={coupon ? `Edit ${coupon.code}` : 'New coupon'}
      style={overlayStyle}
    >
      <form className="admin-card" style={{ maxWidth: 620, width: '100%' }} onSubmit={submit}>
        <p className="admin-kpi-label">{coupon ? 'Edit coupon' : 'New coupon'}</p>
        <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
          {coupon
            ? `Redeemed ${coupon.usageCount} time${coupon.usageCount === 1 ? '' : 's'}. Orders keep the discount they were placed with, so editing this only affects future baskets.`
            : 'Codes are matched case-insensitively and stored upper case.'}
        </p>

        {error && (
          <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        )}

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Code</span>
            <input
              required
              value={form.code}
              placeholder="WELCOME10"
              onChange={(event) => set('code', event.target.value)}
              style={{ ...fieldStyle, textTransform: 'uppercase' }}
            />
          </label>
          <label>
            <span style={labelStyle}>Type</span>
            <select
              value={form.discountType}
              onChange={(event) => set('discountType', event.target.value)}
              style={fieldStyle}
            >
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED_AMOUNT">Fixed amount</option>
            </select>
          </label>
          <label>
            <span style={labelStyle}>Value</span>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.discountValue}
              onChange={(event) => set('discountValue', event.target.value)}
              style={fieldStyle}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>Description</span>
          <input
            value={form.description}
            placeholder="Shown nowhere public — a note for the console"
            onChange={(event) => set('description', event.target.value)}
            style={fieldStyle}
          />
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Minimum basket</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.minOrderAmount}
              onChange={(event) => set('minOrderAmount', event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Maximum discount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.maxDiscount}
              placeholder="No cap"
              onChange={(event) => set('maxDiscount', event.target.value)}
              style={fieldStyle}
            />
          </label>
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Total uses</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.usageLimit}
              placeholder="Unlimited"
              onChange={(event) => set('usageLimit', event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Uses per customer</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.perUserLimit}
              onChange={(event) => set('perUserLimit', event.target.value)}
              style={fieldStyle}
            />
          </label>
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Starts</span>
            <input
              required
              type="date"
              value={form.startDate}
              onChange={(event) => set('startDate', event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Ends</span>
            <input
              required
              type="date"
              value={form.endDate}
              onChange={(event) => set('endDate', event.target.value)}
              style={fieldStyle}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 20, marginBottom: 18, flexWrap: 'wrap' }}>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
            />
            Active
          </label>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={form.requireB2B}
              onChange={(event) => set('requireB2B', event.target.checked)}
            />
            Trade accounts only
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSaving || !form.code.trim()}
          >
            {isSaving ? 'Saving…' : coupon ? 'Save coupon' : 'Create coupon'}
          </button>
        </div>
      </form>
    </div>
  );
};

/**
 * The stock figure, editable where it is read.
 *
 * Correcting a count meant opening the product form, finding the field and
 * saving the whole record — for a number an admin is reconciling against a
 * shelf, one row at a time. The write is the same `PUT /admin/products/:id`
 * the form uses, so the restock notification still fires on a zero-to-positive
 * crossing.
 */
export const StockCell: React.FC<{
  productId: string;
  quantity: number;
  onSaved: (quantity: number) => void;
  onError: (message: string) => void;
}> = ({ productId, quantity, onSaved, onError }) => {
  const [value, setValue] = useState(String(quantity));
  const [isSaving, setIsSaving] = useState(false);

  const parsed = Number(value);
  const isValid = Number.isInteger(parsed) && parsed >= 0;
  const isDirty = value.trim() !== String(quantity);

  const save = async () => {
    if (!isValid || !isDirty) return;
    setIsSaving(true);
    try {
      await apiClient.put(`/admin/products/${encodeURIComponent(productId)}`, {
        quantity: parsed,
      });
      onSaved(parsed);
    } catch (err) {
      onError(getApiErrorMessage(err, 'Could not update that stock level.'));
      setValue(String(quantity));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    // Reversed so the input keeps its right edge when the Save button appears.
    <span style={{ display: 'inline-flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        disabled={isSaving}
        aria-label="Stock level"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save();
          if (event.key === 'Escape') setValue(String(quantity));
        }}
        style={{ width: 80, textAlign: 'right' }}
      />
      {isDirty && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={!isValid || isSaving}
          onClick={() => void save()}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      )}
    </span>
  );
};

/** Categories: nesting, order, listing template and commission (its own file). */
export { CategoryEditor } from './CategoryEditor';
