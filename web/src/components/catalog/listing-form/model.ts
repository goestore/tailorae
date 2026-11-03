import type { ArticleSpec, MissingField, SpecColumn } from '@/lib/catalogue-api';
import { slugify, suggestVariantSku, type ProductStatus } from '@/lib/admin-products';

/**
 * The listing form's state and the rules that turn it into API calls.
 *
 * Kept free of React so the go-live checklist computed here can be read next
 * to `missingForLive` in backend/src/utils/product-spec.ts: the two must agree
 * on what "ready" means, or Publish would be enabled for a save the server
 * then refuses.
 */

export type FormMode = 'admin' | 'seller';

export const SECTIONS = [
  { id: 'type', label: 'Category & type' },
  { id: 'business', label: 'Business' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'content', label: 'Content' },
  { id: 'sizes', label: 'Sizes & stock' },
  { id: 'images', label: 'Images' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'visibility', label: 'Visibility' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

export const ANGLES = [
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'side', label: 'Side' },
  { key: 'detail', label: 'Detail' },
  { key: 'lookShot', label: 'Look shot' },
  { key: 'additional1', label: 'Additional 1' },
  { key: 'additional2', label: 'Additional 2' },
] as const;

/** Images every live listing needs, whatever the template marks (server rule). */
const ALWAYS_REQUIRED_IMAGES = ['front'];

export type YesNo = '' | 'Yes' | 'No';

/** One colour in one size. */
export interface VariantRow {
  key: string;
  id?: string;
  colour: string;
  size: string;
  sku: string;
  /** Typed by hand, so a product SKU change no longer rewrites it. */
  skuTouched: boolean;
  standardSize: string;
  sizeOnLabel: YesNo;
  gtin: string;
  quantity: string;
  price: string;
}

export interface ListingDraft {
  articleType: string;
  categoryId: string;
  vendorId: string;

  name: string;
  displayName: string;
  listViewName: string;
  sku: string;
  slug: string;
  styleGroupId: string;
  colourGroupId: string;
  brandId: string;
  originalPrice: string;
  price: string;
  costPrice: string;
  brandColour: string;
  primaryColour: string;
  secondaryColour: string;
  tertiaryColour: string;
  ageGroup: string;
  fashionType: string;
  usage: string;
  year: string;
  season: string;
  hsn: string;
  countriesOfOrigin: string[];
  manufacturerDetails: string;
  packerDetails: string;
  importerDetails: string;

  attributes: Record<string, string>;

  description: string;
  shortDescription: string;
  styleNote: string;
  materialCare: string;
  sizeAndFit: string;
  tags: string[];

  colours: string[];
  /** Card swatch per colour name: { "Dusty Rose": "#D8A1A4" }. */
  colourHexes: Record<string, string>;
  /** Fixed colour family per colour name: { "Dusty Rose": "Rose" }. Filters use it. */
  colourFamilies: Record<string, string>;
  sizes: string[];
  rows: VariantRow[];
  /** Size → measurement key → inches (as typed). */
  measurements: Record<string, Record<string, string>>;
  measurementBasis: string;
  /** Product stock, used only when the listing has no sizes. */
  quantity: string;

  imageAngles: Record<string, string>;

  netQuantity: string;
  netQuantityUnit: string;
  numberOfItems: string;
  multipackSet: string;
  packageContains: string;
  bisNumber: string;
  bisImageUrl: string;
  bisExpiryDate: string;

  status: ProductStatus;
  isFeatured: boolean;
  isCustomizable: boolean;
  allowBulkOrders: boolean;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
}

export const EMPTY_DRAFT: ListingDraft = {
  articleType: '',
  categoryId: '',
  vendorId: '',
  name: '',
  displayName: '',
  listViewName: '',
  sku: '',
  slug: '',
  styleGroupId: '',
  colourGroupId: '',
  brandId: '',
  originalPrice: '',
  price: '',
  costPrice: '',
  brandColour: '',
  primaryColour: '',
  secondaryColour: '',
  tertiaryColour: '',
  ageGroup: '',
  fashionType: '',
  usage: '',
  year: '',
  season: '',
  hsn: '',
  countriesOfOrigin: ['', '', '', '', ''],
  manufacturerDetails: '',
  packerDetails: '',
  importerDetails: '',
  attributes: {},
  description: '',
  shortDescription: '',
  styleNote: '',
  materialCare: '',
  sizeAndFit: '',
  tags: [],
  colours: [],
  colourHexes: {},
  colourFamilies: {},
  sizes: [],
  rows: [],
  measurements: {},
  measurementBasis: '',
  quantity: '0',
  imageAngles: {},
  netQuantity: '',
  netQuantityUnit: '',
  numberOfItems: '',
  multipackSet: '',
  packageContains: '',
  bisNumber: '',
  bisImageUrl: '',
  bisExpiryDate: '',
  status: 'DRAFT',
  isFeatured: false,
  isCustomizable: false,
  allowBulkOrders: true,
  metaTitle: '',
  metaDescription: '',
  metaKeywords: '',
};

/* ── Loading a product into the form ────────────────────────────────── */

/** The product and variant shape both consoles return (admin and seller). */
export interface LoadedVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number | null;
  quantity: number;
  standardSize?: string | null;
  sizeOnLabel?: boolean | null;
  gtin?: string | null;
  measurements?: Record<string, number> | null;
  colorFamily?: string | null;
}

