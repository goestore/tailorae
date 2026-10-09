import { canonicalFamily } from '@/utils/colour-families';
import catalogue from '@/config/myntra-catalogue.json';
import generalCatalogue from '@/config/general-catalogue.json';
import { HttpError } from '@/utils/helpers';

/**
 * What a marketplace listing must contain, per article type.
 *
 * The apparel rules come from Myntra's own SKU templates (see
 * scripts/build-myntra-catalogue.ts): every column, whether it is mandatory,
 * and its dropdown options. Everything that is not clothing (footwear,
 * electronics, home…) comes from the hand-written general-catalogue.json,
 * which uses the same shape. The listing form reads the merged catalogue, so
 * the form, this validator and the Myntra export can never disagree about what
 * a Dress — or a pair of shoes — needs.
 *
 * Two jobs:
 *  - validate values as they are saved (a select must be one of Myntra's
 *    options, an attribute must belong to the article type);
 *  - say what is still missing before a product may go live. Drafts can be
 *    incomplete; ACTIVE cannot.
 */

export type Scope = 'product' | 'variant' | 'attribute' | 'measurement' | 'image' | 'ignore';

export interface SpecColumn {
  key: string;
  header: string;
  label: string;
  group: 'business' | 'discoverability' | 'sizing' | 'imagery';
  required: boolean;
  kind: string;
  scope: Scope;
  field?: string;
  options?: string;
  /** Other measurement keys that satisfy this one (bust or chest). */
  anyOf?: string[];
  /** An attribute shoppers can filter the storefront by. */
  filterable?: boolean;
  /**
   * Inline dropdown values. Template columns name a list in `options`; a
   * field an admin added to a category carries its own (see
   * utils/category-fields.ts).
   */
  values?: string[];
  /** Shown after a number: "inch", "Hz". */
  unit?: string;
  helpText?: string;
  /** The category that defines this column, when it is not the template's. */
  source?: { categoryId: string; categoryName: string };
}

/**
 * What a product's category adds on top of its template: the admin-defined
 * fields of the category and its ancestors, as attribute columns, and the
 * variant option name and suggested values. Empty for a category with none.
 */
export interface CategoryExtras {
  columns: SpecColumn[];
  optionLabel: string | null;
  optionValues: string[];
}

/**
 * The template's columns with the category's fields laid over them. A
 * category field with a template attribute's key replaces it (the admin is
 * deliberately overriding, e.g. a stricter list of connectivity options);
 * the rest are appended after the template's attributes.
 */
export function withCategoryColumns(columns: SpecColumn[], extra: SpecColumn[] = []): SpecColumn[] {
  if (extra.length === 0) return columns;
  const byKey = new Map(extra.map((c) => [c.key, c]));
  const merged = columns.map((c) => (c.scope === 'attribute' && byKey.has(c.key) ? byKey.get(c.key)! : c));
  const used = new Set(merged.map((c) => c.key));
  const lastAttribute = merged.map((c) => c.scope).lastIndexOf('attribute');
  const rest = extra.filter((c) => !used.has(c.key));
  merged.splice(lastAttribute < 0 ? merged.length : lastAttribute + 1, 0, ...rest);
  return merged;
}

/**
 * `apparel` templates carry a size chart, measurements and a look shot;
 * `general` ones (footwear, electronics…) have none of that, and name their
 * one variant option themselves ("UK size", "Variant").
 */
export type TemplateFamily = 'apparel' | 'general';

interface ArticleTypeSpec {
  articleType: string;
  slug: string;
  template: string;
  sourceFile: string;
  family: TemplateFamily;
  /** What the variant `size` column holds, as shoppers read it. */
  optionLabel: string;
  sizes?: string;
  columns: SpecColumn[];
}

type CatalogueFile = {
  articleTypes: Array<Omit<ArticleTypeSpec, 'family' | 'optionLabel'> & Partial<ArticleTypeSpec>>;
  lists: Record<string, string[]>;
};

const MYNTRA = catalogue as unknown as CatalogueFile;
const GENERAL = generalCatalogue as unknown as CatalogueFile;

/**
 * Lists the general templates borrow from Myntra's rather than copy: the
 * country, colour and age-group dropdowns are the same everywhere, and a copy
 * would drift the day the Myntra catalogue is regenerated.
 */
