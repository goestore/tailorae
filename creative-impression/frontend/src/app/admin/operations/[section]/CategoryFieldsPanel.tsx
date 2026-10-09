'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  FIELD_TYPE_LABELS,
  createCategoryField,
  deleteCategoryField,
  getCategoryFields,
  reorderCategoryFields,
  saveCategoryOption,
  updateCategoryField,
  type CategoryField,
  type CategoryFieldInput,
  type CategoryFieldType,
  type CategoryFieldsView,
} from '@/lib/admin-category-fields';

/**
 * The category's product fields and variant option, edited without code.
 *
 * Fields defined here are asked of every product listed in this category and
 * every subcategory below it, on top of the listing template's: Television
 * gets "Screen size" and "Smart TV", and LED TV inherits both. Filterable ones
 * become filters on the category page; all of them appear in the product
 * page's specification table. Inherited fields are shown read-only with the
 * category that defines them — edit them there.
 *
 * Saved field by field, independently of the category form around it.
 */

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--admin-text-2)',
  fontSize: 13,
  letterSpacing: '-0.005em',
};

const hintStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 4,
  color: 'var(--admin-text-3, var(--admin-text-2))',
  fontSize: 12,
};

const boxStyle: React.CSSProperties = {
  margin: '0 0 12px',
  padding: '12px 14px',
  border: '1px solid var(--admin-border, rgba(127,127,127,0.25))',
  borderRadius: 10,
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 12,
  marginBottom: 12,
};

const listRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 0',
  borderTop: '1px solid var(--admin-border, rgba(127,127,127,0.18))',
  flexWrap: 'wrap',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--a-neutral-bg, rgba(127,127,127,0.12))',
  color: 'var(--admin-text-2)',
  fontSize: 12,
};

const fieldStyle: React.CSSProperties = { width: '100%' };

/** "32 inch, 43 inch" → list, trimmed and de-duplicated. */
const splitList = (text: string): string[] => {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const value = raw.trim();
    if (value && !out.some((o) => o.toLowerCase() === value.toLowerCase())) out.push(value);
  }
  return out;
};

const hasOptions = (type: CategoryFieldType) => type === 'SELECT' || type === 'MULTI_SELECT';