export interface LoadedProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  brandId?: string | null;
  vendorId?: string | null;
  price: number;
  originalPrice: number | null;
  costPrice?: number | null;
  quantity: number;
  status: ProductStatus | string;
  description: string | null;
  shortDescription: string | null;
  images: string[];
  thumbnail?: string | null;
  color: string | null;
  isFeatured?: boolean;
  isCustomizable?: boolean;
  allowBulkOrders?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  moderationStatus?: string;
  moderationNote?: string | null;
  articleType?: string | null;
  styleGroupId?: string | null;
  colourGroupId?: string | null;
  displayName?: string | null;
  listViewName?: string | null;
  brandColour?: string | null;
  colourHexes?: Record<string, string> | null;
  colorFamily?: string | null;
  primaryColour?: string | null;
  secondaryColour?: string | null;
  tertiaryColour?: string | null;
  ageGroup?: string | null;
  fashionType?: string | null;
  usage?: string | null;
  season?: string | null;
  year?: number | null;
  hsn?: string | null;
  countriesOfOrigin?: string[];
  manufacturerDetails?: string | null;
  packerDetails?: string | null;
  importerDetails?: string | null;
  styleNote?: string | null;
  materialCare?: string | null;
  sizeAndFit?: string | null;
  tags?: string[];
  measurementBasis?: string | null;
  netQuantity?: number | null;
  netQuantityUnit?: string | null;
  numberOfItems?: string | null;
  multipackSet?: string | null;
  packageContains?: string | null;
  bisCertificate?: { number?: string; imageUrl?: string; expiryDate?: string } | null;
  imageAngles?: Record<string, string> | null;
  attributes?: Record<string, string | string[]> | null;
}

const text = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

/**
 * A multi-select category field ("Ports: HDMI, USB") is held in the draft as
 * one string, like every other attribute, and sent to the server as a list.
 */
const MULTI_SEP = '|';
export const splitMulti = (value: string): string[] =>
  value.split(MULTI_SEP).map((v) => v.trim()).filter(Boolean);
export const joinMulti = (values: string[]): string => values.filter(Boolean).join(MULTI_SEP);

const rowKey = (colour: string, size: string) => `${colour}||${size}`;

const yesNo = (value: boolean | null | undefined): YesNo =>
  value === true ? 'Yes' : value === false ? 'No' : '';

const uniq = (values: string[]) => [...new Set(values)];

/**
 * The stored product as the form edits it.
 *
 * A listing made before angles existed has a plain gallery. Its pictures are
 * laid onto the angle slots in order, because saving angles rebuilds the
 * gallery from them — leaving the slots empty would wipe the photos.
 */