const borrowedList = (key: string): string[] => {
  const optionsKey = MYNTRA.articleTypes[0]?.columns.find((c) => c.key === key)?.options;
  return optionsKey ? MYNTRA.lists[optionsKey] ?? [] : [];
};

const CATALOGUE: { articleTypes: ArticleTypeSpec[]; lists: Record<string, string[]> } = {
  articleTypes: [
    ...MYNTRA.articleTypes.map((t) => ({ ...t, family: 'apparel' as const, optionLabel: 'Size' })),
    ...GENERAL.articleTypes.map((t) => ({
      ...t,
      family: (t.family ?? 'general') as TemplateFamily,
      optionLabel: t.optionLabel ?? 'Size',
    })),
  ],
  lists: {
    ...MYNTRA.lists,
    countries: borrowedList('countryOfOrigin'),
    colours: borrowedList('prominentColour'),
    ageGroups: borrowedList('ageGroup'),
    ...GENERAL.lists,
  },
};

/**
 * Where Myntra's yellow cells overstate what a listing needs.
 *
 * Every top-wear template marks both bust and chest mandatory, because bust
 * is how women's garments are measured and chest is how men's and kids' are.
 * A seller fills one, so either satisfies the pair.
 */
const EITHER_OR_MEASUREMENTS = [
  ['bustIn', 'chestIn'],
  ['toFitBustIn', 'toFitChestIn'],
];
/**
 * Marked mandatory, but small brands often have no barcodes, and Myntra
 * accepts sheets without them. Still validated and exported when given.
 */
const OPTIONAL_TO_GO_LIVE = ['gtin'];

for (const spec of CATALOGUE.articleTypes) {
  for (const column of spec.columns) {
    if (OPTIONAL_TO_GO_LIVE.includes(column.key)) column.required = false;
    if (column.scope !== 'measurement') continue;
    const pair = EITHER_OR_MEASUREMENTS.find((keys) => keys.includes(column.key));
    const others = pair?.filter(
      (key) => key !== column.key && spec.columns.some((c) => c.key === key && c.scope === 'measurement')
    );
    if (others?.length) column.anyOf = others;
  }
}

/** Every attribute key some template defines (versus one an admin added). */
const TEMPLATE_ATTRIBUTE_KEYS = new Set(
  CATALOGUE.articleTypes.flatMap((t) => t.columns.filter((c) => c.scope === 'attribute').map((c) => c.key))
);

/** Images every live listing needs, whatever the template marks. */
const ALWAYS_REQUIRED_IMAGES = ['front'];

export interface MissingField {
  key: string;
  label: string;
  group: string;
}

export class LiveCheckError extends HttpError {
  missing: MissingField[];
  constructor(missing: MissingField[]) {
    super(
      409,
      `This listing is not ready to go live: ${missing.length} required field${missing.length === 1 ? ' is' : 's are'} missing. Save it as a draft or fill them in.`
    );
    this.missing = missing;
  }
}

export const isLiveCheckError = (error: unknown): error is LiveCheckError => error instanceof LiveCheckError;

export function listArticleTypes(): Array<{
  articleType: string;
  slug: string;
  family: TemplateFamily;
  optionLabel: string;
  columns: number;
  required: number;
}> {
  return CATALOGUE.articleTypes.map((t) => ({
    articleType: t.articleType,
    slug: t.slug,
    family: t.family,
    optionLabel: t.optionLabel,
    columns: t.columns.filter((c) => c.scope !== 'ignore').length,
    required: requiredColumns(t).length,
  }));
}

/**
 * What the storefront needs to present a product of this type: the name of
 * its variant option, whether it is clothing (size guide), and readable names
 * for its attributes. Null for a legacy product with no article type.
 */
export function templateInfo(
  nameOrSlug: string | null | undefined,
  extras?: CategoryExtras | null
): {
  articleType: string;
  slug: string;
  family: TemplateFamily;
  optionLabel: string;
  attributeLabels: Record<string, string>;
  /** Units of number attributes, so the spec table reads "55 inch". */
  attributeUnits: Record<string, string>;
} | null {
  const spec = findArticleType(nameOrSlug);
  if (!spec) return null;
  const attributes = withCategoryColumns(spec.columns, extras?.columns).filter((c) => c.scope === 'attribute');
  return {
    articleType: spec.articleType,
    slug: spec.slug,
    family: spec.family,
    optionLabel: optionLabelOf(spec, extras),
    attributeLabels: Object.fromEntries(attributes.map((c) => [c.key, c.label])),
    attributeUnits: Object.fromEntries(attributes.filter((c) => c.unit).map((c) => [c.key, c.unit!])),
  };
}