/** One line describing a field: type, options or unit, flags. */
const summary = (field: CategoryField): string =>
  [
    FIELD_TYPE_LABELS[field.type],
    hasOptions(field.type) ? field.options.join(', ') : '',
    field.type === 'NUMBER' && field.unit ? `in ${field.unit}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

interface DraftField {
  label: string;
  key: string;
  type: CategoryFieldType;
  options: string;
  unit: string;
  helpText: string;
  required: boolean;
  filterable: boolean;
}

const EMPTY: DraftField = {
  label: '',
  key: '',
  type: 'TEXT',
  options: '',
  unit: '',
  helpText: '',
  required: false,
  filterable: false,
};

const draftOf = (field: CategoryField): DraftField => ({
  label: field.label,
  key: field.key,
  type: field.type,
  options: field.options.join(', '),
  unit: field.unit ?? '',
  helpText: field.helpText ?? '',
  required: field.required,
  filterable: field.filterable,
});

/** The add / edit form for one field. */
const FieldForm: React.FC<{
  initial: DraftField;
  isNew: boolean;
  templateKeys: Map<string, string>;
  busy: boolean;
  onSave: (draft: DraftField) => void;
  onCancel: () => void;
}> = ({ initial, isNew, templateKeys, busy, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof DraftField>(key: K, value: DraftField[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const options = splitList(draft.options);
  const overrides = draft.key ? templateKeys.get(draft.key) : undefined;
  const invalid =
    !draft.label.trim() || draft.label.trim().length > 60 || (hasOptions(draft.type) && options.length === 0);
  const submitOnEnter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!invalid && !busy) onSave(draft);
    }
  };

  return (
    <div style={{ ...boxStyle, background: 'var(--a-surface-2, transparent)' }} onKeyDown={submitOnEnter}>
      <div style={rowStyle}>
        <label>
          <span style={labelStyle}>Field name</span>
          <input
            autoFocus
            maxLength={60}
            value={draft.label}
            placeholder="e.g. Screen size"
            onChange={(event) => set('label', event.target.value)}
            style={fieldStyle}
          />
        </label>
        <label>
          <span style={labelStyle}>Type</span>
          <select
            value={draft.type}
            onChange={(event) => set('type', event.target.value as CategoryFieldType)}
            style={fieldStyle}
          >
            {(Object.keys(FIELD_TYPE_LABELS) as CategoryFieldType[]).map((type) => (
              <option key={type} value={type}>
                {FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isNew && (
        <div style={{ marginBottom: 12 }}>
          <label>
            <span style={labelStyle}>Key (optional)</span>
            <input
              maxLength={60}
              value={draft.key}
              placeholder="Made from the name, e.g. screenSize"
              pattern="[a-z][a-zA-Z0-9]*"
              onChange={(event) => set('key', event.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
              style={fieldStyle}
            />
          </label>
          <span style={hintStyle}>
            {overrides
              ? `Replaces the template's own “${overrides}” field for products here.`
              : 'How the value is stored and appears in filter links. It cannot be changed later.'}
          </span>
        </div>
      )}

      {hasOptions(draft.type) && (
        <div style={{ marginBottom: 12 }}>
          <label>
            <span style={labelStyle}>Options</span>
            <input
              value={draft.options}
              placeholder="32 inch, 43 inch, 55 inch, 65 inch"
              onChange={(event) => set('options', event.target.value)}
              style={fieldStyle}
            />
          </label>
          <span style={hintStyle}>Separate with commas. Sellers pick from these.</span>
          {options.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {options.map((option) => (
                <span key={option} style={chipStyle}>
                  {option}
                  <button
                    type="button"
                    aria-label={`Remove ${option}`}
                    className="admin-icon-btn"
                    style={{ padding: 0, minWidth: 0, height: 'auto', background: 'none', border: 0 }}
                    onClick={() => set('options', options.filter((o) => o !== option).join(', '))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={rowStyle}>
        {draft.type === 'NUMBER' && (
          <label>
            <span style={labelStyle}>Unit</span>
            <input
              maxLength={20}
              value={draft.unit}
              placeholder="e.g. inch, Hz, L"
              onChange={(event) => set('unit', event.target.value)}
              style={fieldStyle}
            />
          </label>
        )}
        <label>
          <span style={labelStyle}>Help text</span>
          <input
            maxLength={200}
            value={draft.helpText}
            placeholder="Shown to sellers under the field"
            onChange={(event) => set('helpText', event.target.value)}
            style={fieldStyle}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
        {(
          [
            ['required', 'Required to go live'],
            ['filterable', 'Shoppers can filter by it'],
          ] as const
        ).map(([key, text]) => (
          <label
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--admin-text-2)', fontSize: 12.5 }}
          >
            <input type="checkbox" checked={draft[key]} onChange={(event) => set(key, event.target.checked)} />
            {text}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || invalid}
          onClick={() => onSave(draft)}
        >
          {busy ? 'Saving…' : isNew ? 'Add field' : 'Save field'}
        </button>
      </div>
    </div>
  );
};

export const CategoryFieldsPanel: React.FC<{ categoryId: string }> = ({ categoryId }) => {
  const [view, setView] = useState<CategoryFieldsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [optionLabel, setOptionLabel] = useState('');
  const [optionValues, setOptionValues] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await getCategoryFields(categoryId);
      setView(next);
      setOptionLabel(next.category.optionLabel ?? '');
      setOptionValues(next.category.optionValues.join(', '));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(message);
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveField = (draft: DraftField, field: CategoryField | null) => {
    const input: CategoryFieldInput = {
      label: draft.label.trim(),
      type: draft.type,
      options: hasOptions(draft.type) ? splitList(draft.options) : [],
      unit: draft.type === 'NUMBER' ? draft.unit.trim() || null : null,
      helpText: draft.helpText.trim() || null,
      required: draft.required,
      filterable: draft.filterable,
    };
    if (!field && draft.key.trim()) input.key = draft.key.trim();
    void run(
      () => (field ? updateCategoryField(categoryId, field.id, input) : createCategoryField(categoryId, input)),
      field ? `${input.label} saved.` : `${input.label} added.`
    );
  };

  const move = (index: number, by: -1 | 1) => {
    if (!view) return;
    const ids = view.fields.map((f) => f.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => reorderCategoryFields(categoryId, ids), 'Order saved.');
  };

  const remove = (field: CategoryField) => {
    if (!window.confirm(`Delete “${field.label}”? Products keep the values they already have, but sellers and shoppers will no longer see it.`)) return;
    void run(() => deleteCategoryField(categoryId, field.id), `${field.label} deleted.`);
  };

  const saveOption = () =>
    void run(
      () =>
        saveCategoryOption(categoryId, {
          optionLabel: optionLabel.trim() || null,
          optionValues: splitList(optionValues),
        }),
      'Variant option saved.'
    );

  if (!view) {
    return (
      <div className="admin-card" style={{ maxWidth: 600, width: '100%', marginTop: 12 }}>
        <p className="admin-kpi-label">Product fields</p>
        {error ? (
          <div className="admin-alert admin-alert--warn">
            <span>{error}</span>
          </div>
        ) : (
          <p className="admin-kpi-sub">Loading…</p>
        )}
      </div>
    );
  }

  const templateKeys = new Map((view.template?.attributes ?? []).map((a) => [a.key, a.label]));
  const inheritedOption = view.inheritedOption;
  const fallbackLabel = inheritedOption.optionLabel ?? view.template?.optionLabel ?? 'Variant';
  const apparel = view.template?.family === 'apparel';

  return (
    <div className="admin-card" style={{ maxWidth: 600, width: '100%', marginTop: 12 }}>
      <p className="admin-kpi-label">Product fields</p>
      <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
        What sellers fill in for products in {view.category.name} and every subcategory under it, on
        top of the {view.template ? `${view.template.articleType} template` : 'General product template'}.
        Filterable fields become filters on the category page; all of them show in the product&rsquo;s
        specifications.
      </p>

      {error && (
        <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <p role="status" style={{ ...hintStyle, marginBottom: 12 }}>
          {notice}
        </p>
      )}

      {view.inherited.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>Inherited</span>
          {view.inherited.map((field) => (
            <div key={field.id} style={{ ...listRowStyle, opacity: 0.8 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <strong style={{ fontSize: 13.5 }}>{field.label}</strong>
                <span style={hintStyle}>{summary(field)}</span>
              </div>
              {field.required && <span style={chipStyle}>Required</span>}
              {field.filterable && <span style={chipStyle}>Filter</span>}
              <span style={chipStyle}>from {field.definedBy.name}</span>
            </div>
          ))}
        </div>
      )}

      <span style={labelStyle}>{view.inherited.length ? 'This category' : 'Fields'}</span>
      {view.fields.length === 0 && editing !== 'new' && (
        <p style={{ ...hintStyle, marginBottom: 8 }}>
          No fields yet. Add one, e.g. “Screen size” with 32, 43, 55 and 65 inch.
        </p>
      )}
      {view.fields.map((field, index) =>
        editing === field.id ? (
          <FieldForm
            key={field.id}
            initial={draftOf(field)}
            isNew={false}
            templateKeys={templateKeys}
            busy={busy}
            onSave={(draft) => saveField(draft, field)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div key={field.id} style={listRowStyle}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong style={{ fontSize: 13.5 }}>{field.label}</strong>
              <span style={hintStyle}>
                {summary(field)}
                {templateKeys.has(field.key) ? ' · replaces the template field' : ''}
              </span>
            </div>
            {field.required && <span style={chipStyle}>Required</span>}
            {field.filterable && <span style={chipStyle}>Filter</span>}
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`Move ${field.label} up`}
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`Move ${field.label} down`}
                disabled={busy || index === view.fields.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy || editing !== null}
                onClick={() => setEditing(field.id)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => remove(field)}
              >
                Delete
              </button>
            </div>
          </div>
        )
      )}
      {editing === 'new' ? (
        <FieldForm
          initial={EMPTY}
          isNew
          templateKeys={templateKeys}
          busy={busy}
          onSave={(draft) => saveField(draft, null)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: 8, marginBottom: 16 }}
          disabled={busy || editing !== null}
          onClick={() => setEditing('new')}
        >
          + Add field
        </button>
      )}

      <div style={{ ...boxStyle, marginTop: 4 }}>
        <span style={{ ...labelStyle, fontWeight: 600 }}>Variant option</span>
        {apparel ? (
          <span style={hintStyle}>
            Clothing is sold by size from the {view.template?.articleType} size chart, so this does not
            apply here.
          </span>
        ) : (
          <>
            <div style={rowStyle}>
              <label>
                <span style={labelStyle}>Option name</span>
                <input
                  maxLength={40}
                  value={optionLabel}
                  placeholder={`Inherit — ${fallbackLabel}`}
                  onChange={(event) => setOptionLabel(event.target.value)}
                  style={fieldStyle}
                />
              </label>
              <label>
                <span style={labelStyle}>Suggested values</span>
                <input
                  value={optionValues}
                  placeholder={
                    inheritedOption.optionValues.length
                      ? `Inherit — ${inheritedOption.optionValues.join(', ')}`
                      : 'e.g. 32 inch, 43 inch'
                  }
                  onChange={(event) => setOptionValues(event.target.value)}
                  style={fieldStyle}
                />
              </label>
            </div>
            <span style={hintStyle}>
              What each sellable version of a product is called (&ldquo;Model&rdquo;,
              &ldquo;Capacity&rdquo;), with values offered as one-click picks; sellers can still type
              others. Empty inherits from the parent.
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={saveOption}>
                Save variant option
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