export function draftFromProduct(product: LoadedProduct, variants: LoadedVariant[]): ListingDraft {
  const angles: Record<string, string> = { ...(product.imageAngles ?? {}) };
  if (Object.keys(angles).length === 0) {
    const gallery = uniq(
      [product.thumbnail ?? '', ...(product.images ?? [])].filter(
        (url) => url && !url.startsWith('#')
      )
    );
    ANGLES.forEach((angle, index) => {
      if (gallery[index]) angles[angle.key] = gallery[index];
    });
  }

  const countries = [...(product.countriesOfOrigin ?? [])];
  while (countries.length < 5) countries.push('');

  const rows: VariantRow[] = variants.map((v) => ({
    key: rowKey(text(v.color), text(v.size)),
    id: v.id,
    colour: text(v.color),
    size: text(v.size),
    sku: v.sku,
    skuTouched: true,
    standardSize: text(v.standardSize),
    sizeOnLabel: yesNo(v.sizeOnLabel),
    gtin: text(v.gtin),
    quantity: String(v.quantity ?? 0),
    price: v.price === null || v.price === undefined ? '' : String(v.price),
  }));

  const measurements: ListingDraft['measurements'] = {};
  for (const v of variants) {
    const size = text(v.size);
    if (!size || measurements[size] || !v.measurements) continue;
    measurements[size] = Object.fromEntries(
      Object.entries(v.measurements).map(([key, value]) => [key, text(value)])
    );
  }

  const bis = product.bisCertificate ?? {};
  return {
    ...EMPTY_DRAFT,
    articleType: text(product.articleType),
    categoryId: product.categoryId ?? '',
    vendorId: text(product.vendorId),
    name: product.name ?? '',
    displayName: text(product.displayName),
    listViewName: text(product.listViewName),
    sku: product.sku ?? '',
    slug: product.slug ?? '',
    styleGroupId: text(product.styleGroupId),
    colourGroupId: text(product.colourGroupId),
    brandId: text(product.brandId),
    originalPrice: text(product.originalPrice),
    // A draft saved without a selling price is stored as 0; show it empty.
    price: product.price ? text(product.price) : '',
    costPrice: text(product.costPrice),
    brandColour: text(product.brandColour) || text(product.color),
    colourHexes:
      product.colourHexes && typeof product.colourHexes === 'object' ? { ...product.colourHexes } : {},
    colourFamilies: (() => {
      const out: Record<string, string> = {};
      const own = text(product.brandColour) || text(product.color);
      if (own && product.colorFamily) out[own] = product.colorFamily;
      for (const v of variants) if (v.color && v.colorFamily) out[v.color] = v.colorFamily;
      return out;
    })(),
    primaryColour: text(product.primaryColour),
    secondaryColour: text(product.secondaryColour),
    tertiaryColour: text(product.tertiaryColour),
    ageGroup: text(product.ageGroup),
    fashionType: text(product.fashionType),
    usage: text(product.usage),
    year: text(product.year),
    season: text(product.season),
    hsn: text(product.hsn),
    countriesOfOrigin: countries.slice(0, 5),
    manufacturerDetails: text(product.manufacturerDetails),
    packerDetails: text(product.packerDetails),
    importerDetails: text(product.importerDetails),
    attributes: Object.fromEntries(
      Object.entries(product.attributes ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? joinMulti(value.map(text)) : text(value),
      ])
    ),
    description: text(product.description),
    shortDescription: text(product.shortDescription),
    styleNote: text(product.styleNote),
    materialCare: text(product.materialCare),
    sizeAndFit: text(product.sizeAndFit),
    tags: product.tags ?? [],
    colours: uniq(rows.map((r) => r.colour).filter(Boolean)),
    sizes: uniq(rows.map((r) => r.size).filter(Boolean)),
    rows,
    measurements,
    measurementBasis: text(product.measurementBasis),
    quantity: String(product.quantity ?? 0),
    imageAngles: angles,
    netQuantity: text(product.netQuantity),
    netQuantityUnit: text(product.netQuantityUnit),
    numberOfItems: text(product.numberOfItems),
    multipackSet: text(product.multipackSet),
    packageContains: text(product.packageContains),
    bisNumber: text(bis.number),
    bisImageUrl: text(bis.imageUrl),
    bisExpiryDate: text(bis.expiryDate),
    status: (product.status as ProductStatus) ?? 'DRAFT',
    isFeatured: Boolean(product.isFeatured),
    isCustomizable: Boolean(product.isCustomizable),
    allowBulkOrders: product.allowBulkOrders ?? true,
    metaTitle: text(product.metaTitle),
    metaDescription: text(product.metaDescription),
    metaKeywords: text(product.metaKeywords),
  };
}

/**
 * A copy of another listing as the start of a new one: everything but the
 * identifiers (SKUs, slug, style group) and the photos, which belong to the
 * original garment.
 */