/**
 * The variant option name a category gives its products. Only the general
 * family takes it: clothing sizes are Myntra's size chart, called "Size".
 */
const optionLabelOf = (spec: ArticleTypeSpec, extras?: CategoryExtras | null): string =>
  spec.family === 'general' && extras?.optionLabel ? extras.optionLabel : spec.optionLabel;

/**
 * Every attribute some template marks filterable, with its label and options.
 * The products API only filters on these keys, so a query string cannot probe
 * arbitrary JSON paths.
 */
export interface FilterableAttribute {
  key: string;
  label: string;
  options: string[];
  kind: string;
  unit?: string;
}

export function filterableAttributes(
  templateKey?: string | null,
  extraColumns: SpecColumn[] = []
): FilterableAttribute[] {
  const types = templateKey ? [findArticleType(templateKey)].filter((t): t is ArticleTypeSpec => Boolean(t)) : CATALOGUE.articleTypes;
  const seen = new Map<string, FilterableAttribute>();
  // A category page also filters by the fields its admin marked filterable;
  // listed first, so one with a template attribute's key replaces it.
  const columns = [...extraColumns, ...types.flatMap((type) => type.columns)];
  for (const column of columns) {
    if (column.scope !== 'attribute' || !column.filterable || seen.has(column.key)) continue;
    seen.set(column.key, {
      key: column.key,
      label: column.label,
      options: optionsFor(column),
      kind: column.kind,
      ...(column.unit ? { unit: column.unit } : {}),
    });
  }
  return [...seen.values()];
}

export function findArticleType(nameOrSlug: string | null | undefined): ArticleTypeSpec | null {
  if (!nameOrSlug) return null;
  const needle = nameOrSlug.trim().toLowerCase();
  return (
    CATALOGUE.articleTypes.find((t) => t.articleType.toLowerCase() === needle || t.slug === needle) ?? null
  );
}

/**
 * Every size the templates know, in size-chart order (XS before S, 0-3M
 * before 3-6M), so a size facet reads like a size chart rather than A-Z.
 */
export const SIZE_ORDER: string[] = [
  ...new Set(
    CATALOGUE.articleTypes.flatMap((t) => (t.sizes ? CATALOGUE.lists[t.sizes] ?? [] : []))
  ),
];

export const optionsFor = (column: SpecColumn): string[] =>
  column.values ?? (column.options ? CATALOGUE.lists[column.options] ?? [] : []);

/** True when a column's value must come from a list (template list or inline). */
const hasOptions = (column: SpecColumn): boolean => Boolean(column.options || column.values);

/**
 * The spec the listing form renders: columns with their options resolved.
 * Given the chosen category's extras, its fields join the attributes and its
 * variant option name and suggested values replace the template's.
 */
export function getArticleSpec(nameOrSlug: string, extras?: CategoryExtras | null) {
  const spec = findArticleType(nameOrSlug);
  if (!spec) return null;
  return {
    articleType: spec.articleType,
    slug: spec.slug,
    family: spec.family,
    optionLabel: optionLabelOf(spec, extras),
    sizes: spec.sizes ? CATALOGUE.lists[spec.sizes] : [],
    // No list means the seller types the option values ("128 GB", "Large").
    freeOptions: !spec.sizes,
    // Quick picks for a free option ("32 inch", "43 inch"); others may be typed.
    optionValues: !spec.sizes && spec.family === 'general' ? (extras?.optionValues ?? []) : [],
    columns: withCategoryColumns(spec.columns, extras?.columns)
      .filter((c) => c.scope !== 'ignore')
      .map(({ values: _values, ...c }) => ({
        ...c,
        options: c.options || _values ? optionsFor({ ...c, values: _values }) : undefined,
      })),
  };
}

