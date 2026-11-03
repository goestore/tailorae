/**
 * Bulk catalogue import.
 *
 * A marketplace onboards sellers who already have a catalogue — three hundred
 * SKUs in a spreadsheet, each in five colours and six sizes. Adding those one
 * form at a time is not work anyone will do, so the shape of this file is set
 * by what a seller can actually export from wherever their stock lives now:
 * one flat row per variant, with the product's own columns repeated.
 *
 * Parsing and validation live here, apart from the route, because they are the
 * part worth testing exhaustively: a bad importer quietly creating duplicate
 * products or zeroing stock is far more expensive than one that refuses a file.
 */

/** Columns the importer understands. Everything else in the file is ignored. */
export const PRODUCT_COLUMNS = [
  'sku',
  'name',
  'slug',
  'category',
  'brand',
  'description',
  'shortDescription',
  'material',
  'status',
  'price',
  'originalPrice',
  'costPrice',
  'quantity',
  'weight',
  'sizeGuide',
  'metaTitle',
  'metaDescription',
] as const;

export const VARIANT_COLUMNS = [
  'color',
  'size',
  'variantSku',
  'variantQuantity',
  'variantPrice',
] as const;

export const KNOWN_COLUMNS = [...PRODUCT_COLUMNS, ...VARIANT_COLUMNS];

export interface ParsedVariant {
  color: string | null;
  size: string | null;
  sku: string;
  quantity: number;
  price: number | null;
}

export interface ParsedProduct {
  sku: string;
  name: string;
  slug?: string;
  category?: string;
  brand?: string;
  description?: string;
  shortDescription?: string;
  material?: string;
  status?: string;
  price: number;
  originalPrice?: number | null;
  costPrice?: number | null;
  quantity?: number;
  weight?: number | null;
  sizeGuide?: string;
  metaTitle?: string;
  metaDescription?: string;
  variants: ParsedVariant[];
  /** 1-based rows this product was assembled from, for error messages. */
  rows: number[];
}

export interface RowError {
  /** 1-based, counting the header — the number the spreadsheet shows. */
  row: number;
  message: string;
}

export interface ParseResult {
  products: ParsedProduct[];
  errors: RowError[];
  /** Columns present in the file that the importer does not use. */
  ignoredColumns: string[];
}

/**
 * Split CSV text into rows of cells.
 *
 * Written out rather than pulled from a package because the format's whole
 * difficulty is quoting, and that is ten lines: a quoted field may contain
 * commas, newlines and doubled quotes. A naive `split(',')` corrupts any
 * description containing a comma, which is most of them.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  // A BOM from Excel would otherwise become part of the first header name.
  const input = text.replace(/^﻿/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Accept LF, CRLF and lone CR without emitting a blank row for each half.
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  // A file not ending in a newline still has a last row.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Excel pads short rows with empty cells; a row of nothing is not a record.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

const num = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // Sheets export "1,299.00" and "₹1299"; neither is a reason to reject a row.
  const cleaned = trimmed.replace(/[₹,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const text = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'DISCONTINUED'];

/**
 * Turn a sheet into products with their variants.
 *
 * Rows are grouped by `sku`: a product in four colours and six sizes is
 * twenty-four rows repeating the same product columns, which is what every
 * export in this space looks like. Product-level values are taken from the
 * first row that carries them, so a seller who fills them in only on the first
 * row of each group gets the same result as one who repeats them.
 */