export function draftAsCopy(source: ListingDraft): ListingDraft {
  // A copy is nearly always a sister style: same design, different colour. So
  // the design comes across (fabric, attributes, sizes, measurements) and
  // everything that belongs to the colour does not. Copying the colours made
  // a Brown dress go live with every size labelled "Peach".
  const seen = new Set<string>();
  const rows = source.rows
    .filter((row) => row.size && !seen.has(row.size) && seen.add(row.size))
    .map((row) => ({
      ...row,
      id: undefined,
      key: `||${row.size}`,
      colour: '',
      sku: '',
      skuTouched: false,
      gtin: '',
      quantity: '0',
      price: '',
    }));
  return {
    ...source,
    sku: '',
    slug: '',
    styleGroupId: '',
  colourGroupId: '',
    imageAngles: {},
    status: 'DRAFT',
    isFeatured: false,
    brandColour: '',
    primaryColour: '',
    secondaryColour: '',
    tertiaryColour: '',
    colours: [],
    colourHexes: {},
    colourFamilies: {},
    rows,
  };
}

/* ── Sizes and colours ──────────────────────────────────────────────── */

/**
 * One row per colour × size, keeping whatever was already typed into a row
 * that survives. A listing with no colour names still gets one row per size.
 * Rows with no size (old colour-only variants) are kept rather than silently
 * deleted on the next save; they can be removed by hand.
 */
export function buildRows(
  colours: string[],
  sizes: string[],
  previous: VariantRow[],
  productSku: string,
  specSizes: string[]
): VariantRow[] {
  const byKey = new Map(previous.map((row) => [row.key, row]));
  const palette = colours.length > 0 ? colours : [''];
  const rows: VariantRow[] = [];
  const adopted = new Set<string>();
  for (const colour of palette) {
    // One colour: its article number already names it (CKGD-0961-BRBR), so the
    // size SKU is article-size, as in a Myntra sheet. Several colours in one
    // listing need the colour to keep size SKUs apart.
    const skuColour = colours.length > 1 ? colour : '';
    for (const size of sizes) {
      const key = rowKey(colour, size);
      const existing = byKey.get(key);
      if (existing) {
        rows.push(existing);
        continue;
      }
      // The first colour named takes over the unnamed row for each size, so a
      // saved size is renamed rather than deleted and re-created.
      const unnamed = colours.length > 0 ? byKey.get(rowKey('', size)) : undefined;
      if (unnamed && !adopted.has(size)) {
        adopted.add(size);
        rows.push({
          ...unnamed,
          key,
          colour,
          sku: unnamed.skuTouched ? unnamed.sku : suggestVariantSku(productSku, skuColour, size),
        });
        continue;
      }
      rows.push({
        key,
        colour,
        size,
        sku: productSku ? suggestVariantSku(productSku, skuColour, size) : '',
        skuTouched: false,
        standardSize: specSizes.includes(size) ? size : '',
        sizeOnLabel: '',
        gtin: '',
        quantity: '0',
        price: '',
      });
    }
  }
  const legacy = previous.filter((row) => !row.size && row.id);
  return [...rows, ...legacy];
}

export interface SizeGroup {
  label: string;
  sizes: string[];
}

/** Quick picks for the size selector, limited to sizes the type allows. */
export function sizeGroups(specSizes: string[]): SizeGroup[] {
  const pick = (list: string[]) => list.filter((size) => specSizes.includes(size));
  return [
    { label: 'Adult XS–XXL', sizes: pick(['XS', 'S', 'M', 'L', 'XL', 'XXL']) },
    { label: 'Plus 3XL–5XL', sizes: pick(['3XL', '4XL', '5XL']) },
    { label: 'Baby 0–24M', sizes: pick(['0-3M', '3-6M', '6-9M', '9-12M', '12-18M', '18-24M']) },
    {
      label: 'Kids 2–14Y',
      sizes: pick([
        '2-3Y',
        '3-4Y',
        '4-5Y',
        '5-6Y',
        '6-7Y',
        '7-8Y',
        '8-9Y',
        '9-10Y',
        '10-11Y',
        '11-12Y',
        '12-13Y',
        '13-14Y',
      ]),
    },
    { label: 'Waist 26–36', sizes: pick(['26', '28', '30', '32', '34', '36']) },
  ].filter((group) => group.sizes.length > 0);
}

/** Sizes in the order the template lists them, unknown ones last. */
export function orderSizes(sizes: string[], specSizes: string[]): string[] {
  const rank = (size: string) => {
    const index = specSizes.indexOf(size);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b));
}

/* ── Field ids, so checklist items can focus what they describe ────── */

export const fieldId = (field: string) => `lf-${field.replace(/\./g, '-')}`;
export const attrId = (key: string) => `lf-attr-${key}`;
export const imageId = (key: string) => `lf-img-${key}`;
export const rowFieldId = (index: number, field: string) => `lf-row-${index}-${field}`;
export const measureId = (sizeIndex: number, key: string) => `lf-m-${sizeIndex}-${key}`;
export const SIZE_PICKER_ID = 'lf-size-filter';