function requiredColumns(spec: ArticleTypeSpec, extra: SpecColumn[] = []): SpecColumn[] {
  const required = withCategoryColumns(spec.columns, extra).filter(
    (c) => c.scope !== 'ignore' && (c.required || (c.scope === 'image' && ALWAYS_REQUIRED_IMAGES.includes(c.key)))
  );
  // An either-or pair counts once, under its first member.
  return required.filter(
    (c) => !c.anyOf?.some((key) => required.some((r) => r.key === key && required.indexOf(r) < required.indexOf(c)))
  );
}

/* ── Validation of submitted values ─────────────────────────────────── */

/** Case-insensitive match against a dropdown; returns Myntra's own spelling. */
function canonical(value: string, options: string[]): string | null {
  const v = value.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === v) ?? null;
}

const HSN_RE = /^\d{4,8}$/;
const GTIN_RE = /^(\d{8}|\d{12}|\d{13}|\d{14})$/;

/**
 * Check listing values against the article type's dropdowns and rules, and
 * normalise them in place (e.g. "cotton" → "Cotton"). Values for fields the
 * type does not have are allowed through untouched for product columns (they
 * are real columns), but unknown attribute keys are refused.
 */
export function validateListingValues(
  data: Record<string, unknown>,
  articleTypeName: string | null,
  options: ListingValueOptions = {}
): string[] {
  const errors: string[] = [];
  const extra = options.extraColumns ?? [];
  if (data.articleType !== undefined && data.articleType !== null) {
    const spec = findArticleType(String(data.articleType));
    if (!spec) {
      errors.push(`articleType must be one of: ${CATALOGUE.articleTypes.map((t) => t.articleType).join(', ')}`);
      return errors;
    }
    data.articleType = spec.articleType;
  }
  const spec = findArticleType((data.articleType as string | undefined) ?? articleTypeName);

  if (typeof data.hsn === 'string' && data.hsn && !HSN_RE.test(data.hsn)) {
    errors.push('HSN must be 4 to 8 digits');
  }

  if (!spec) {
    // A category's own fields can be filled in without a template.
    if (data.attributes !== undefined && data.attributes !== null) {
      if (extra.length) validateAttributes(data, extra, 'this category', 'the listed options', options, errors);
      else errors.push('Choose an article type before setting attributes');
    }
    return errors;
  }
  // Apparel dropdowns are Myntra's; the general templates' lists are our own.
  const optionsOf = spec.family === 'apparel' ? "Myntra's options" : 'the listed options';

  // Product columns backed by a dropdown.
  for (const column of spec.columns) {
    if (column.scope !== 'product' || !column.field || !column.options) continue;
    const options = optionsFor(column);
    if (column.field.startsWith('countriesOfOrigin.')) continue; // checked below
    const value = data[column.field];
    if (value === undefined || value === null || value === '') continue;
    const match = canonical(String(value), options);
    if (!match) errors.push(`${column.label} must be one of ${optionsOf}`);
    else data[column.field] = column.field === 'year' ? Number(match) : match;
  }

  if (Array.isArray(data.countriesOfOrigin)) {
    const countryColumn = spec.columns.find((c) => c.field === 'countriesOfOrigin.0');
    const options = countryColumn ? optionsFor(countryColumn) : [];
    data.countriesOfOrigin = (data.countriesOfOrigin as string[]).map((country) => {
      const match = options.length ? canonical(country, options) : country;
      if (!match) errors.push(`${country} is not a country Myntra accepts`);
      return match ?? country;
    });
  }

  if (data.attributes !== undefined && data.attributes !== null) {
    validateAttributes(
      data,
      withCategoryColumns(spec.columns, extra),
      spec.articleType,
      optionsOf,
      options,
      errors
    );
  }

  return errors;
}

export interface ListingValueOptions {
  /** The product category's own fields (utils/category-fields.ts). */
  extraColumns?: SpecColumn[];
  /**
   * The attributes as stored. A value whose field the admin has since
   * deleted is kept as it was rather than refused, so re-saving an old
   * listing does not fail on a field nobody can see any more.
   */
  storedAttributes?: unknown;
}

const YES = ['yes', 'true', '1'];
const NO = ['no', 'false', '0'];

