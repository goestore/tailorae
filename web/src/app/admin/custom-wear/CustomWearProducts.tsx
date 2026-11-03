'use client';

import React, { useEffect, useState } from 'react';
import {
  CW_BADGES,
  CW_CATEGORIES,
  CW_FABRICS,
  CW_STRUCTURED_KEYS,
  deleteCustomWearProduct,
  listCustomWearProducts,
  productToInput,
  saveCustomWearProduct,
  type AdminCustomWearProduct,
  type CustomWearProductInput,
} from '@/lib/admin-custom-wear';
import { formatPaise, paiseToRupees, rupeesToPaise } from '@/lib/money';
import { formatDateTime } from '@/utils/helpers';
import { Package } from '@/components/admin/icons';

/**
 * The custom wear catalogue (CONTENT): the garments shoppers configure in the
 * studio and ask a quote for.
 *
 * The everyday fields are a form, in rupees. The structured parts — price
 * tiers, colours, sizes, images, customisation options and copy blocks — are
 * edited as JSON in the API's own shape (paise), because each is a list of
 * small records the studio reads verbatim.
 */

const flush: React.CSSProperties = { width: '100%', margin: 0 };
const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--a-text-dim)',
  fontSize: 13,
};
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
  marginBottom: 12,
};
const dim: React.CSSProperties = { display: 'block', color: 'var(--a-text-dim)', fontSize: 12 };

const EMPTY_STRUCTURE = {
  priceTiers: [],
  colors: [],
  sizes: [],
  images: [],
  customizationMethods: [],
  customizationLocations: [],
  accordions: [],
  descriptionBlock: null,
  sizeChart: null,
  relatedProductIds: [],
};

interface FormState {
  name: string;
  slug: string;
  sku: string;
  category: string;
  fabric: string;
  gsm: string;
  fit: string;
  basePrice: string;
  maxPrice: string;
  minOrderQuantity: string;
  defaultQuantity: string;
  shortDescription: string;
  description: string;
  highlights: string;
  badges: string[];
  popularity: string;
  isActive: boolean;
  structure: string;
}

function toForm(product: AdminCustomWearProduct | null): FormState {
  const structure = product
    ? Object.fromEntries(CW_STRUCTURED_KEYS.map((key) => [key, product[key] ?? null]))
    : EMPTY_STRUCTURE;
  return {
    name: product?.name ?? '',
    slug: product?.slug ?? '',
    sku: product?.sku ?? '',
    category: product?.category ?? CW_CATEGORIES[0].id,
    fabric: product?.fabric ?? '',
    gsm: product?.gsm != null ? String(product.gsm) : '',
    fit: product?.fit ?? '',
    basePrice: product ? String(paiseToRupees(product.basePricePaise)) : '',
    maxPrice: product?.maxPricePaise != null ? String(paiseToRupees(product.maxPricePaise)) : '',
    minOrderQuantity: String(product?.minOrderQuantity ?? 1),
    defaultQuantity: product?.defaultQuantity != null ? String(product.defaultQuantity) : '',
    shortDescription: product?.shortDescription ?? '',
    description: product?.description ?? '',
    highlights: (product?.highlights ?? []).join('\n'),
    badges: product?.badges ?? [],
    popularity: String(product?.popularity ?? 0),
    isActive: product?.isActive ?? true,
    structure: JSON.stringify(structure, null, 2),
  };
}

