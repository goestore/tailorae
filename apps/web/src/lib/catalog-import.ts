'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { blobErrorMessage, saveBlob } from '@/lib/admin-download';

/**
 * Listing a catalogue from a marketplace sheet (`/admin/catalog-import`,
 * MODERATOR).
 *
 * The review comes back whole and lives in the browser while it is being
 * worked on, so fixing a category across forty products is a local edit rather
 * than forty requests. Only the finished list goes back — with the same field
 * names the review used, money in paise.
 */

export interface ImportIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ImportVariant {
  sku: string;
  size: string;
  colorName: string;
  stock: number;
  /** Paise; null means the product's own price. */
  pricePaise: number | null;
  rowNumber: number;
  /** Marketplace per-size values, when the sheet is a known template. */
  standardSize?: string;
  sizeOnLabel?: boolean;
  gtin?: string;
  /** Catalogue measurement key → inches. */
  measurementValues?: Record<string, number>;
}

/** A required template field the product still lacks; it commits as a draft until filled. */
export interface MissingField {
  key: string;
  label: string;
  group: string;
}

export interface ImportProduct {
  key: string;
  articleNumber: string;
  name: string;
  displayName?: string;
  brand?: string;
  category?: string;
  colorName: string;
  pricePaise: number;
  mrpPaise: number | null;
  description?: string;
  shortDescription?: string;
  material?: string;
  /** Keyed by catalogue key for a template sheet, by label for any other. */
  attributes: Record<string, string>;
  /** The catalogue article type, when the sheet is a known template. */
  articleType?: string | null;
  /** Product listing columns: hsn, countriesOfOrigin, packerDetails… */
  listing?: Record<string, unknown>;
  /** Image angle (front, back, side…) → URL. */
  imageAngles?: Record<string, string>;
  images: string[];
  variants: ImportVariant[];
  issues: ImportIssue[];
  rows: number[];
  action: 'create' | 'update';
  existingId: string | null;
  newCategory: boolean;
  newBrand: boolean;
  sizeChart: string;
  missingForLive: MissingField[];
  /** Set on the review screen; unticked products are left out of the commit. */
  skip?: boolean;
}

export interface ReviewResponse {
  message: string;
  sheets: Array<{
    file: string;
    sheet: string;
    rows: number;
    unmapped: string[];
    articleType: string | null;
  }>;
  products: ImportProduct[];
  rejectedRows: Array<{ row: number; sheet: string; file: string; issues: ImportIssue[] }>;
  fields: string[];
  summary: {
    products: number;
    variants: number;
    creating: number;
    updating: number;
    newCategories: string[];
    newBrands: string[];
    warnings: number;
    rejectedRows: number;
    /** Products that will be saved as drafts until required fields are filled. */
    incomplete: number;
  };
}

export interface CommitResponse {
  message: string;
  created: number;
  updated: number;
  variants: number;
  createdCategories: string[];
  failures: Array<{ sku: string; message: string }>;
  /** Saved, but kept as drafts: what each still needs before it can go live. */
  incomplete: Array<{ sku: string; missing: string[] }>;
}

/**
 * Read one or more sheets without writing anything.
 *
 * `overrides` maps a header the importer did not recognise onto a field, and is
 * sent back on a second pass. `sellerId` (a shop id, or empty for house stock)
 * decides which of the shop's listings each row would update.
 */
export async function reviewSheets(
  files: File[],
  overrides: Record<string, string> = {},
  sellerId?: string
): Promise<ReviewResponse> {
  const form = new FormData();
  for (const file of files) form.append('files', file);

  try {
    // `overrides` and `sellerId` are request parameters, not parts. The API
    // client drops the JSON content type for FormData so the browser writes
    // the multipart boundary itself.
    const response = await apiClient.post('/admin/catalog-import/review', form, {
      params: {
        ...(Object.keys(overrides).length > 0 ? { overrides: JSON.stringify(overrides) } : {}),
        ...(sellerId ? { sellerId } : {}),
      },
      timeout: 120000,
    });
    return { message: response.data?.message ?? '', ...(response.data?.data ?? {}) };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'That file could not be read.'));
  }
}

/** Write the reviewed products, as edited. `sellerId` empty = house stock. */
export async function commitImport(
  products: ImportProduct[],
  options: { sellerId?: string; publish?: boolean } = {}
): Promise<CommitResponse> {
  try {
    const response = await apiClient.post(
      '/admin/catalog-import/commit',
      {
        products: products.filter((product) => !product.skip),
        ...(options.sellerId ? { sellerId: options.sellerId } : {}),
        publish: Boolean(options.publish),
      },
      { timeout: 300000 }
    );
    return { message: response.data?.message ?? '', ...(response.data?.data ?? {}) };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Those products could not be listed.'));
  }
}

/**
 * Download listings as Myntra's own SKU template, one row per size.
 *
 * `sellerId` is a seller id or "house"; `ids` narrows to selected rows. The
 * server's file name and its row / skipped counts travel in headers a browser
 * on another origin cannot read, so the file is named here and the count comes
 * from `myntraExportCounts`.
 */
export async function exportMyntra(options: {
  articleType: string;
  ids?: string[];
  sellerId?: string;
}): Promise<{ filename: string }> {
  const params: Record<string, string> = { articleType: options.articleType };
  if (options.ids?.length) params.ids = options.ids.join(',');
  if (options.sellerId) params.sellerId = options.sellerId;

  try {
    const response = await apiClient.get('/admin/products/export/myntra', {
      params,
      responseType: 'blob',
      timeout: 120000,
    });
    const slug = options.articleType.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `myntra-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    saveBlob(response.data as Blob, filename);
    return { filename };
  } catch (error) {
    throw new Error(await blobErrorMessage(error, 'The Myntra sheet could not be built.'));
  }
}

/** How many listings of each article type an export with these filters would include. */
export async function myntraExportCounts(options: { ids?: string[]; sellerId?: string } = {}): Promise<
  Record<string, number>
> {
  const params: Record<string, string> = {};
  if (options.ids?.length) params.ids = options.ids.join(',');
  if (options.sellerId) params.sellerId = options.sellerId;
  try {
    const response = await apiClient.get('/admin/products/export/myntra/counts', { params });
    return (response.data?.data?.counts ?? {}) as Record<string, number>;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not count listings to export.'));
  }
}

/** The marketplace article types the export can write, as the catalogue lists them. */
export async function listExportArticleTypes(): Promise<Array<{ articleType: string; slug: string }>> {
  try {
    const response = await apiClient.get('/catalogue/article-types');
    return (response.data?.data?.articleTypes ?? []) as Array<{ articleType: string; slug: string }>;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the article types.'));
  }
}
