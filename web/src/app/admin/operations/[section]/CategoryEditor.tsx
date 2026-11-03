'use client';

import React, { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createCategory,
  slugify,
  updateCategory,
  type AdminCategory,
  type CategoryInput,
} from '@/lib/admin-products';
import { listArticleTypes, type ArticleTypeSummary } from '@/lib/catalogue-api';
import { CategoryHomepageSection } from './CategoryHomepageSection';
import { CategoryFieldsPanel } from './CategoryFieldsPanel';

/** Same field and label styles as the other editors in ./editors. */
const fieldStyle: React.CSSProperties = { width: '100%' };

const labelStyle: React.CSSProperties = {
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

const hintStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 4,
  color: 'var(--admin-text-3, var(--admin-text-2))',
  fontSize: 12,
};

/** "↳ Dresses", indented by depth, for the parent picker. */
const indented = (c: AdminCategory) => `${'   '.repeat(c.depth ?? 0)}${c.depth ? '↳ ' : ''}${c.name}`;

/**
 * Create or correct a category.
 *
 * A category is a department in the shop's navigation (top level) or a
 * subcategory under one. Its listing template is what sellers in it fill in —
 * Footwear asks for UK sizes and upper material, Electronics for a model number
 * and warranty — and a subcategory with no template of its own inherits its
 * parent's. The commission rate works the same way; empty means "inherit".
 *
 * The parent picker leaves out this category and everything under it: moving a
 * category inside itself would make a loop (the server refuses it too).
 */
export const CategoryEditor: React.FC<{
  category: AdminCategory | null;
  /** Every category, parents-first, as GET /admin/categories returns them. */
  categories: AdminCategory[];
  /** Pre-selected parent for "Add subcategory". */
  parentId?: string | null;
  onClose: () => void;
  onSaved: (category: AdminCategory, message: string) => void;
}> = ({ category, categories, parentId, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    parentId: category?.parentId ?? parentId ?? '',
    displayOrder: String(category?.displayOrder ?? 0),
    image: category?.image ?? '',
    description: category?.description ?? '',
    listingTemplate: category?.listingTemplate ?? '',
    commissionRate:
      category?.commissionRate === null || category?.commissionRate === undefined
        ? ''
        : String(category.commissionRate),
    isActive: category?.isActive ?? true,
    showOnHome: category?.showOnHome ?? false,
    homeOrder: String(category?.homeOrder ?? 0),
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [types, setTypes] = useState<ArticleTypeSummary[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listArticleTypes()
      .then((rows) => {
        if (!cancelled) setTypes(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** This category and everything nested under it: never a valid parent. */
  const excluded = useMemo(() => {
    const out = new Set<string>();
    if (!category) return out;
    out.add(category.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categories) {
        if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
          out.add(c.id);
          grew = true;
        }
      }
    }
    return out;
  }, [category, categories]);

  const parent = categories.find((c) => c.id === form.parentId);
  const inheritedTemplate = parent?.resolvedTemplate ?? null;
  const inheritedTemplateName = types.find((t) => t.slug === inheritedTemplate)?.articleType;

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const rate = form.commissionRate.trim();
  const rateInvalid = rate !== '' && (!Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (rateInvalid) {
      setError('Commission must be a percentage from 0 to 100, or empty to inherit.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload: CategoryInput = {
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name),
        parentId: form.parentId || null,
        displayOrder: Number(form.displayOrder) || 0,
        image: form.image.trim() || null,
        description: form.description.trim() || null,
        listingTemplate: form.listingTemplate || null,
        commissionRate: rate === '' ? null : Number(rate),
        isActive: form.isActive,
        showOnHome: form.showOnHome,
        homeOrder: Number.parseInt(form.homeOrder, 10) || 0,
      };
      const saved = category
        ? await updateCategory(category.id, payload)
        : await createCategory(payload);
      onSaved(saved, category ? `${saved.name} saved.` : `${saved.name} created.`);
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
      aria-label={category ? `Edit ${category.name}` : 'New category'}
      style={overlayStyle}
    >
      <form className="admin-card" style={{ maxWidth: 600, width: '100%' }} onSubmit={submit}>
        <p className="admin-kpi-label">{category ? 'Edit category' : 'New category'}</p>
        <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
          Top-level categories appear in the shop&rsquo;s navigation with a page of their own.
          The listing template decides what sellers fill in for products here.
        </p>

        {error && (
          <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        )}

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Name</span>
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(event) => {
                set('name', event.target.value);
                if (!slugTouched) set('slug', slugify(event.target.value));
              }}
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Slug</span>
            <input
              maxLength={80}
              value={form.slug}
              pattern="[a-z0-9-]+"
              title="Lowercase letters, digits and hyphens"
              onChange={(event) => {
                setSlugTouched(true);
                set('slug', event.target.value.toLowerCase());
              }}
              style={fieldStyle}
            />
            <span style={hintStyle}>
              {category ? 'Changing it breaks links to /c/' + category.slug : 'The page address: /c/<slug>'}
            </span>
          </label>
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Parent</span>
            <select
              value={form.parentId}
              onChange={(event) => set('parentId', event.target.value)}
              style={fieldStyle}
            >
              <option value="">None — a top-level department</option>
              {categories
                .filter((c) => !excluded.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {indented(c)}
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
              style={fieldStyle}
            />
            <span style={hintStyle}>Lower comes first among its siblings.</span>
          </label>
        </div>

        <div style={rowStyle}>
          <label>
            <span style={labelStyle}>Listing template</span>
            <select
              value={form.listingTemplate}
              onChange={(event) => set('listingTemplate', event.target.value)}
              style={fieldStyle}
            >
              <option value="">
                {inheritedTemplateName ? `Inherit — ${inheritedTemplateName}` : 'None — seller chooses'}
              </option>
              <optgroup label="Clothing (Myntra templates)">
                {types
                  .filter((t) => t.family !== 'general')
                  .map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.articleType}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Other products">
                {types
                  .filter((t) => t.family === 'general')
                  .map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.articleType} — by {t.optionLabel.toLowerCase()}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <label>
            <span style={labelStyle}>Commission %</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              inputMode="decimal"
              value={form.commissionRate}
              placeholder="Inherit"
              aria-invalid={rateInvalid || undefined}
              onChange={(event) => set('commissionRate', event.target.value)}
              style={fieldStyle}
            />
            <span style={hintStyle}>Empty uses the parent&rsquo;s rate, then the default.</span>
          </label>
        </div>

        <CategoryHomepageSection
          value={{ image: form.image, showOnHome: form.showOnHome, homeOrder: form.homeOrder }}
          onChange={(patch) => setForm((previous) => ({ ...previous, ...patch }))}
        />

        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>Description</span>
          <textarea
            rows={2}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 20, marginBottom: 18, flexWrap: 'wrap' }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--admin-text-2)', fontSize: 12.5 }}
          >
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
            />
            Visible in the shop (hiding it also hides its subcategories)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSaving || !form.name.trim()}>
            {isSaving ? 'Saving…' : category ? 'Save category' : 'Create category'}
          </button>
        </div>
      </form>
      {/* Product fields save on their own, so only an existing category has them. */}
      {category && <CategoryFieldsPanel categoryId={category.id} />}
    </div>
  );
};
