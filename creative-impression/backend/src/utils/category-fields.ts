import type { CategoryFieldType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { CategoryExtras, SpecColumn } from '@/utils/product-spec';

/**
 * Product fields an admin adds to a category from the console.
 *
 * Electronics › Television › LED TV: a field defined on Television (screen
 * size, smart TV) applies to every product filed under Television or any
 * category below it. They become attribute columns, the same shape as a
 * listing template's, so the form, the validator, the storefront filters and
 * the spec table treat them exactly like template attributes.
 *
 * The pure helpers (chain walking, merging, the column shape, the key and
 * input checks) are separate from the database loader so they can be tested
 * without one.
 */

export interface FieldRow {
  id: string;
  categoryId: string;
  key: string;
  label: string;
  type: CategoryFieldType;
  options: string[];
  unit: string | null;
  helpText: string | null;
  required: boolean;
  filterable: boolean;
  displayOrder: number;
}

/** A category with what this module needs of it. */
export interface FieldCategory {
  id: string;
  name: string;
  parentId: string | null;
  optionLabel: string | null;
  optionValues: string[];
  fields: FieldRow[];
}

export interface EffectiveField extends FieldRow {
  /** The category that defines it: this one, or an ancestor. */
  definedBy: { id: string; name: string };
  inherited: boolean;
}

export const FIELD_TYPES: CategoryFieldType[] = ['TEXT', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'BOOLEAN'];

/** The listing catalogue's `kind` for each field type. */
const KIND: Record<CategoryFieldType, string> = {
  TEXT: 'text',
  NUMBER: 'number',
  SELECT: 'select',
  MULTI_SELECT: 'multiselect',
  BOOLEAN: 'boolean',
};

/**
 * The category and its ancestors, root first. A parent that is missing ends
 * the walk, and a loop written by hand in the database cannot spin forever.
 */
export function ancestorChain<T extends { id: string; parentId: string | null }>(rows: T[], id: string | null | undefined): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: T[] = [];
  const seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/**
 * Fields of a root-first chain: ancestors' first, each category's in display
 * order. When two define one key the nearer category wins, in its own place.
 */
export function mergeFields(chain: FieldCategory[]): EffectiveField[] {
  const self = chain[chain.length - 1]?.id;
  const byKey = new Map<string, EffectiveField>();
  for (const category of chain) {
    const own = [...category.fields].sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));
    for (const field of own) {
      byKey.delete(field.key);
      byKey.set(field.key, {
        ...field,
        definedBy: { id: category.id, name: category.name },
        inherited: category.id !== self,
      });
    }
  }
  return [...byKey.values()];
}

/** The nearest variant option name and the nearest suggested values. */
export function mergeOption(chain: FieldCategory[]): {
  optionLabel: string | null;
  optionValues: string[];
  labelFrom: { id: string; name: string } | null;
  valuesFrom: { id: string; name: string } | null;
} {
  const nearest = [...chain].reverse();
  const label = nearest.find((c) => c.optionLabel?.trim());
  const values = nearest.find((c) => c.optionValues.length > 0);
  return {
    optionLabel: label?.optionLabel?.trim() ?? null,
    optionValues: values?.optionValues ?? [],
    labelFrom: label ? { id: label.id, name: label.name } : null,
    valuesFrom: values ? { id: values.id, name: values.name } : null,
  };
}

/** A field as a listing-catalogue attribute column. */
export function fieldColumn(field: EffectiveField): SpecColumn {
  return {
    key: field.key,
    header: field.label,
    label: field.label,
    group: 'discoverability',
    required: field.required,
    kind: KIND[field.type],
    scope: 'attribute',
    filterable: field.filterable,
    ...(field.type === 'SELECT' || field.type === 'MULTI_SELECT' ? { values: field.options } : {}),
    ...(field.type === 'BOOLEAN' ? { values: ['Yes', 'No'] } : {}),
    ...(field.unit ? { unit: field.unit } : {}),
    ...(field.helpText ? { helpText: field.helpText } : {}),
    source: { categoryId: field.definedBy.id, categoryName: field.definedBy.name },
  };
}

/** Everything a product in this category gets on top of its template. */
export function extrasFor(rows: FieldCategory[], categoryId: string | null | undefined): CategoryExtras {
  const chain = ancestorChain(rows, categoryId);
  const option = mergeOption(chain);
  return {
    columns: mergeFields(chain).map(fieldColumn),
    optionLabel: option.optionLabel,
    optionValues: option.optionValues,
  };
}

/* ── Admin input ────────────────────────────────────────────────────── */

/**
 * The categories whose fields a product here could meet alongside this one's:
 * its ancestors (whose fields it inherits) and its descendants (which inherit
 * its fields). A key must be unique across all of them, including itself.
 */
export function relatedCategoryIds<T extends { id: string; parentId: string | null }>(rows: T[], id: string): string[] {
  const out = ancestorChain(rows, id).map((r) => r.id);
  const below = [id];
  for (let i = 0; i < below.length; i += 1) {
    for (const row of rows) {
      if (row.parentId === below[i] && !below.includes(row.id)) below.push(row.id);
    }
  }
  return [...new Set([...out, ...below])];
}

/** "Screen size (inch)" → "screenSize". */
export function camelKey(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const key = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  // A key must start with a letter: "4K support" → "field4kSupport".
  return /^[a-z]/.test(key) ? key.slice(0, 60) : `field${key.charAt(0).toUpperCase()}${key.slice(1)}`.slice(0, 60);
}

export const KEY_RE = /^[a-z][a-zA-Z0-9]{0,59}$/;