/** Which section a product column is edited in. */
export function sectionForProductField(field: string): SectionId {
  if (field === 'articleType') return 'type';
  if (['description', 'styleNote', 'materialCare', 'sizeAndFit', 'tags'].includes(field))
    return 'content';
  if (field === 'measurementBasis') return 'sizes';
  if (
    ['netQuantity', 'netQuantityUnit', 'numberOfItems', 'multipackSet', 'packageContains'].includes(
      field
    ) ||
    field.startsWith('bisCertificate.')
  ) {
    return 'packaging';
  }
  return 'business';
}

/** The input a product column is typed into. */
export function productFieldTarget(field: string): string {
  if (field === 'brand') return fieldId('brandId');
  if (field.startsWith('bisCertificate.')) {
    const part = field.split('.')[1];
    return fieldId(`bis${part.charAt(0).toUpperCase()}${part.slice(1)}`);
  }
  return fieldId(field);
}

/* ── Go-live checklist ──────────────────────────────────────────────── */

const present = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

/** A product column's value in the draft, the way the server reads it. */
export function draftValue(draft: ListingDraft, field: string): unknown {
  if (field === 'brand') return draft.brandId;
  if (field === 'styleGroupId') return draft.styleGroupId || draft.sku;
  if (field === 'price' || field === 'originalPrice') {
    const n = Number(draft[field]);
    return draft[field] !== '' && n > 0 ? n : null;
  }
  if (field.startsWith('countriesOfOrigin.')) {
    return draft.countriesOfOrigin[Number(field.split('.')[1])];
  }
  if (field === 'bisCertificate.number') return draft.bisNumber;
  if (field === 'bisCertificate.imageUrl') return draft.bisImageUrl;
  if (field === 'bisCertificate.expiryDate') return draft.bisExpiryDate;
  return (draft as unknown as Record<string, unknown>)[field];
}

export interface CheckItem {
  id: string;
  label: string;
  section: SectionId;
  done: boolean;
  /** Element id to scroll to and focus. */
  target: string;
}

/** "Bust or Chest (in)" for an either-or pair, else the column's own label. */
export function measurementLabel(spec: ArticleSpec, column: SpecColumn): string {
  if (!column.anyOf?.length) return column.label;
  return `${[column, ...column.anyOf.map((key) => spec.columns.find((c) => c.key === key))]
    .filter((c): c is SpecColumn => Boolean(c))
    .map((c) => c.label.replace(/\s*\(\s*in(ches)?\s*\)$/i, ''))
    .join(' or ')} (in)`;
}

/** Clothing carries a size chart, measurements and a look shot; nothing else does. */
export const isApparel = (spec: ArticleSpec | null): boolean => spec?.family !== 'general';

/** "size" for clothing, else the template's own option name ("uk size", "variant"). */
export const optionNoun = (spec: ArticleSpec | null): string =>
  isApparel(spec) ? 'size' : (spec?.optionLabel ?? 'Size').toLowerCase();

const isRequired = (column: SpecColumn) =>
  column.required || (column.scope === 'image' && ALWAYS_REQUIRED_IMAGES.includes(column.key));

/**
 * Everything a live listing of this type needs, each marked done or not.
 * Mirrors `missingForLive` on the server, plus the few fields our own API
 * needs to save at all (category, price).
 */
