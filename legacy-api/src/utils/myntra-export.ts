import path from 'path';
import ExcelJS from 'exceljs';
import { findArticleType, type SpecColumn } from '@/utils/product-spec';

/**
 * A product, written back out as Myntra's own SKU template.
 *
 * The inverse of the importer: the same catalogue that says where each
 * column lands on the way in says where each value goes on the way out, so a
 * listing imported from a Myntra sheet exports to an identical one. One row
 * per size, as Myntra wants it.
 */

export type ArticleSpec = NonNullable<ReturnType<typeof findArticleType>>;

/** The template rows: banner, section band, header; data starts below. */
export const HEADER_ROW = 3;
export const FIRST_DATA_ROW = 4;

const ANGLE_ORDER = ['front', 'back', 'side', 'detail', 'lookShot', 'additional1', 'additional2'];

export interface ExportVariant {
  sku: string;
  size?: string | null;
  price?: number | null;
  standardSize?: string | null;
  sizeOnLabel?: boolean | null;
  gtin?: string | null;
  measurements?: unknown;
}

export interface ExportProduct {
  sku: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  description?: string | null;
  thumbnail?: string | null;
  images?: string[] | null;
  brand?: { name: string } | null;
  attributes?: unknown;
  imageAngles?: unknown;
  bisCertificate?: unknown;
  countriesOfOrigin?: string[] | null;
  tags?: string[] | null;
  variants: ExportVariant[];
  [field: string]: unknown;
}

type Cell = string | number | null;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Image angles, falling back to the gallery in angle order for products listed before angles existed. */
export function anglesOf(product: ExportProduct): Record<string, string> {
  const stored = asRecord(product.imageAngles);
  const angles: Record<string, string> = {};
  for (const [angle, url] of Object.entries(stored)) {
    if (typeof url === 'string' && url) angles[angle] = url;
  }
  if (Object.keys(angles).length) return angles;
  const gallery = [product.thumbnail, ...(product.images ?? [])].filter(
    (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index
  );
  gallery.slice(0, ANGLE_ORDER.length).forEach((url, index) => {
    angles[ANGLE_ORDER[index]] = url;
  });
  return angles;
}

/** A relative upload path made absolute, because Myntra fetches images from the URL. */
export const absoluteUrl = (url: string, base: string): string =>
  /^https?:\/\//i.test(url) ? url : `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;

/** The value one template column takes for one size of one product. */
export function cellFor(
  column: SpecColumn,
  product: ExportProduct,
  variant: ExportVariant | null,
  assetBase: string
): Cell {
  const text = (value: unknown): Cell =>
    value === null || value === undefined || value === '' ? null : (value as string | number);

  switch (column.scope) {
    case 'product': {
      const field = column.field;
      if (!field) return null;
      if (field === 'styleGroupId') return text(product.styleGroupId) ?? product.sku;
      if (field === 'brand') return text(product.brand?.name);
      if (field === 'originalPrice') {
        // MRP is mandatory; a product sold at full price has no compare price stored.
        return Number(product.originalPrice) > 0 ? Number(product.originalPrice) : product.price;
      }
      if (field === 'price') return variant?.price != null && variant.price > 0 ? variant.price : product.price;
      if (field === 'tags') return product.tags?.length ? product.tags.join(', ') : null;
      const [head, tail] = field.split('.');
      if (tail === undefined) return text(product[head]);
      if (head === 'countriesOfOrigin') return text(product.countriesOfOrigin?.[Number(tail)]);
      return text(asRecord(product[head])[tail]);
    }
    case 'variant': {
      if (!variant || !column.field) return null;
      if (column.field === 'sizeOnLabel') {
        return variant.sizeOnLabel === true ? 'Yes' : variant.sizeOnLabel === false ? 'No' : null;
      }
      return text((variant as unknown as Record<string, unknown>)[column.field]);
    }
    case 'attribute':
      return text(asRecord(product.attributes)[column.key]);
    case 'measurement': {
      const value = asRecord(variant?.measurements)[column.key];
      return typeof value === 'number' ? value : text(value);
    }
    case 'image': {
      const url = anglesOf(product)[column.key];
      return url ? absoluteUrl(url, assetBase) : null;
    }
    default:
      return null;
  }
}

/** Absolute path of the bundled template copy for an article type. */
export const templatePath = (spec: ArticleSpec): string =>
  path.resolve(__dirname, '../../assets/myntra-templates', spec.template);

/** The tab that holds the listing rows: the one whose header row carries vendorSkuCode. */
function listingSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  for (const sheet of workbook.worksheets) {
    const row = sheet.getRow(HEADER_ROW);
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      if (String(row.getCell(c).value ?? '').trim() === 'vendorSkuCode') return sheet;
    }
  }
  return null;
}

/**
 * Fill the template with these products and return the workbook.
 *
 * Column positions are read from the template's own header row rather than
 * assumed, so a template with reordered columns still lines up. The template's
 * sample rows are cleared first; `masterdata` and the instructions tab are
 * left exactly as Myntra shipped them, so the dropdowns keep working.
 */
export async function buildMyntraWorkbook(
  spec: ArticleSpec,
  products: ExportProduct[],
  assetBase: string
): Promise<{ workbook: ExcelJS.Workbook; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath(spec));
  const sheet = listingSheet(workbook);
  if (!sheet) throw new Error(`The ${spec.articleType} template has no listing tab`);

  const headerRow = sheet.getRow(HEADER_ROW);
  const columnByHeader = new Map<string, number>();
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const header = String(headerRow.getCell(c).value ?? '').trim();
    if (header && !columnByHeader.has(header)) columnByHeader.set(header, c);
  }

  // Clear the sample data the template ships with; keep the cells' styling.
  for (let r = FIRST_DATA_ROW; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null;
    });
  }

  const placed = spec.columns
    .map((column) => ({ column, index: columnByHeader.get(column.header) }))
    .filter((entry): entry is { column: SpecColumn; index: number } => entry.index !== undefined);

  let r = FIRST_DATA_ROW;
  for (const product of products) {
    const sizes: Array<ExportVariant | null> = product.variants.length ? product.variants : [null];
    for (const variant of sizes) {
      const row = sheet.getRow(r);
      for (const { column, index } of placed) {
        const value = cellFor(column, product, variant, assetBase);
        if (value !== null) row.getCell(index).value = value;
      }
      row.commit();
      r += 1;
    }
  }

  return { workbook, rows: r - FIRST_DATA_ROW };
}