export function parseCatalogCsv(csv: string): ParseResult {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return { products: [], errors: [{ row: 0, message: 'The file is empty' }], ignoredColumns: [] };
  }

  const header = rows[0].map((cell) => cell.trim());
  const lower = header.map((cell) => cell.toLowerCase());
  const indexOf = (column: string): number =>
    lower.indexOf(column.toLowerCase());

  const missing = ['sku', 'name', 'price'].filter((column) => indexOf(column) === -1);
  if (missing.length > 0) {
    return {
      products: [],
      errors: [
        {
          row: 1,
          message: `The header is missing required column(s): ${missing.join(', ')}`,
        },
      ],
      ignoredColumns: [],
    };
  }

  const known = new Set(KNOWN_COLUMNS.map((column) => column.toLowerCase()));
  const ignoredColumns = header.filter(
    (column) => column !== '' && !known.has(column.toLowerCase())
  );

  const errors: RowError[] = [];
  const byKey = new Map<string, ParsedProduct>();

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const rowNumber = r + 1;
    const cell = (column: string): string | undefined => {
      const index = indexOf(column);
      return index === -1 ? undefined : cells[index];
    };

    const sku = text(cell('sku'));
    const name = text(cell('name'));
    if (!sku) {
      errors.push({ row: rowNumber, message: 'sku is required' });
      continue;
    }

    const key = sku.toUpperCase();
    let product = byKey.get(key);

    if (!product) {
      const price = num(cell('price'));
      if (!name) {
        errors.push({ row: rowNumber, message: `${sku}: name is required` });
        continue;
      }
      if (price === null || Number.isNaN(price) || price <= 0) {
        errors.push({ row: rowNumber, message: `${sku}: price must be a number above zero` });
        continue;
      }

      const status = text(cell('status'))?.toUpperCase();
      if (status && !STATUSES.includes(status)) {
        errors.push({
          row: rowNumber,
          message: `${sku}: status must be one of ${STATUSES.join(', ')}`,
        });
        continue;
      }

      product = {
        sku,
        name,
        slug: text(cell('slug')),
        category: text(cell('category')),
        brand: text(cell('brand')),
        description: text(cell('description')),
        shortDescription: text(cell('shortDescription')),
        material: text(cell('material')),
        status,
        price,
        originalPrice: num(cell('originalPrice')),
        costPrice: num(cell('costPrice')),
        quantity: num(cell('quantity')) ?? undefined,
        weight: num(cell('weight')),
        sizeGuide: text(cell('sizeGuide')),
        metaTitle: text(cell('metaTitle')),
        metaDescription: text(cell('metaDescription')),
        variants: [],
        rows: [],
      };
      byKey.set(key, product);
    }

    product.rows.push(rowNumber);

    // ── The variant on this row, if there is one ──────────────────────────
    const color = text(cell('color'));
    const size = text(cell('size'));
    if (!color && !size) continue;

    const variantQuantity = num(cell('variantQuantity'));
    if (variantQuantity !== null && (Number.isNaN(variantQuantity) || variantQuantity < 0)) {
      errors.push({ row: rowNumber, message: `${sku}: variantQuantity must be zero or more` });
      continue;
    }
    const variantPrice = num(cell('variantPrice'));
    if (variantPrice !== null && (Number.isNaN(variantPrice) || variantPrice <= 0)) {
      errors.push({ row: rowNumber, message: `${sku}: variantPrice must be a number above zero` });
      continue;
    }

    // A variant SKU has to be unique across the catalogue, so one is derived
    // when the sheet does not carry it — the seller is not made to invent a
    // naming scheme just to get their stock in.
    const variantSku =
      text(cell('variantSku')) ??
      [sku, color, size]
        .filter(Boolean)
        .map((part) => part!.toUpperCase().replace(/[^A-Z0-9]/g, ''))
        .join('-');

    const duplicate = product.variants.find(
      (variant) =>
        (variant.color ?? '').toLowerCase() === (color ?? '').toLowerCase() &&
        (variant.size ?? '').toLowerCase() === (size ?? '').toLowerCase()
    );
    if (duplicate) {
      errors.push({
        row: rowNumber,
        message: `${sku}: ${[color, size].filter(Boolean).join(' / ')} appears more than once`,
      });
      continue;
    }

    product.variants.push({
      color: color ?? null,
      size: size ?? null,
      sku: variantSku,
      quantity: variantQuantity ?? 0,
      price: variantPrice,
    });
  }

  // A variant SKU repeated across two products would collide on the unique
  // index, which is a confusing database error rather than a readable one.
  const seenVariantSkus = new Map<string, string>();
  for (const product of byKey.values()) {
    for (const variant of product.variants) {
      const owner = seenVariantSkus.get(variant.sku.toUpperCase());
      if (owner && owner !== product.sku) {
        errors.push({
          row: product.rows[0],
          message: `${product.sku}: variant SKU ${variant.sku} is already used by ${owner}`,
        });
      }
      seenVariantSkus.set(variant.sku.toUpperCase(), product.sku);
    }
  }

  return { products: [...byKey.values()], errors, ignoredColumns };
}

/** A slug from a name, matching what the product form generates. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'product'
  );
}

/** One CSV cell, quoted when it has to be. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A CSV document from rows of values. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
}