const ProductEditor: React.FC<{
  product: AdminCustomWearProduct | null;
  onSaved: (product: AdminCustomWearProduct, message: string) => void;
  onClose: () => void;
}> = ({ product, onSaved, onClose }) => {
  const [form, setForm] = useState<FormState>(() => toForm(product));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    let structure: Record<string, unknown>;
    try {
      structure = JSON.parse(form.structure || '{}');
      if (!structure || typeof structure !== 'object' || Array.isArray(structure)) throw new Error();
    } catch {
      setError('The structured details are not valid JSON.');
      return;
    }
    const category = CW_CATEGORIES.find((c) => c.id === form.category) ?? CW_CATEGORIES[0];
    const base: Partial<CustomWearProductInput> = product ? productToInput(product) : {};
    const input = {
      ...base,
      ...EMPTY_STRUCTURE,
      ...structure,
      name: form.name.trim(),
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
      sku: form.sku.trim(),
      category: category.id,
      gender: category.gender,
      productType: category.productType,
      fabric: form.fabric || null,
      gsm: form.gsm.trim() ? Number(form.gsm) : null,
      fit: form.fit.trim() || null,
      basePricePaise: rupeesToPaise(Number(form.basePrice) || 0),
      maxPricePaise: form.maxPrice.trim() ? rupeesToPaise(Number(form.maxPrice)) : null,
      currency: base.currency ?? 'INR',
      minOrderQuantity: Number(form.minOrderQuantity) || 1,
      defaultQuantity: form.defaultQuantity.trim() ? Number(form.defaultQuantity) : null,
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      highlights: form.highlights
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      badges: form.badges,
      popularity: Number(form.popularity) || 0,
      rating: base.rating ?? 0,
      reviewCount: base.reviewCount ?? 0,
      isActive: form.isActive,
    } as CustomWearProductInput;
    setSaving(true);
    try {
      const saved = await saveCustomWearProduct(product?.id ?? null, input);
      onSaved(saved, product ? `${saved.name} saved.` : `${saved.name} created.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-card" onSubmit={submit} aria-label={product ? `Edit ${product.name}` : 'New product'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: 'var(--a-text)' }}>
          {product ? `Edit ${product.name}` : 'New custom wear product'}
        </h2>
        <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSaving}>
          Close
        </button>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 12 }}>
          <span>{error}</span>
        </div>
      )}

      <div style={grid}>
        <label>
          <span style={labelStyle}>Name *</span>
          <input required maxLength={200} value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>
          <span style={labelStyle}>SKU *</span>
          <input required maxLength={80} value={form.sku} onChange={(e) => set('sku', e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>
          <span style={labelStyle}>Slug</span>
          <input
            maxLength={160}
            value={form.slug}
            placeholder={product ? undefined : 'From the name'}
            onChange={(e) => set('slug', e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <div style={grid}>
        <label>
          <span style={labelStyle}>Category *</span>
          <select value={form.category} onChange={(e) => set('category', e.target.value)} style={{ width: '100%' }}>
            {CW_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Fabric</span>
          <select value={form.fabric} onChange={(e) => set('fabric', e.target.value)} style={{ width: '100%' }}>
            <option value="">—</option>
            {CW_FABRICS.map((fabric) => (
              <option key={fabric} value={fabric}>
                {fabric}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>GSM</span>
          <input type="number" min={50} max={1000} value={form.gsm} onChange={(e) => set('gsm', e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>
          <span style={labelStyle}>Fit</span>
          <input maxLength={80} value={form.fit} onChange={(e) => set('fit', e.target.value)} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={grid}>
        <label>
          <span style={labelStyle}>From price (₹/unit) *</span>
          <input required type="number" min={0} step="0.01" value={form.basePrice} onChange={(e) => set('basePrice', e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>
          <span style={labelStyle}>Up to (₹/unit)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.maxPrice}
            placeholder="Highest tier"
            onChange={(e) => set('maxPrice', e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          <span style={labelStyle}>Minimum order *</span>
          <input required type="number" min={1} value={form.minOrderQuantity} onChange={(e) => set('minOrderQuantity', e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>
          <span style={labelStyle}>Default quantity</span>
          <input type="number" min={1} value={form.defaultQuantity} onChange={(e) => set('defaultQuantity', e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>
          <span style={labelStyle}>Popularity (sort weight)</span>
          <input type="number" min={0} value={form.popularity} onChange={(e) => set('popularity', e.target.value)} style={{ width: '100%' }} />
        </label>
      </div>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={labelStyle}>Short description</span>
        <input maxLength={500} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} style={{ width: '100%' }} />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={labelStyle}>Description</span>
        <textarea rows={4} maxLength={10000} value={form.description} onChange={(e) => set('description', e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={labelStyle}>Highlights (one per line)</span>
        <textarea rows={3} value={form.highlights} onChange={(e) => set('highlights', e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
        <legend style={labelStyle}>Badges</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {CW_BADGES.map((badge) => (
            <label key={badge} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.badges.includes(badge)}
                onChange={(e) =>
                  set(
                    'badges',
                    e.target.checked ? [...form.badges, badge] : form.badges.filter((b) => b !== badge)
                  )
                }
              />
              {badge}
            </label>
          ))}
        </div>
      </fieldset>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={labelStyle}>
          Structured details (JSON, prices in paise): price tiers, colours, sizes, images,
          customisation methods and locations, accordions, description block, size chart, related
          product ids
        </span>
        <textarea
          rows={14}
          spellCheck={false}
          value={form.structure}
          onChange={(e) => set('structure', e.target.value)}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
      </label>

      <div className="admin-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          Live in the custom wear shop
        </label>
        <button type="submit" className="btn btn-primary" disabled={isSaving || !form.name.trim() || !form.sku.trim()}>
          {isSaving ? 'Saving…' : product ? 'Save product' : 'Create product'}
        </button>
      </div>
    </form>
  );
};

export function CustomWearProducts() {
  const [products, setProducts] = useState<AdminCustomWearProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ product: AdminCustomWearProduct | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listCustomWearProducts()
      .then((rows) => !cancelled && setProducts(rows))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);

  const toggle = async (product: AdminCustomWearProduct) => {
    setBusyId(product.id);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveCustomWearProduct(product.id, {
        ...productToInput(product),
        isActive: !product.isActive,
      });
      setNotice(`${saved.name} is ${saved.isActive ? 'live' : 'hidden'}.`);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (product: AdminCustomWearProduct) => {
    if (!window.confirm(`Delete ${product.name}? Hiding it keeps the record and its quotes' link.`)) return;
    setBusyId(product.id);
    setError(null);
    setNotice(null);
    try {
      setNotice(await deleteCustomWearProduct(product.id));
      if (editing?.product?.id === product.id) setEditing(null);
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
          <h1 className="admin-page-title">Custom wear products</h1>
          <p className="admin-page-sub">
            The garments shoppers customise in the studio and ask a quote for.
          </p>
        </div>
        <div className="admin-page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ product: null })}>
            New product
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="admin-alert" role="status" style={{ marginBottom: 16 }}>
          <span>{notice}</span>
        </div>
      )}

      {editing && (
        <div style={{ marginBottom: 16 }}>
          <ProductEditor
            key={editing.product?.id ?? 'new'}
            product={editing.product}
            onClose={() => setEditing(null)}
            onSaved={(saved, message) => {
              setNotice(message);
              setEditing({ product: saved });
              reload();
            }}
          />
        </div>
      )}

      <div className="admin-card admin-index">
        {products === null ? (
          <div className="admin-empty">
            <p className="admin-empty-text">{error ? 'Could not load products.' : 'Loading…'}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">
              <Package size={22} />
            </div>
            <p className="admin-empty-title">No custom wear products yet</p>
            <p className="admin-empty-text">Add a garment to open it for custom printing quotes.</p>
          </div>
        ) : (
          <div className="admin-table-wrap" style={flush}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Category</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    From
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    MOQ
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <span className="admin-row-title">{product.name}</span>
                      <span style={dim}>
                        <code>{product.sku}</code> · /{product.slug}
                      </span>
                    </td>
                    <td>
                      {CW_CATEGORIES.find((c) => c.id === product.category)?.label ?? product.category}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatPaise(product.basePricePaise)}</td>
                    <td style={{ textAlign: 'right' }}>{product.minOrderQuantity}</td>
                    <td>
                      <span className="admin-status-badge" data-status={product.isActive ? 'ACTIVE' : 'NEUTRAL'}>
                        {product.isActive ? 'Live' : 'Hidden'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(product.updatedAt)}</td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" className="btn btn-sm" onClick={() => setEditing({ product })}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busyId === product.id}
                          onClick={() => void toggle(product)}
                        >
                          {product.isActive ? 'Hide' : 'Publish'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ color: 'var(--a-bad)' }}
                          disabled={busyId === product.id}
                          onClick={() => void remove(product)}
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
    </div>
  );
}
