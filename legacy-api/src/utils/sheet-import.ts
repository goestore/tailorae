import ExcelJS from 'exceljs';
import { parseCsv } from '@/utils/catalog-csv';
import {
  META_SHEET,
  fieldForHeader,
  findHeaderRow,
  headerScore,
  normaliseHeader,
  type CanonicalField,
} from '@/utils/sheet-columns';
import {
  findArticleType,
  missingForLive,
  pickVariantListingFields,
  validateListingValues,
  type ListingSnapshot,
  type MissingField,
  type SpecColumn,
} from '@/utils/product-spec';

/**
 * A listing sheet, turned into products.
 *
 * The rule this file is built around: never refuse a row for something that can
 * be worked out or safely defaulted, but say what was assumed. An importer that
 * blocks on a category it has not seen before, or a colour left blank, means a
 * seller with four hundred SKUs cannot list at all — and the practical result is
 * that they go and list somewhere else.
 *
 * So a missing category is created, a missing colour becomes "Assorted", a
 * missing size is read out of the SKU, and every one of those decisions comes
 * back as a warning the operator reviews before committing. Only things nobody
 * can guess — no SKU, no name, no price at all — are errors.
 */

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
}

/** One row of the sheet, as the importer understands it. */
export interface ImportRow {
  /** 1-based row number in the source sheet, as the spreadsheet shows it. */
  rowNumber: number;
  sheet: string;
  file: string;
  values: Partial<Record<CanonicalField, string>>;
  /**
   * The row read through the marketplace catalogue, column by exact header.
   * Present only when the sheet is a template for a known article type.
   */
  listing?: RowListing;
  issues: Issue[];
}

/** One row of a marketplace template, split the way the catalogue scopes it. */
export interface RowListing {
  articleType: string;
  /** Product columns by Prisma field (dotted fields already nested). */
  product: Record<string, unknown>;
  attributes: Record<string, string>;
  variant: { standardSize?: string; sizeOnLabel?: boolean; gtin?: string };
  measurements: Record<string, string>;
  imageAngles: Record<string, string>;
}

export interface ParsedSheet {
  file: string;
  sheet: string;
  /** Header cells as written, for the mapping screen. */
  headers: string[];
  /** Headers nothing recognised — offered for manual mapping. */
  unmapped: string[];
  /** The catalogue article type the sheet was read as, when it is a known template. */
  articleType: string | null;
  rows: ImportRow[];
}