export function buildChecklist(draft: ListingDraft, spec: ArticleSpec | null): CheckItem[] {
  const items: CheckItem[] = [];
  items.push({
    id: 'categoryId',
    label: 'Category',
    section: 'type',
    done: Boolean(draft.categoryId),
    target: fieldId('categoryId'),
  });
  items.push({
    id: 'articleType',
    label: 'Article type',
    section: 'type',
    done: Boolean(draft.articleType),
    target: fieldId('articleType'),
  });
  if (!spec) return items;

  const sizedRows = draft.rows.filter((row) => row.size);
  items.push({
    id: 'sizes',
    label: `At least one ${optionNoun(spec)}`,
    section: 'sizes',
    done: sizedRows.length > 0,
    target: SIZE_PICKER_ID,
  });

  const seen = new Set<string>();
  for (const column of spec.columns) {
    if (!isRequired(column)) continue;
    // Two template columns can point at one field (e.g. both SKU columns),
    // and an either-or measurement pair counts once.
    const dedupe = column.anyOf?.length
      ? `measurement:${[column.key, ...column.anyOf].sort().join('|')}`
      : `${column.scope}:${column.field ?? column.key}`;
    if (seen.has(dedupe) || column.field === 'articleType') continue;
    seen.add(dedupe);

    switch (column.scope) {
      case 'product': {
        if (!column.field) break;
        items.push({
          id: column.key,
          label: column.label,
          section: sectionForProductField(column.field),
          done: present(draftValue(draft, column.field)),
          target: productFieldTarget(column.field),
        });
        break;
      }
      case 'attribute':
        items.push({
          id: column.key,
          label: column.label,
          section: 'attributes',
          done: present(draft.attributes[column.key]),
          target: attrId(column.key),
        });
        break;
      case 'image':
        items.push({
          id: column.key,
          label: `${column.label}`,
          section: 'images',
          done: present(draft.imageAngles[column.key]),
          target: imageId(column.key),
        });
        break;
      case 'variant': {
        if (!column.field || sizedRows.length === 0) break;
        const field = column.field;
        const lacking = draft.rows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => {
            if (!row.size) return false;
            if (field === 'size') return !row.size;
            if (field === 'sizeOnLabel') return row.sizeOnLabel === '';
            if (field === 'sku') return !row.sku.trim();
            if (field === 'standardSize') return !row.standardSize;
            if (field === 'gtin') return !row.gtin.trim();
            return false;
          });
        items.push({
          id: column.key,
          label: lacking.length
            ? `${column.label} (${lacking.length} size${lacking.length === 1 ? '' : 's'})`
            : column.label,
          section: 'sizes',
          done: lacking.length === 0,
          target: lacking.length ? rowFieldId(lacking[0].index, field) : SIZE_PICKER_ID,
        });
        break;
      }
      case 'measurement': {
        if (sizedRows.length === 0) break;
        const keys = [column.key, ...(column.anyOf ?? [])];
        const lacking = draft.sizes
          .map((size, index) => ({ size, index }))
          .filter(({ size }) => !keys.some((key) => present(draft.measurements[size]?.[key])));
        const label = measurementLabel(spec, column);
        items.push({
          id: column.key,
          label: lacking.length
            ? `${label} (${lacking.length} size${lacking.length === 1 ? '' : 's'})`
            : label,
          section: 'sizes',
          done: lacking.length === 0,
          target: lacking.length ? measureId(lacking[0].index, column.key) : SIZE_PICKER_ID,
        });
        break;
      }
      default:
        break;
    }
  }

  // Our own API cannot save a listing without a selling price, even for the
  // types whose template leaves ISP out.
  if (!items.some((item) => item.target === fieldId('price'))) {
    items.push({
      id: 'price',
      label: 'Selling price',
      section: 'business',
      done: present(draftValue(draft, 'price')),
      target: fieldId('price'),
    });
  }
  return items;
}

/** Where the server's `missing` entries live in this form. */
export function targetForMissing(
  missing: MissingField,
  spec: ArticleSpec | null,
  draft: ListingDraft
): string {
  if (missing.key === 'sizes') return SIZE_PICKER_ID;
  const column = spec?.columns.find((c) => c.key === missing.key);
  if (!column) return SIZE_PICKER_ID;
  switch (column.scope) {
    case 'product':
      return column.field ? productFieldTarget(column.field) : SIZE_PICKER_ID;
    case 'attribute':
      return attrId(column.key);
    case 'image':
      return imageId(column.key);
    case 'variant':
      return draft.rows.length ? rowFieldId(0, column.field ?? 'sku') : SIZE_PICKER_ID;
    case 'measurement':
      return draft.sizes.length ? measureId(0, column.key) : SIZE_PICKER_ID;
    default:
      return SIZE_PICKER_ID;
  }
}