function validateAttributes(
  data: Record<string, unknown>,
  columns: SpecColumn[],
  owner: string,
  optionsOf: string,
  options: ListingValueOptions,
  errors: string[]
): void {
  if (typeof data.attributes !== 'object' || Array.isArray(data.attributes)) {
    errors.push('attributes must be an object of field to value');
    return;
  }
  const attrs = data.attributes as Record<string, unknown>;
  const stored = (options.storedAttributes ?? {}) as Record<string, unknown>;
  const known = new Map(columns.filter((c) => c.scope === 'attribute').map((c) => [c.key, c]));
  for (const [key, value] of Object.entries(attrs)) {
    const column = known.get(key);
    if (!column) {
      if (stored && JSON.stringify(stored[key]) === JSON.stringify(value)) continue;
      errors.push(`${key} is not an attribute of ${owner}`);
      continue;
    }
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete attrs[key];
      continue;
    }
    if (column.kind === 'multiselect') {
      // A list, or one string with commas ("HDMI, USB").
      const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
      if (!list || list.some((v) => typeof v !== 'string')) {
        errors.push(`${column.label} must be a list of options`);
        continue;
      }
      const picked: string[] = [];
      for (const item of list as string[]) {
        if (!item.trim()) continue;
        const match = canonical(item, optionsFor(column));
        if (!match) errors.push(`${column.label}: ${item.trim()} is not one of ${optionsOf}`);
        else if (!picked.includes(match)) picked.push(match);
      }
      attrs[key] = picked;
      continue;
    }
    if (column.kind === 'boolean') {
      // Stored as the words a shopper reads, so the spec table and the
      // filter both say "Yes".
      const word = String(value).trim().toLowerCase();
      if (typeof value === 'boolean' ? value : YES.includes(word)) attrs[key] = 'Yes';
      else if (typeof value === 'boolean' ? !value : NO.includes(word)) attrs[key] = 'No';
      else errors.push(`${column.label} must be yes or no`);
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      errors.push(`${column.label} must be text`);
      continue;
    }
    const text = String(value).trim().slice(0, 500);
    if (hasOptions(column)) {
      const match = canonical(text, optionsFor(column));
      if (!match) errors.push(`${column.label} must be one of ${optionsOf}`);
      else attrs[key] = match;
    } else if (column.kind === 'number') {
      // Warranty months, pieces in a set: a whole number, stored as text
      // like every other attribute so the JSON stays one shape.
      const n = Number(text);
      if (!/^\d+(\.\d+)?$/.test(text) || !Number.isFinite(n) || n > 100000) {
        errors.push(`${column.label} must be a number`);
      } else attrs[key] = String(n);
    } else {
      attrs[key] = text;
    }
  }
}

/** Per-size listing values: standard size, label flag, GTIN, measurements. */
export function pickVariantListingFields(
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  if (body.standardSize !== undefined) {
    if (body.standardSize === null || body.standardSize === '') data.standardSize = null;
    else if (typeof body.standardSize !== 'string') errors.push('standardSize must be a string');
    else data.standardSize = body.standardSize.trim().slice(0, 40);
  }
  if (body.sizeOnLabel !== undefined) {
    if (body.sizeOnLabel !== null && typeof body.sizeOnLabel !== 'boolean') errors.push('sizeOnLabel must be true or false');
    else data.sizeOnLabel = body.sizeOnLabel;
  }
  if (body.gtin !== undefined) {
    if (body.gtin === null || body.gtin === '') data.gtin = null;
    else if (typeof body.gtin !== 'string' || !GTIN_RE.test(body.gtin.trim())) {
      errors.push('GTIN must be 8, 12, 13 or 14 digits');
    } else data.gtin = body.gtin.trim();
  }
  if (body.options !== undefined) {
    // A second option beside the size column, e.g. {"Storage": "128 GB"}.
    if (body.options === null) data.options = null;
    else if (typeof body.options !== 'object' || Array.isArray(body.options)) {
      errors.push('options must be an object of option name to value');
    } else {
      const clean: Record<string, string> = {};
      for (const [name, value] of Object.entries(body.options as Record<string, unknown>)) {
        if (value === null || value === '') continue;
        const label = name.trim().slice(0, 40);
        if (!label || (typeof value !== 'string' && typeof value !== 'number')) {
          errors.push(`option ${name} must have a text value`);
        } else clean[label] = String(value).trim().slice(0, 80);
      }
      if (Object.keys(clean).length > 5) errors.push('a variant can carry at most 5 options');
      else data.options = clean;
    }
  }
  // The colour family this colour files under — what storefront filters use.
  // Must be on the fixed list; the write hook normalises its spelling.
  if (body.colorFamily !== undefined) {
    if (body.colorFamily === null || body.colorFamily === '') data.colorFamily = null;
    else if (typeof body.colorFamily !== 'string' || !canonicalFamily(body.colorFamily)) {
      errors.push(`"${String(body.colorFamily)}" is not a colour family`);
    } else data.colorFamily = canonicalFamily(body.colorFamily)!.name;
  }
  if (body.measurements !== undefined) {
    if (body.measurements === null) data.measurements = null;
    else if (typeof body.measurements !== 'object' || Array.isArray(body.measurements)) {
      errors.push('measurements must be an object of numbers');
    } else {
      const clean: Record<string, number> = {};
      for (const [key, value] of Object.entries(body.measurements as Record<string, unknown>)) {
        if (value === null || value === '') continue;
        const n = Number(value);
        if (!/^[a-zA-Z0-9]{1,60}$/.test(key) || !Number.isFinite(n) || n < 0 || n > 200) {
          errors.push(`measurement ${key} must be a number of inches from 0 to 200`);
        } else clean[key] = Math.round(n * 100) / 100;
      }
      data.measurements = clean;
    }
  }
  return { data, errors };
}