const clean = (value: unknown): string =>
  String(value ?? '')
    .replace(/[` ]/g, ' ')
    .trim();

/** A cell from exceljs, which may be a formula, a link or rich text. */
function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '';
  const value = cell.value as unknown;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return clean(record.text);
    if (record.result !== undefined && record.result !== null) return clean(record.result);
    if (Array.isArray(record.richText)) {
      return clean(record.richText.map((part) => (part as { text?: string }).text ?? '').join(''));
    }
    if (typeof record.hyperlink === 'string') return clean(record.hyperlink);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return clean(value);
}

/** Rows of a worksheet as a plain matrix, capped so a reference tab cannot hang the request. */
function sheetMatrix(sheet: ExcelJS.Worksheet, maxRows: number): string[][] {
  const matrix: string[][] = [];
  const columns = Math.max(sheet.columnCount, 1);
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (matrix.length >= maxRows) return;
    const cells: string[] = [];
    for (let c = 1; c <= columns; c += 1) cells.push(cellText(row.getCell(c)));
    matrix.push(cells);
  });
  return matrix;
}

type ArticleSpec = NonNullable<ReturnType<typeof findArticleType>>;

/** Product fields the generic columns already carry, so the listing does not repeat them. */
const BASE_PRODUCT_FIELDS = new Set(['sku', 'name', 'brand', 'price', 'originalPrice', 'description']);

/**
 * Which catalogue article type a sheet is, if any.
 *
 * Myntra names the tab after the article type ("Dresses") and repeats it in
 * the `articleType` column; either is enough. A sheet only counts when a fair
 * share of its headers are that template's own — a hand-made CSV with a
 * "category" of Dresses is still read the generic way.
 */
function detectArticleType(sheet: string, headers: string[], body: string[][]): ArticleSpec | null {
  const typeIndex = headers.findIndex((header) => normaliseHeader(header) === 'articletype');
  const fromColumn =
    typeIndex >= 0 ? body.map((cells) => clean(cells[typeIndex])).find((value) => value !== '') : undefined;
  const spec = findArticleType(fromColumn) ?? findArticleType(sheet);
  if (!spec) return null;
  const known = new Set(spec.columns.map((column) => normaliseHeader(column.header)));
  const matched = headers.filter((header) => known.has(normaliseHeader(header))).length;
  return matched >= 10 ? spec : null;
}

/** Column index per catalogue column, by exact header first, then by normalised header. */
function catalogueIndex(spec: ArticleSpec, headers: string[]): Array<{ column: SpecColumn; index: number }> {
  const exact = new Map<string, number>();
  const loose = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!exact.has(header)) exact.set(header, index);
    const key = normaliseHeader(header);
    if (!loose.has(key)) loose.set(key, index);
  });
  const out: Array<{ column: SpecColumn; index: number }> = [];
  for (const column of spec.columns) {
    const index = exact.get(column.header) ?? loose.get(normaliseHeader(column.header));
    if (index !== undefined) out.push({ column, index });
  }
  return out;
}

const YES = /^(yes|y|true|1)$/i;
const NO = /^(no|n|false|0)$/i;

/** One row through the catalogue: every column lands where its scope says. */
function readListing(
  spec: ArticleSpec,
  columns: Array<{ column: SpecColumn; index: number }>,
  cells: string[]
): RowListing {
  const listing: RowListing = {
    articleType: spec.articleType,
    product: {},
    attributes: {},
    variant: {},
    measurements: {},
    imageAngles: {},
  };
  for (const { column, index } of columns) {
    const value = clean(cells[index]);
    if (value === '') continue;
    switch (column.scope) {
      case 'product': {
        const field = column.field;
        if (!field || BASE_PRODUCT_FIELDS.has(field)) break;
        const [head, tail] = field.split('.');
        if (tail === undefined) {
          if (listing.product[head] === undefined) listing.product[head] = value;
        } else if (head === 'countriesOfOrigin') {
          const list = (listing.product.countriesOfOrigin as string[] | undefined) ?? [];
          list[Number(tail)] = value;
          listing.product.countriesOfOrigin = list;
        } else {
          const bag = (listing.product[head] as Record<string, string> | undefined) ?? {};
          bag[tail] = value;
          listing.product[head] = bag;
        }
        break;
      }
      case 'attribute':
        listing.attributes[column.key] = value;
        break;
      case 'variant':
        if (column.field === 'standardSize') listing.variant.standardSize = value;
        else if (column.field === 'gtin') listing.variant.gtin = value;
        else if (column.field === 'sizeOnLabel') {
          if (YES.test(value)) listing.variant.sizeOnLabel = true;
          else if (NO.test(value)) listing.variant.sizeOnLabel = false;
        }
        break;
      case 'measurement':
        listing.measurements[column.key] = value;
        break;
      case 'image':
        if (/^https?:\/\//i.test(value) || value.startsWith('/uploads/')) listing.imageAngles[column.key] = value;
        break;
      default:
        break;
    }
  }
  if (Array.isArray(listing.product.countriesOfOrigin)) {
    listing.product.countriesOfOrigin = (listing.product.countriesOfOrigin as string[]).filter(Boolean);
  }
  return listing;
}

/** Turn a matrix into rows keyed by canonical field. */
function matrixToRows(
  matrix: string[][],
  file: string,
  sheet: string,
  overrides: Record<string, CanonicalField> = {}
): ParsedSheet {
  const headerIndex = findHeaderRow(matrix);
  if (headerIndex < 0) {
    return { file, sheet, headers: [], unmapped: [], articleType: null, rows: [] };
  }

  const headers = matrix[headerIndex].map(clean);
  const mapped = headers.map(
    (header) => overrides[header] ?? fieldForHeader(header) ?? null
  );

  const spec = detectArticleType(sheet, headers, matrix.slice(headerIndex + 1));
  const specColumns = spec ? catalogueIndex(spec, headers) : [];
  const coveredByCatalogue = new Set(specColumns.map((entry) => entry.index));
  const unmapped = headers.filter(
    (header, index) => header !== '' && mapped[index] === null && !coveredByCatalogue.has(index)
  );

  const rows: ImportRow[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    if (!cells.some((cell) => clean(cell) !== '')) continue;

    const values: Partial<Record<CanonicalField, string>> = {};
    mapped.forEach((field, index) => {
      if (!field) return;
      const value = clean(cells[index]);
      // First non-empty wins: a sheet that repeats the product's columns only
      // on its first row is as valid as one that repeats them everywhere.
      if (value !== '' && values[field] === undefined) values[field] = value;
    });

    const row: ImportRow = { rowNumber: i + 1, sheet, file, values, issues: [] };
    if (spec) row.listing = readListing(spec, specColumns, cells);
    rows.push(row);
  }

  return { file, sheet, headers, unmapped, articleType: spec?.articleType ?? null, rows };
}

/**
 * Read one uploaded file.
 *
 * For a workbook the tab is chosen by how well its best header row reads, so
 * Myntra's "Dresses" wins over its instruction and reference tabs without
 * knowing either name in advance.
 */
export async function parseSheet(
  buffer: Buffer,
  filename: string,
  overrides: Record<string, CanonicalField> = {},
  maxRows = 20000
): Promise<ParsedSheet> {
  if (/\.csv$/i.test(filename)) {
    const matrix = parseCsv(buffer.toString('utf8'));
    return matrixToRows(matrix, filename, 'csv', overrides);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  let candidates = workbook.worksheets.filter((sheet) => !META_SHEET.test(sheet.name));
  if (candidates.length === 0) candidates = workbook.worksheets;

  let best: ParsedSheet | null = null;
  let bestScore = -1;
  for (const sheet of candidates) {
    const matrix = sheetMatrix(sheet, maxRows);
    const index = findHeaderRow(matrix);
    const score = index >= 0 ? headerScore(matrix[index]) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = matrixToRows(matrix, filename, sheet.name, overrides);
    }
  }

  return best ?? { file: filename, sheet: '', headers: [], unmapped: [], articleType: null, rows: [] };
}

// ── Normalising ────────────────────────────────────────────────────────────

/** Size suffixes recognised at the end of a SKU, longest first so XXL beats L. */
const SIZE_SUFFIXES = [
  '10XL', '9XL', '8XL', '7XL', '6XL', '5XL', '4XL', '3XL', '2XL', 'XXXL',
  'XXL', 'XXS', 'XL', 'XS', 'FS', 'L', 'M', 'S',
  '46', '44', '42', '40', '38', '36', '34', '32', '30', '28',
].sort((a, b) => b.length - a.length);

/**
 * The size a SKU is for.
 *
 * Sheets that carry a size column are easy. The ones that do not still encode
 * it: `CKGD-0871-WHBL-0-3M` is the `0-3M` size of article `CKGD-0871-WHBL`, so
 * the article number is stripped off the front. Failing that, a known suffix is
 * matched — which is what saves a sheet with neither a size column nor a
 * consistent article prefix.
 */
export function sizeFromSku(sku: string, articleNumber?: string): string {
  const skuText = clean(sku);
  if (!skuText) return '';

  const article = clean(articleNumber);
  if (article && skuText.toUpperCase().startsWith(`${article.toUpperCase()}-`)) {
    return skuText.slice(article.length + 1);
  }

  const upper = skuText.toUpperCase();
  for (const suffix of SIZE_SUFFIXES) {
    if (upper.endsWith(`-${suffix}`)) return skuText.slice(-suffix.length);
  }
  return '';
}

const toNumber = (value: string | undefined): number | null => {
  const text = clean(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[₹,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Title Case, for a category or colour taken straight from a sheet. */
export function titleCase(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** A measurement row for the size chart: which size, and its inches. */
export interface SizeMeasurements {
  size: string;
  bust?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  frontLength?: number;
  shoulder?: number;
  sleeveLength?: number;
}

export interface NormalisedVariant {
  sku: string;
  size: string;
  colorName: string;
  stock: number;
  price: number | null;
  rowNumber: number;
  measurements?: SizeMeasurements;
  /** Marketplace per-size fields, when the sheet is a known template. */
  standardSize?: string;
  sizeOnLabel?: boolean;
  gtin?: string;
  /** Catalogue measurement key → inches, e.g. { bustIn: 34 }. */
  measurementValues?: Record<string, number>;
}

export interface NormalisedProduct {
  /** The article number, or the SKU when a sheet has no article column. */
  key: string;
  articleNumber: string;
  name: string;
  displayName?: string;
  brand?: string;
  category?: string;
  colorName: string;
  price: number;
  mrp: number | null;
  description?: string;
  shortDescription?: string;
  material?: string;
  fabricCare?: string;
  hsn?: string;
  countryOfOrigin?: string;
  manufacturer?: string;
  metaTitle?: string;
  metaDescription?: string;
  searchKeywords?: string;
  /**
   * Everything a shopper filters or reads that has no column of its own.
   * Keyed by catalogue key (e.g. `fabric`) for a marketplace template, by a
   * readable label for any other sheet.
   */
  attributes: Record<string, string>;
  /** The catalogue article type, when the sheet is a known template. */
  articleType?: string | null;
  /** Product listing columns by Prisma field: hsn, countriesOfOrigin, packerDetails… */
  listing: Record<string, unknown>;
  /** Image angle → URL, in the template's own angle names. */
  imageAngles?: Record<string, string>;
  images: string[];
  variants: NormalisedVariant[];
  issues: Issue[];
  rows: number[];
}

/** Attribute columns kept as a named bag rather than given their own field. */
const ATTRIBUTE_FIELDS: CanonicalField[] = [
  'occasion', 'pattern', 'patternType', 'neckType', 'sleeveLength', 'sleeveStyle',
  'productLength', 'fit', 'hemline', 'closure', 'lining', 'transparency',
  'ageGroup', 'season', 'year', 'packageContains', 'subcategory',
];

const ATTRIBUTE_LABELS: Partial<Record<CanonicalField, string>> = {
  patternType: 'Print or pattern',
  neckType: 'Neck',
  sleeveLength: 'Sleeve length',
  sleeveStyle: 'Sleeve styling',
  productLength: 'Length',
  ageGroup: 'Age group',
  packageContains: 'Package contains',
  subcategory: 'Sub-category',
};

/** Product columns a listing may set; anything else in a payload is ignored. */
export const LISTING_FIELDS = [
  'styleGroupId', 'displayName', 'listViewName', 'brandColour', 'primaryColour', 'secondaryColour',
  'tertiaryColour', 'ageGroup', 'fashionType', 'usage', 'season', 'year', 'hsn', 'countriesOfOrigin',
  'manufacturerDetails', 'packerDetails', 'importerDetails', 'styleNote', 'materialCare', 'sizeAndFit',
  'tags', 'measurementBasis', 'netQuantity', 'netQuantityUnit', 'numberOfItems', 'multipackSet',
  'packageContains', 'bisCertificate',
] as const;
const LISTING_FIELD_SET = new Set<string>(LISTING_FIELDS);

/** "NA" is how a template says "does not apply"; it is only kept when it is a real option. */
const isNotApplicable = (value: unknown) =>
  typeof value === 'string' && /^(na|n\/a|-)$/i.test(value.trim());

const invalid = (message: string): Issue => ({ level: 'warning', code: 'invalid_value', message });

/**
 * Normalise listing values against the catalogue, one field at a time.
 *
 * A value that is not one of the template's options is dropped and reported,
 * never allowed to fail the whole product: a sheet of 300 rows with one
 * misspelt neckline should list 300 rows and say which one needs fixing.
 * Idempotent, so the commit step can run it again on what the browser sends.
 */
export function sanitiseListing(
  articleType: string | null | undefined,
  product: Record<string, unknown>,
  attributes: Record<string, unknown> = {}
): { product: Record<string, unknown>; attributes: Record<string, string>; issues: Issue[] } {
  const issues: Issue[] = [];
  const out: Record<string, unknown> = {};
  const type = articleType ?? null;

  for (const [field, raw] of Object.entries(product ?? {})) {
    if (!LISTING_FIELD_SET.has(field) || raw === null || raw === undefined || raw === '') continue;

    if (field === 'countriesOfOrigin') {
      const list = (Array.isArray(raw) ? raw : String(raw).split(','))
        .map((country) => clean(country))
        .filter((country) => country && !isNotApplicable(country));
      const kept: string[] = [];
      for (const country of list) {
        const data: Record<string, unknown> = { countriesOfOrigin: [country] };
        if (validateListingValues(data, type).length) {
          issues.push(invalid(`Country of origin "${country}" is not one Myntra accepts — left out`));
        } else kept.push((data.countriesOfOrigin as string[])[0]);
      }
      if (kept.length) out.countriesOfOrigin = [...new Set(kept)];
      continue;
    }

    if (field === 'tags') {
      const tags = (Array.isArray(raw) ? raw : String(raw).split(','))
        .map((tag) => clean(tag))
        .filter((tag) => tag && !isNotApplicable(tag));
      if (tags.length) out.tags = tags;
      continue;
    }

    if (field === 'bisCertificate') {
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        const bag: Record<string, string> = {};
        for (const key of ['number', 'imageUrl', 'expiryDate']) {
          const value = clean((raw as Record<string, unknown>)[key]);
          if (value && !isNotApplicable(value)) bag[key] = value;
        }
        if (Object.keys(bag).length) out.bisCertificate = bag;
      }
      continue;
    }

    if (field === 'netQuantity') {
      const n = Number(clean(raw));
      if (Number.isInteger(n) && n > 0) out.netQuantity = n;
      else if (!isNotApplicable(raw)) {
        issues.push(invalid(`Net quantity "${clean(raw)}" is not a whole number — left blank`));
      }
      continue;
    }

    // Excel hands a numeric HSN back as a number; it is a code, not an amount.
    const text = field === 'hsn' ? clean(raw).replace(/\.0+$/, '') : clean(raw).slice(0, 2000);
    if (!text) continue;
    const data: Record<string, unknown> = { [field]: text };
    const errors = validateListingValues(data, type);
    if (errors.length) {
      // "NA" that is not a real option just means "does not apply".
      if (!isNotApplicable(text)) issues.push(invalid(`${errors[0]} (got "${text}") — left blank`));
      continue;
    }
    if (field === 'year') {
      const year = Number(data.year);
      if (Number.isInteger(year)) out.year = year;
      continue;
    }
    if (isNotApplicable(text)) {
      // A free-text field holding "NA" has nothing to store; a dropdown may list NA.
      const column = findArticleType(type)?.columns.find((c) => c.field === field);
      if (!column?.options) continue;
    }
    out[field] = data[field];
  }

  const attrsOut: Record<string, string> = {};
  for (const [key, raw] of Object.entries(attributes ?? {})) {
    const text = clean(raw);
    if (!text) continue;
    const data: Record<string, unknown> = { attributes: { [key]: text } };
    const errors = validateListingValues(data, type);
    if (errors.length) {
      if (!isNotApplicable(text)) issues.push(invalid(`${errors[0]} (got "${text}") — left blank`));
      continue;
    }
    const value = (data.attributes as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === '') continue;
    // A free-text attribute of "NA" carries nothing.
    const column = findArticleType(type)?.columns.find((c) => c.key === key);
    if (isNotApplicable(text) && !column?.options) continue;
    attrsOut[key] = String(value);
  }

  return { product: out, attributes: attrsOut, issues };
}

interface VariantListing {
  standardSize?: string;
  sizeOnLabel?: boolean;
  gtin?: string;
  measurementValues?: Record<string, number>;
}

/** Per-size listing values, checked the way the listing form checks them. */
export function sanitiseVariantListing(variant: {
  standardSize?: unknown;
  sizeOnLabel?: unknown;
  gtin?: unknown;
  measurements?: Record<string, unknown> | null;
}): VariantListing & { issues: Issue[] } {
  const issues: Issue[] = [];
  const out: VariantListing = {};
  const standard = clean(variant.standardSize);
  if (standard && !isNotApplicable(standard)) out.standardSize = standard.slice(0, 40);
  if (typeof variant.sizeOnLabel === 'boolean') out.sizeOnLabel = variant.sizeOnLabel;
  const gtin = clean(variant.gtin).replace(/\.0+$/, '');
  if (gtin && !isNotApplicable(gtin)) {
    const { data, errors } = pickVariantListingFields({ gtin });
    if (errors.length) issues.push(invalid(`GTIN "${gtin}" must be 8, 12, 13 or 14 digits — left blank`));
    else out.gtin = data.gtin as string;
  }
  const measured: Record<string, number> = {};
  for (const [key, raw] of Object.entries(variant.measurements ?? {})) {
    const text = clean(raw);
    if (!text || isNotApplicable(text)) continue;
    const { data, errors } = pickVariantListingFields({ measurements: { [key]: text } });
    if (errors.length) issues.push(invalid(`Measurement ${key} "${text}" is not a number of inches — left blank`));
    else Object.assign(measured, data.measurements as Record<string, number>);
  }
  if (Object.keys(measured).length) out.measurementValues = measured;
  return { ...out, issues };
}

/** The product as it would be stored, in the shape the go-live checklist reads. */
export function listingSnapshot(product: NormalisedProduct): ListingSnapshot {
  return {
    ...(product.listing ?? {}),
    articleType: product.articleType ?? null,
    name: product.name,
    sku: product.articleNumber,
    // The brand is resolved (or created) on commit, so its name stands in for the id.
    brandId: product.brand || null,
    description: product.description ?? null,
    price: product.price,
    originalPrice: product.mrp,
    attributes: product.attributes,
    imageAngles: product.imageAngles ?? {},
    variants: product.variants.map((variant) => ({
      size: variant.size,
      sku: variant.sku,
      standardSize: variant.standardSize ?? null,
      sizeOnLabel: variant.sizeOnLabel ?? null,
      gtin: variant.gtin ?? null,
      measurements: variant.measurementValues ?? {},
    })),
  };
}

/**
 * What still stops this product going live; empty for sheets with no article
 * type. `extraColumns` are the fields the admin added to the product's category
 * (Screen size on Television…), which are required the same way.
 */
export function missingForLiveOf(product: NormalisedProduct, extraColumns: SpecColumn[] = []): MissingField[] {
  return product.articleType ? missingForLive(listingSnapshot(product), extraColumns) : [];
}

/** Myntra's angle order, which is also the gallery order. */
export const IMAGE_ANGLE_ORDER = ['front', 'back', 'side', 'detail', 'lookShot', 'additional1', 'additional2'];

/** Generic columns that are listing fields too, for sheets that are not a known template. */
function genericListing(value: (field: CanonicalField) => string | undefined): Record<string, unknown> {
  const listing: Record<string, unknown> = {};
  const put = (field: string, raw: string | undefined) => {
    const text = clean(raw);
    if (text && !isNotApplicable(text)) listing[field] = text;
  };
  put('hsn', value('hsn'));
  put('manufacturerDetails', value('manufacturer'));
  put('packerDetails', value('packer'));
  put('importerDetails', value('importer'));
  put('materialCare', value('fabricCare'));
  put('primaryColour', value('primaryColor'));
  put('secondaryColour', value('secondaryColor'));
  put('styleGroupId', value('colorGroupKey'));
  const country = clean(value('countryOfOrigin'));
  if (country) listing.countriesOfOrigin = country.split(',').map((c) => c.trim()).filter(Boolean);
  return listing;
}

/** When a sheet lists MRP but no selling price, what we sell at. */
export const DEFAULT_MARKDOWN = 0;

/** A catalogue sheet carries no stock column; this is what a new size starts at. */
export const DEFAULT_STOCK = 0;

/**
 * Group rows into products, defaulting what can be defaulted.
 *
 * Rows are grouped by article number — one product per colourway, its sizes
 * underneath — because that is how both Myntra's sheet and our own catalogue
 * are shaped. A sheet with no article column falls back to grouping by the SKU
 * with its size suffix removed, so a plain list of SKUs still assembles.
 */
export function normaliseRows(rows: ImportRow[]): NormalisedProduct[] {
  const byKey = new Map<string, NormalisedProduct>();

  for (const row of rows) {
    const value = (field: CanonicalField): string | undefined => row.values[field];
    const issues: Issue[] = [];

    const sku = clean(value('sku'));
    const articleNumber = clean(value('articleNumber'));
    const name = clean(value('name')) || clean(value('displayName'));

    if (!sku && !articleNumber) {
      row.issues.push({ level: 'error', code: 'no_sku', message: 'No SKU or article number' });
      continue;
    }
    if (!name) {
      row.issues.push({ level: 'error', code: 'no_name', message: 'No product name' });
      continue;
    }

    const mrp = toNumber(value('mrp'));
    const selling = toNumber(value('sellingPrice'));
    const price = selling ?? (mrp !== null ? Math.round(mrp * (1 - DEFAULT_MARKDOWN)) : null);
    if (price === null || price <= 0) {
      row.issues.push({
        level: 'error',
        code: 'no_price',
        message: 'No price or MRP on this row',
      });
      continue;
    }
    if (selling !== null && mrp !== null && selling > mrp) {
      issues.push({
        level: 'warning',
        code: 'price_above_mrp',
        message: 'Selling price is above MRP',
      });
    }

    // Size: the column, else read out of the SKU, else the product has one size.
    let size = clean(value('size')) || clean(value('standardSize'));
    if (!size) {
      size = sizeFromSku(sku, articleNumber);
      if (size) {
        issues.push({
          level: 'warning',
          code: 'size_from_sku',
          message: `Size "${size}" read from the SKU`,
        });
      }
    }
    if (!size) size = 'One size';

    // Colour: a blank one is common on a sheet for a single-colour style, and
    // is not a reason to refuse the row.
    let colorName = clean(value('colorName'));
    if (!colorName) {
      colorName = clean(value('primaryColor'));
      if (colorName) {
        issues.push({
          level: 'warning',
          code: 'color_from_prominent',
          message: `Colour taken from the prominent colour: ${colorName}`,
        });
      }
    }
    if (!colorName) {
      colorName = 'Assorted';
      issues.push({
        level: 'warning',
        code: 'color_defaulted',
        message: 'No colour on this row — filed as Assorted',
      });
    }

    const category = clean(value('category'));
    if (!category) {
      issues.push({
        level: 'warning',
        code: 'no_category',
        message: 'No category — one must be chosen before this can go live',
      });
    }

    const stockValue = toNumber(value('stock'));
    const stock = stockValue ?? DEFAULT_STOCK;
    if (stockValue === null) {
      issues.push({
        level: 'warning',
        code: 'stock_defaulted',
        message: 'No stock column — starts at 0, so it will not sell until set',
      });
    }
    if (stock < 0) {
      row.issues.push({ level: 'error', code: 'negative_stock', message: 'Stock is negative' });
      continue;
    }

    // One product per article per colour: a sheet with two colourways under one
    // article number is two products, which is how they are sold and shown.
    const groupKey = (articleNumber || sku.replace(new RegExp(`-${size}$`, 'i'), '')).toUpperCase();
    const key = `${groupKey}::${colorName.toUpperCase()}`;

    let product = byKey.get(key);
    if (!product) {
      const attributes: Record<string, string> = {};
      for (const field of ATTRIBUTE_FIELDS) {
        const attributeValue = clean(value(field));
        if (!attributeValue || attributeValue.toUpperCase() === 'NA') continue;
        attributes[ATTRIBUTE_LABELS[field] ?? titleCase(field)] = attributeValue;
      }

      let images = (['image1', 'image2', 'image3', 'image4', 'image5', 'image6'] as const)
        .map((field) => clean(value(field)))
        .filter((url) => /^https?:\/\//i.test(url));

      // A marketplace template: every column lands where the catalogue says.
      let listing = genericListing(value);
      let articleType: string | null = null;
      let imageAngles: Record<string, string> | undefined;
      let productAttributes = attributes;
      const listingIssues: Issue[] = [];
      if (row.listing) {
        articleType = row.listing.articleType;
        const sanitised = sanitiseListing(
          articleType,
          { ...listing, ...row.listing.product },
          row.listing.attributes
        );
        listing = sanitised.product;
        productAttributes = sanitised.attributes;
        listingIssues.push(...sanitised.issues);
        imageAngles = row.listing.imageAngles;
        const ordered = IMAGE_ANGLE_ORDER.map((angle) => imageAngles![angle]).filter(Boolean);
        if (ordered.length) images = ordered;
      }

      product = {
        key,
        articleNumber: articleNumber || groupKey,
        name,
        displayName: clean(value('displayName')) || undefined,
        brand: clean(value('brand')) || undefined,
        category: category || undefined,
        colorName,
        price,
        mrp,
        description: clean(value('description')) || undefined,
        shortDescription: clean(value('shortDescription')) || undefined,
        material: clean(value('material')) || undefined,
        fabricCare: clean(value('fabricCare')) || undefined,
        hsn: clean(value('hsn')) || undefined,
        countryOfOrigin: clean(value('countryOfOrigin')) || undefined,
        manufacturer: clean(value('manufacturer')) || undefined,
        metaTitle: clean(value('metaTitle')) || undefined,
        metaDescription: clean(value('metaDescription')) || undefined,
        searchKeywords: clean(value('searchKeywords')) || undefined,
        attributes: productAttributes,
        articleType,
        listing,
        imageAngles,
        images,
        variants: [],
        issues: listingIssues,
        rows: [],
      };
      byKey.set(key, product);
    }

    product.rows.push(row.rowNumber);
    for (const issue of issues) {
      // One warning per product per kind: forty sizes all missing stock is one
      // thing to know, not forty lines to read.
      if (!product.issues.some((existing) => existing.code === issue.code)) {
        product.issues.push(issue);
      }
    }

    const measurements: SizeMeasurements = { size };
    const measure = (field: CanonicalField): number | undefined => {
      const parsed = toNumber(value(field));
      return parsed === null ? undefined : parsed;
    };
    measurements.bust = measure('measureBust');
    measurements.chest = measure('measureChest');
    measurements.waist = measure('measureWaist');
    measurements.hips = measure('measureHips');
    measurements.frontLength = measure('measureFrontLength');
    measurements.shoulder = measure('measureShoulder');
    measurements.sleeveLength = measure('measureSleeveLength');
    const hasMeasurements = (
      ['bust', 'chest', 'waist', 'hips', 'frontLength', 'shoulder', 'sleeveLength'] as const
    ).some((field) => measurements[field] !== undefined);

    const variantSku = sku || `${product.articleNumber}-${size}`.toUpperCase();
    if (product.variants.some((variant) => variant.sku.toUpperCase() === variantSku.toUpperCase())) {
      row.issues.push({
        level: 'error',
        code: 'duplicate_sku',
        message: `SKU ${variantSku} appears twice`,
      });
      continue;
    }

    const variantListing = row.listing
      ? sanitiseVariantListing({ ...row.listing.variant, measurements: row.listing.measurements })
      : sanitiseVariantListing({ gtin: value('gtin'), standardSize: value('standardSize') });
    for (const found of variantListing.issues) {
      if (!product.issues.some((existing) => existing.message === found.message)) product.issues.push(found);
    }

    product.variants.push({
      sku: variantSku,
      size,
      colorName,
      stock,
      price: selling !== null && selling !== price ? selling : null,
      rowNumber: row.rowNumber,
      measurements: hasMeasurements ? measurements : undefined,
      standardSize: variantListing.standardSize,
      sizeOnLabel: variantListing.sizeOnLabel,
      gtin: variantListing.gtin,
      measurementValues: variantListing.measurementValues,
    });
  }

  return [...byKey.values()];
}

/**
 * A size chart from per-size measurements.
 *
 * Myntra's sheet carries chest, waist, length and shoulder against every size,
 * and nothing was reading them. Turned into a table here, they become the size
 * guide the product page already knows how to open — which is the single thing
 * that most reduces returns on apparel.
 */
export function sizeChartFrom(variants: NormalisedVariant[]): string {
  const rows = variants.filter((variant) => variant.measurements);
  if (rows.length === 0) return '';

  const ALL_COLUMNS: Array<{ key: keyof SizeMeasurements; label: string }> = [
    { key: 'bust', label: 'Bust' },
    { key: 'chest', label: 'Chest' },
    { key: 'waist', label: 'Waist' },
    { key: 'hips', label: 'Hips' },
    { key: 'shoulder', label: 'Shoulder' },
    { key: 'frontLength', label: 'Length' },
    { key: 'sleeveLength', label: 'Sleeve' },
  ];
  // Only the measurements this sheet actually carried: a chart with four empty
  // columns reads as missing data rather than as a size guide.
  const columns = ALL_COLUMNS.filter((column) =>
    rows.some((row) => row.measurements?.[column.key] !== undefined)
  );

  if (columns.length === 0) return '';

  const header = ['Size', ...columns.map((column) => `${column.label} (in)`)].join(' · ');
  const body = rows.map((row) =>
    [
      row.measurements!.size,
      ...columns.map((column) => {
        const value = row.measurements![column.key];
        return value === undefined ? '—' : String(value);
      }),
    ].join(' · ')
  );

  return [header, ...body].join('\n');
}