/** Trim, drop blanks and case-insensitive duplicates; a string may be comma-separated. */
export function cleanOptions(value: unknown): string[] | null {
  const list = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : null;
  if (!list || list.some((v) => typeof v !== 'string' && typeof v !== 'number')) return null;
  const out: string[] = [];
  for (const raw of list) {
    const option = String(raw).trim().replace(/\s+/g, ' ').slice(0, 80);
    if (option && !out.some((o) => o.toLowerCase() === option.toLowerCase())) out.push(option);
  }
  return out;
}

export interface FieldInput {
  key?: string;
  label?: string;
  type?: CategoryFieldType;
  options?: string[];
  unit?: string | null;
  helpText?: string | null;
  required?: boolean;
  filterable?: boolean;
  displayOrder?: number;
}

/**
 * Whitelist and check a field from the console. `current` is the stored
 * field on an update (only what was sent is checked, against the merged
 * result), or null on create, where the key comes from the label if not given.
 */
export function pickFieldInput(
  body: Record<string, unknown>,
  current: FieldInput | null
): { data: FieldInput; errors: string[] } {
  const data: FieldInput = {};
  const errors: string[] = [];
  const sent = (key: string) => body[key] !== undefined;

  if (!current || sent('label')) {
    const label = typeof body.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
    if (!label || label.length > 60) errors.push('Name the field (at most 60 characters)');
    else data.label = label;
  }
  if (!current) {
    const key = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : camelKey(data.label ?? '');
    if (!KEY_RE.test(key)) errors.push('key must be camelCase letters and digits, starting with a letter');
    else data.key = key;
  } else if (sent('key') && body.key !== current.key) {
    // Renaming the key would orphan every value already saved under it.
    errors.push('A field key cannot be changed once created; delete the field and add a new one');
  }
  if (!current || sent('type')) {
    const type = body.type ?? 'TEXT';
    if (!FIELD_TYPES.includes(type as CategoryFieldType)) errors.push(`type must be one of ${FIELD_TYPES.join(', ')}`);
    else data.type = type as CategoryFieldType;
  }
  if (!current || sent('options')) {
    const options = body.options === undefined || body.options === null ? [] : cleanOptions(body.options);
    if (!options) errors.push('options must be a list of values');
    else if (options.length > 100) errors.push('A field can offer at most 100 options');
    else data.options = options;
  }
  for (const field of ['unit', 'helpText'] as const) {
    if (!sent(field)) continue;
    const value = body[field];
    if (value === null || value === '') data[field] = null;
    else if (typeof value !== 'string') errors.push(`${field} must be text`);
    else data[field] = value.trim().slice(0, field === 'unit' ? 20 : 200) || null;
  }
  for (const flag of ['required', 'filterable'] as const) {
    if (!sent(flag)) continue;
    if (typeof body[flag] !== 'boolean') errors.push(`${flag} must be true or false`);
    else data[flag] = body[flag] as boolean;
  }
  if (sent('displayOrder')) {
    const n = Number(body.displayOrder);
    if (!Number.isInteger(n) || n < 0 || n > 10000) errors.push('displayOrder must be a whole number');
    else data.displayOrder = n;
  }

  // The rules that depend on the type, checked on the merged result.
  const type = data.type ?? current?.type ?? 'TEXT';
  const options = data.options ?? current?.options ?? [];
  if ((type === 'SELECT' || type === 'MULTI_SELECT') && options.length === 0) {
    errors.push('A list field needs at least one option');
  }
  if (type !== 'SELECT' && type !== 'MULTI_SELECT') {
    // Options mean nothing to a number, text or yes/no field.
    if (options.length) data.options = [];
  }
  if (type !== 'NUMBER' && (data.unit ?? current?.unit)) data.unit = null;
  return { data, errors };
}

/* ── Database ───────────────────────────────────────────────────────── */

/**
 * Every category with its fields, in one round trip. The table is a few dozen
 * rows and is read on every category page and product save, so it is kept for
 * a few seconds; the console's own writes drop it at once.
 */
const TTL_MS = 10_000;
let cache: { at: number; rows: Promise<FieldCategory[]> } | null = null;

export function invalidateCategoryFields(): void {
  cache = null;
}

export function loadFieldCategories(): Promise<FieldCategory[]> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const rows = prisma.category.findMany({
      select: {
        id: true,
        name: true,
        parentId: true,
        optionLabel: true,
        optionValues: true,
        fields: true,
      },
    });
    cache = { at: Date.now(), rows };
    rows.catch(() => {
      cache = null;
    });
  }
  return cache.rows;
}

/** The fields products in this category get: its own and every ancestor's. */
export async function effectiveFields(categoryId: string | null | undefined): Promise<EffectiveField[]> {
  if (!categoryId) return [];
  return mergeFields(ancestorChain(await loadFieldCategories(), categoryId));
}

/** The nearest variant option name and suggested values up the chain. */
export async function effectiveOption(categoryId: string | null | undefined) {
  return mergeOption(ancestorChain(categoryId ? await loadFieldCategories() : [], categoryId));
}

/** Columns and option for a category, ready for product-spec. */
export async function categoryExtras(categoryId: string | null | undefined): Promise<CategoryExtras> {
  if (!categoryId) return { columns: [], optionLabel: null, optionValues: [] };
  return extrasFor(await loadFieldCategories(), categoryId);
}

/** Only the attribute columns, for the product write routes. */
export async function categoryColumns(categoryId: unknown): Promise<SpecColumn[]> {
  return typeof categoryId === 'string' && categoryId ? (await categoryExtras(categoryId)).columns : [];
}