/* ── Go-live checklist ──────────────────────────────────────────────── */

export interface ListingSnapshot {
  articleType: string | null;
  name?: string | null;
  sku?: string | null;
  brandId?: string | null;
  description?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  attributes?: unknown;
  imageAngles?: unknown;
  bisCertificate?: unknown;
  countriesOfOrigin?: string[] | null;
  variants: Array<{
    size?: string | null;
    sku?: string | null;
    standardSize?: string | null;
    sizeOnLabel?: boolean | null;
    gtin?: string | null;
    measurements?: unknown;
  }>;
  [field: string]: unknown;
}

const present = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

function productValue(product: ListingSnapshot, field: string): unknown {
  if (field === 'brand') return product.brandId;
  // The style group defaults to the article number, so it is never asked for twice.
  if (field === 'styleGroupId') return product.styleGroupId ?? product.sku;
  if (field === 'price' || field === 'originalPrice') {
    const n = Number(product[field]);
    return n > 0 ? n : null;
  }
  const [head, tail] = field.split('.');
  const value = product[head];
  if (tail === undefined) return value;
  if (Array.isArray(value)) return value[Number(tail)];
  if (value && typeof value === 'object') return (value as Record<string, unknown>)[tail];
  return undefined;
}

/** Everything a live listing of this type still lacks. Empty means ready. */
export function missingForLive(product: ListingSnapshot, extraColumns: SpecColumn[] = []): MissingField[] {
  const spec = findArticleType(product.articleType);
  const missing: MissingField[] = [];
  const add = (column: SpecColumn, label = column.label) =>
    missing.push({ key: column.key, label, group: column.group });

  const attrs = (product.attributes ?? {}) as Record<string, unknown>;
  if (!spec) {
    // No template: only the category's own required fields apply.
    for (const column of extraColumns) if (column.required && !present(attrs[column.key])) add(column);
    return missing;
  }
  const angles = (product.imageAngles ?? {}) as Record<string, unknown>;
  const variants = product.variants ?? [];

  if (variants.length === 0) {
    const noun = spec.family === 'apparel' ? 'size' : spec.optionLabel.toLowerCase();
    missing.push({ key: 'sizes', label: `At least one ${noun}`, group: 'sizing' });
  }
  // A draft may be saved without a selling price (stored as 0); nothing sells
  // at ₹0. Checked here rather than through the ISP column, because some
  // templates have none.
  if (product.price !== undefined && !(Number(product.price) > 0)) {
    missing.push({ key: 'price', label: 'Selling price', group: 'business' });
  }

  for (const column of requiredColumns(spec, extraColumns)) {
    switch (column.scope) {
      case 'product':
        if (column.field && !present(productValue(product, column.field))) add(column);
        break;
      case 'attribute':
        if (!present(attrs[column.key])) add(column);
        break;
      case 'image':
        if (!present(angles[column.key])) add(column);
        break;
      case 'variant': {
        if (variants.length === 0 || !column.field) break;
        const lacking = variants.filter((v) => {
          const value = (v as Record<string, unknown>)[column.field!];
          return column.field === 'sizeOnLabel' ? value === null || value === undefined : !present(value);
        });
        if (lacking.length) add(column, `${column.label} (${lacking.length} size${lacking.length === 1 ? '' : 's'})`);
        break;
      }
      case 'measurement': {
        if (variants.length === 0) break;
        const keys = [column.key, ...(column.anyOf ?? [])];
        const lacking = variants.filter((v) => {
          const m = (v.measurements ?? {}) as Record<string, unknown>;
          return !keys.some((key) => present(m[key]));
        });
        const label = measurementLabel(spec, column);
        if (lacking.length) add(column, `${label} (${lacking.length} size${lacking.length === 1 ? '' : 's'})`);
        break;
      }
      default:
        break;
    }
  }
  return missing;
}

