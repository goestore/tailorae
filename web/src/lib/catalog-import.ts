'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Listing a catalogue from a marketplace sheet.
 *
 * The review comes back whole and lives in the browser while it is being
 * worked on, so fixing a category across forty products is a local edit rather
 * than forty requests. Only the finished list goes back.
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
  price: number | null;
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
  price: number;
  mrp: number | null;
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
 * sent back on a second pass — which is how a sheet with unusual column names
 * gets read without anyone editing the file.
 */
export async function reviewSheets(
  files: File[],
  overrides: Record<string, string> = {}
): Promise<ReviewResponse> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  if (Object.keys(overrides).length > 0) {
    form.append('overrides', JSON.stringify(overrides));
  }

  try {
    /**
     * The shared client sets `Content-Type: application/json` for every
     * request. Undoing it here lets the browser write the multipart header
     * itself — which it has to, because only the browser knows the boundary
     * string it just generated. Left as JSON the upload arrives with no files
     * at all.
     */
    const response = await apiClient.post('/admin/catalog-import/review', form, {
      headers: { 'Content-Type': undefined },
    });
    return { message: response.data?.message ?? '', ...(response.data?.data ?? {}) };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'That file could not be read.'));
  }
}

/** Write the reviewed products, as edited. */
export async function commitImport(
  products: ImportProduct[],
  options: { vendorId?: string; publish?: boolean } = {}
): Promise<CommitResponse> {
  try {
    const response = await apiClient.post('/admin/catalog-import/commit', {
      products: products.filter((product) => !product.skip),
      ...options,
    });
    return { message: response.data?.message ?? '', ...(response.data?.data ?? {}) };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Those products could not be listed.'));
  }
}

/**
 * Download listings as Myntra's own SKU template, one row per size.
 *
 * `vendorId` is a seller id or "house"; `ids` narrows to selected rows. The
 * file name comes from the server so it carries the article type and date.
 */
export async function exportMyntra(options: {
  articleType: string;
  ids?: string[];
  vendorId?: string;
}): Promise<{ filename: string; rows: number; skipped: string[] }> {
  const params: Record<string, string> = { articleType: options.articleType };
  if (options.ids?.length) params.ids = options.ids.join(',');
  if (options.vendorId) params.vendorId = options.vendorId;

  try {
    const response = await apiClient.get('/admin/products/export/myntra', {
      params,
      responseType: 'blob',
    });
    const disposition = String(response.headers?.['content-disposition'] ?? '');
    const filename =
      /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? `myntra-${options.articleType.toLowerCase()}.xlsx`;
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return {
      filename,
      rows: Number(response.headers?.['x-export-rows'] ?? 0),
      // Listings left out because they hold several colours in one listing.
      skipped: String(response.headers?.['x-export-skipped'] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  } catch (error) {
    // A blob error body has to be read before its message can be shown.
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
      let message = '';
      try {
        message = (JSON.parse(await data.text()) as { message?: string }).message ?? '';
      } catch {
        // Not JSON: fall through to the generic message.
      }
      if (message) throw new Error(message);
    }
    throw new Error(getApiErrorMessage(error, 'The Myntra sheet could not be built.'));
  }
}

/** How many listings of each article type an export with these filters would include. */
export async function myntraExportCounts(options: { ids?: string[]; vendorId?: string } = {}): Promise<
  Record<string, number>
> {
  const params: Record<string, string> = {};
  if (options.ids?.length) params.ids = options.ids.join(',');
  if (options.vendorId) params.vendorId = options.vendorId;
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