/* ── Building the API payloads ──────────────────────────────────────── */

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());
const numOrNull = (value: string): number | null => {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (value: string): number | null => {
  const n = numOrNull(value);
  return n === null ? null : Math.round(n);
};

export function totalStock(draft: ListingDraft): number {
  const sized = draft.rows.filter((row) => row.size || row.id);
  if (sized.length === 0) return Math.max(0, intOrNull(draft.quantity) ?? 0);
  return sized.reduce((sum, row) => sum + Math.max(0, intOrNull(row.quantity) ?? 0), 0);
}

/** The product body for create/update. `status` is decided by the caller. */
export function buildProductPayload(
  draft: ListingDraft,
  spec: ArticleSpec | null,
  mode: FormMode,
  status: ProductStatus | undefined
): Record<string, unknown> {
  const attributeCols = new Map(
    (spec?.columns ?? []).filter((c) => c.scope === 'attribute').map((c) => [c.key, c])
  );
  const attributes = Object.fromEntries(
    Object.entries(draft.attributes).filter(
      ([key, value]) => attributeCols.has(key) && value.trim() !== ''
    )
  ) as Record<string, string>;
  // Multi-select category fields go to the server as lists.
  const attributeBody: Record<string, string | string[]> = Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      attributeCols.get(key)?.kind === 'multiselect' ? splitMulti(value) : value,
    ])
  );
  const angles = Object.fromEntries(
    Object.entries(draft.imageAngles).filter(([, url]) => url && url.trim() !== '')
  );
  const bis = {
    ...(draft.bisNumber.trim() ? { number: draft.bisNumber.trim() } : {}),
    ...(draft.bisImageUrl.trim() ? { imageUrl: draft.bisImageUrl.trim() } : {}),
    ...(draft.bisExpiryDate.trim() ? { expiryDate: draft.bisExpiryDate.trim() } : {}),
  };

  const body: Record<string, unknown> = {
    name: draft.name.trim(),
    slug: draft.slug.trim() || slugify(draft.name),
    sku: draft.sku.trim(),
    categoryId: draft.categoryId,
    brandId: draft.brandId,
    price: numOrNull(draft.price) ?? 0,
    originalPrice: numOrNull(draft.originalPrice),
    quantity: totalStock(draft),
    description: draft.description,
    shortDescription: draft.shortDescription,
    // The storefront's own colour and fabric filters read these.
    color: draft.brandColour.trim() || draft.colours[0] || '',
    material: attributes.fabric ?? '',

    articleType: orNull(draft.articleType),
    styleGroupId: orNull(draft.styleGroupId),
    colourGroupId: orNull(draft.colourGroupId),
    displayName: orNull(draft.displayName),
    listViewName: orNull(draft.listViewName),
    brandColour: orNull(draft.brandColour),
    colourHexes: swatchesToSend(draft),
    // The listing's own colour family: its first colour's. Left out when not
    // chosen yet, so the server keeps (or suggests) one rather than clearing it.
    ...(draft.colourFamilies[swatchColours(draft)[0] ?? '']
      ? { colorFamily: draft.colourFamilies[swatchColours(draft)[0]] }
      : {}),
    primaryColour: orNull(draft.primaryColour),
    secondaryColour: orNull(draft.secondaryColour),
    tertiaryColour: orNull(draft.tertiaryColour),
    ageGroup: orNull(draft.ageGroup),
    fashionType: orNull(draft.fashionType),
    usage: orNull(draft.usage),
    season: orNull(draft.season),
    year: intOrNull(draft.year),
    hsn: orNull(draft.hsn),
    countriesOfOrigin: draft.countriesOfOrigin.map((c) => c.trim()).filter(Boolean),
    manufacturerDetails: orNull(draft.manufacturerDetails),
    packerDetails: orNull(draft.packerDetails),
    importerDetails: orNull(draft.importerDetails),
    styleNote: orNull(draft.styleNote),
    materialCare: orNull(draft.materialCare),
    sizeAndFit: orNull(draft.sizeAndFit),
    tags: draft.tags,
    measurementBasis: orNull(draft.measurementBasis),
    netQuantity: intOrNull(draft.netQuantity),
    netQuantityUnit: orNull(draft.netQuantityUnit),
    numberOfItems: orNull(draft.numberOfItems),
    multipackSet: orNull(draft.multipackSet),
    packageContains: orNull(draft.packageContains),
    bisCertificate: Object.keys(bis).length ? bis : null,
    attributes: spec ? attributeBody : null,
  };
  // Sending an empty angle set would rebuild the gallery as empty; leaving it
  // out keeps whatever photos the product already has.
  if (Object.keys(angles).length > 0) body.imageAngles = angles;
  if (status) body.status = status;

  // Printing and embroidery are clothing only; the server enforces it too.
  body.isCustomizable = spec && isApparel(spec) ? draft.isCustomizable : false;

  if (mode === 'admin') {
    body.vendorId = draft.vendorId;
    body.costPrice = numOrNull(draft.costPrice);
    body.isFeatured = draft.isFeatured;
    body.allowBulkOrders = draft.allowBulkOrders;
    body.metaTitle = draft.metaTitle;
    body.metaDescription = draft.metaDescription;
    body.metaKeywords = draft.metaKeywords;
  }
  return body;
}