/** "Bust or Chest (in)" for an either-or pair, else the column's own label. */
function measurementLabel(spec: ArticleTypeSpec, column: SpecColumn): string {
  if (!column.anyOf?.length) return column.label;
  const names = [column, ...column.anyOf.map((key) => spec.columns.find((c) => c.key === key))]
    .filter((c): c is SpecColumn => Boolean(c))
    .map((c) => c.label.replace(/\s*\(\s*in(ches)?\s*\)$/i, ''));
  return `${names.join(' or ')} (in)`;
}

/** Throws LiveCheckError when a listing that is about to be ACTIVE is incomplete. */
export function assertReadyToGoLive(product: ListingSnapshot, extraColumns: SpecColumn[] = []): void {
  const missing = missingForLive(product, extraColumns);
  if (missing.length) throw new LiveCheckError(missing);
}

/* ── One call for every route that writes a product ─────────────────── */

const ANGLE_ORDER = ['front', 'back', 'side', 'detail', 'lookShot', 'additional1', 'additional2'];

/**
 * Validate and normalise listing values, then refuse to make an incomplete
 * listing live.
 *
 * `existing` is the product as stored (with its variants), or null on create.
 * Images: when angles are sent, the gallery is rebuilt in Myntra's angle
 * order and the front image becomes the thumbnail, so the two never drift.
 */
export function prepareListingWrite(
  data: Record<string, unknown>,
  existing: (Record<string, unknown> & { variants?: ListingSnapshot['variants'] }) | null,
  extraColumns: SpecColumn[] = []
): string[] {
  const errors = validateListingValues(data, (existing?.articleType as string | null | undefined) ?? null, {
    extraColumns,
    storedAttributes: existing?.attributes,
  });
  if (errors.length) return errors;

  // The form only sends the fields it shows. A value for a category field the
  // admin has since deleted is kept rather than wiped by the next save.
  // Template attributes are not: changing article type clears those on
  // purpose (the form warns which ones).
  if (data.attributes && typeof data.attributes === 'object' && existing?.attributes) {
    const stored = existing.attributes as Record<string, unknown>;
    const shown = new Set(extraColumns.map((c) => c.key));
    const attrs = data.attributes as Record<string, unknown>;
    for (const [key, value] of Object.entries(stored)) {
      if (!shown.has(key) && !TEMPLATE_ATTRIBUTE_KEYS.has(key) && !(key in attrs)) attrs[key] = value;
    }
  }

  if (data.imageAngles && typeof data.imageAngles === 'object') {
    const angles = data.imageAngles as Record<string, string>;
    const ordered = ANGLE_ORDER.map((angle) => angles[angle]).filter(Boolean);
    data.images = ordered;
    data.thumbnail = angles.front ?? ordered[0] ?? null;
  }

  const status = (data.status as string | undefined) ?? (existing?.status as string | undefined);
  if (status === 'ACTIVE') {
    const merged = { ...(existing ?? {}), ...data, variants: existing?.variants ?? [] } as ListingSnapshot;
    assertReadyToGoLive(merged, extraColumns);
  }
  return [];
}