/** The variant body; `measurements` come from the row's size. */
export function buildVariantPayload(draft: ListingDraft, row: VariantRow) {
  const typed = draft.measurements[row.size] ?? {};
  const measurements: Record<string, number> = {};
  for (const [key, value] of Object.entries(typed)) {
    const n = numOrNull(value);
    if (n !== null) measurements[key] = n;
  }
  return {
    sku: row.sku.trim().toUpperCase(),
    size: orNull(row.size),
    // A single-colour listing's rows are that colour even when the sizes were
    // picked before the brand colour was typed (always so for "Add another
    // colour"); an unnamed row was saved with no colour and fell out of the
    // shop's colour filter.
    color:
      orNull(row.colour) ??
      (draft.colours.filter(Boolean).length === 0 ? orNull(draft.brandColour) : null),
    price: numOrNull(row.price),
    quantity: Math.max(0, intOrNull(row.quantity) ?? 0),
    standardSize: orNull(row.standardSize),
    sizeOnLabel: row.sizeOnLabel === '' ? null : row.sizeOnLabel === 'Yes',
    gtin: orNull(row.gtin),
    measurements,
    // Sent only once picked; the server suggests one from the name otherwise.
    ...(draft.colourFamilies[row.colour || draft.brandColour.trim()]
      ? { colorFamily: draft.colourFamilies[row.colour || draft.brandColour.trim()] }
      : {}),
  };
}

/** Local checks that would make the save itself fail, before any request. */
export function saveBlockers(draft: ListingDraft): Array<{ label: string; target: string }> {
  const out: Array<{ label: string; target: string }> = [];
  if (!draft.articleType)
    out.push({ label: 'Choose a category and article type', target: fieldId('articleType') });
  if (!draft.name.trim())
    out.push({ label: 'Article name is needed to save', target: fieldId('name') });
  if (!draft.sku.trim())
    out.push({ label: 'Article number (SKU) is needed to save', target: fieldId('sku') });
  if (!draft.categoryId)
    out.push({ label: 'Category is needed to save', target: fieldId('categoryId') });
  // An empty selling price does not stop a draft: several Myntra templates
  // (Rompers among them) have no ISP column, and a seller has to be able to
  // save half-done work. Going live needs one; the checklist and the server
  // both say so.
  if (draft.price.trim() !== '' && !Number.isFinite(Number(draft.price)))
    out.push({ label: 'Selling price must be a number', target: fieldId('price') });
  if (draft.hsn.trim() && !/^\d{4,8}$/.test(draft.hsn.trim()))
    out.push({ label: 'HSN must be 4 to 8 digits', target: fieldId('hsn') });
  // Filters only know colour families, so a colour without one could never be
  // found by colour. The form suggests one as each colour is added.
  for (const name of swatchColours(draft)) {
    if (!draft.colourFamilies[name])
      out.push({ label: `Pick a colour family for “${name}”`, target: fieldId('colours') });
  }
  draft.rows.forEach((row, index) => {
    if (!row.sku.trim())
      out.push({
        label: `Size SKU for ${row.colour ? `${row.colour} ` : ''}${row.size}`,
        target: rowFieldId(index, 'sku'),
      });
    if (row.gtin.trim() && !/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(row.gtin.trim()))
      out.push({
        label: `GTIN for ${row.size} must be 8, 12, 13 or 14 digits`,
        target: rowFieldId(index, 'gtin'),
      });
  });
  const skus = draft.rows.map((row) => row.sku.trim().toUpperCase()).filter(Boolean);
  if (new Set(skus).size !== skus.length)
    out.push({ label: 'Two sizes share one SKU', target: rowFieldId(0, 'sku') });
  return out;
}

export { rowKey };

/** The colours a swatch can be set for: the listing's colours, else its brand colour. */
export const swatchColours = (draft: ListingDraft): string[] => {
  const colours = draft.colours.map((c) => c.trim()).filter(Boolean);
  if (colours.length) return [...new Set(colours)];
  return draft.brandColour.trim() ? [draft.brandColour.trim()] : [];
};

/** Only swatches for colours still on the listing; null when there are none. */
function swatchesToSend(draft: ListingDraft): Record<string, string> | null {
  const keep = swatchColours(draft);
  const out: Record<string, string> = {};
  for (const name of keep) {
    const hex = draft.colourHexes[name];
    if (hex) out[name] = hex;
  }
  return Object.keys(out).length ? out : null;
}
