import { createHash, randomInt } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Prisma } from '@prisma/client';
import { HttpError, isValidEmail } from '@/utils/helpers';
import { UPLOAD_DIR } from '@/routes/media';

/**
 * Custom Wear quotes and artwork.
 *
 * The custom-wear catalogue is static data on the storefront, so a quote
 * carries its own copy of the product fields rather than a Product foreign key.
 * Everything a customer sends is validated here, by hand, because the request
 * comes from a public form.
 */

export const QUOTE_STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const isQuoteStatus = (value: unknown): value is QuoteStatus =>
  typeof value === 'string' && (QUOTE_STATUSES as readonly string[]).includes(value);

// ── Artwork storage ──────────────────────────────────────────────────

export const ARTWORK_DIR = path.join(UPLOAD_DIR, 'artwork');
export const ARTWORK_MAX_BYTES = 15 * 1024 * 1024;
/** Print artwork needs resolution, so this is generous; it only stops abuse. */
const ARTWORK_MAX_EDGE = 6000;
/** SVGs are rasterised at print density and capped to this edge. */
const SVG_RASTER_EDGE = 4000;

/** Artwork URLs this API issued. Anything else in a quote is refused. */
export const ARTWORK_URL_RE = /^\/uploads\/artwork\/[a-f0-9]{32}\.(png|jpg|webp|pdf)$/;

export interface StoredArtwork {
  url: string;
  format: 'png' | 'jpg' | 'webp' | 'pdf';
  bytes: number;
  width: number | null;
  height: number | null;
  /** True when an SVG was converted to a PNG on the way in. */
  rasterised: boolean;
}

/**
 * Does this look like SVG markup? Checked on the bytes, not the name: an SVG is
 * XML that can carry script, so it is never stored as-is — it is rasterised.
 */
const looksLikeSvg = (buffer: Buffer): boolean => {
  const head = buffer.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart();
  if (!head.startsWith('<')) return false;
  return /<svg[\s>]/i.test(head);
};

const isPdf = (buffer: Buffer): boolean => buffer.subarray(0, 5).toString('latin1') === '%PDF-';

async function writeHashed(bytes: Buffer, ext: StoredArtwork['format']): Promise<string> {
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
  await fs.mkdir(ARTWORK_DIR, { recursive: true });
  const target = path.join(ARTWORK_DIR, name);
  try {
    await fs.access(target); // same bytes already stored
  } catch {
    await fs.writeFile(target, bytes);
  }
  return `/uploads/artwork/${name}`;
}

/**
 * Decide what a file is from its bytes, re-encode it, and store it under a
 * content-hash name. The extension and MIME type the browser claimed are
 * ignored, so a text file renamed `.png` fails here and never reaches disk.
 *
 * - PDF (also covers PDF-compatible `.ai` files): `%PDF-` signature, kept as-is.
 * - SVG: rasterised to PNG by sharp, so no markup is ever served back.
 * - PNG / JPEG / WebP: decoded and re-encoded (EXIF stripped). Anything with an
 *   alpha channel stays lossless so logos keep their transparency.
 */
export async function storeArtwork(buffer: Buffer): Promise<StoredArtwork> {
  if (buffer.length === 0) throw new HttpError(400, 'That file is empty.');
  if (buffer.length > ARTWORK_MAX_BYTES) throw new HttpError(413, 'Artwork must be 15 MB or smaller.');

  if (isPdf(buffer)) {
    const url = await writeHashed(buffer, 'pdf');
    return { url, format: 'pdf', bytes: buffer.length, width: null, height: null, rasterised: false };
  }

  if (looksLikeSvg(buffer)) {
    try {
      const { data, info } = await sharp(buffer, { density: 300, failOn: 'error' })
        .resize({ width: SVG_RASTER_EDGE, height: SVG_RASTER_EDGE, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true });
      const url = await writeHashed(data, 'png');
      return { url, format: 'png', bytes: data.length, width: info.width, height: info.height, rasterised: true };
    } catch {
      throw new HttpError(400, 'We could not read that SVG. Export it as PNG or PDF and try again.');
    }
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw new HttpError(400, 'That file is not artwork we can read. Upload PNG, JPG, WebP, SVG or PDF.');
  }
  if (!meta.width || !meta.height || !meta.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
    throw new HttpError(400, 'That file is not artwork we can read. Upload PNG, JPG, WebP, SVG or PDF.');
  }

  try {
    const pipeline = sharp(buffer, { failOn: 'error' })
      .rotate() // honour EXIF orientation before metadata is stripped
      .resize({ width: ARTWORK_MAX_EDGE, height: ARTWORK_MAX_EDGE, fit: 'inside', withoutEnlargement: true });

    let format: StoredArtwork['format'];
    let encoded: { data: Buffer; info: sharp.OutputInfo };
    if (meta.format === 'png') {
      format = 'png';
      encoded = await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    } else if (meta.format === 'webp') {
      format = 'webp';
      encoded = await pipeline
        .webp(meta.hasAlpha ? { lossless: true } : { quality: 92 })
        .toBuffer({ resolveWithObject: true });
    } else {
      format = 'jpg';
      encoded = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    }

    const url = await writeHashed(encoded.data, format);
    return {
      url,
      format,
      bytes: encoded.data.length,
      width: encoded.info.width,
      height: encoded.info.height,
      rasterised: false,
    };
  } catch {
    throw new HttpError(400, 'That image could not be processed. Try exporting it again.');
  }
}

// ── Quote validation ─────────────────────────────────────────────────

export interface QuoteContact {
  customerName: string;
  company: string | null;
  email: string;
  phone: string | null;
  country: string;
  postcode: string | null;
  requiredBy: string | null;
}

export interface QuoteItem {
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  colorName: string | null;
  sizes: string[];
  quantity: number;
  method: string | null;
  locations: string[];
  designFiles: string[];
  notes: string | null;
}

type Body = Record<string, unknown>;

const str = (body: Body, key: string, max: number, required: boolean, errors: string[]): string | null => {
  const raw = body[key];
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (required) errors.push(`${key} is required`);
    return null;
  }
  if (typeof raw !== 'string') {
    errors.push(`${key} must be text`);
    return null;
  }
  const value = raw.trim();
  if (value.length > max) {
    errors.push(`${key} must be at most ${max} characters`);
    return null;
  }
  return value;
};

const strList = (body: Body, key: string, maxItems: number, maxLen: number, errors: string[]): string[] => {
  const raw = body[key];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > maxItems) {
    errors.push(`${key} must be a list of at most ${maxItems} entries`);
    return [];
  }
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.trim() === '' || entry.length > maxLen) {
      errors.push(`${key} contains an invalid entry`);
      return [];
    }
    out.push(entry.trim());
  }
  return Array.from(new Set(out));
};

export function parseContact(body: Body, errors: string[]): QuoteContact {
  const customerName = str(body, 'customerName', 120, true, errors);
  const email = str(body, 'email', 254, true, errors);
  if (email && !isValidEmail(email)) errors.push('email is not a valid address');
  const phone = str(body, 'phone', 32, false, errors);
  const country = str(body, 'country', 80, true, errors);
  return {
    customerName: customerName ?? '',
    company: str(body, 'company', 160, false, errors),
    email: (email ?? '').toLowerCase(),
    phone,
    country: country ?? '',
    postcode: str(body, 'postcode', 20, false, errors),
    requiredBy: str(body, 'requiredBy', 40, false, errors),
  };
}

const placementLine = (placement: Body): string | null => {
  const location = typeof placement.location === 'string' ? placement.location.slice(0, 40) : null;
  if (!location) return null;
  const parts = [location];
  if (typeof placement.method === 'string') parts.push(placement.method.slice(0, 40));
  if (typeof placement.templateId === 'string') parts.push(`template ${placement.templateId.slice(0, 60)}`);
  if (typeof placement.designFileName === 'string') parts.push(`file ${placement.designFileName.slice(0, 120)}`);
  if (typeof placement.widthPercent === 'number' && Number.isFinite(placement.widthPercent)) {
    parts.push(`${Math.round(placement.widthPercent)}% width`);
  }
  return parts.join(' · ');
};

/**
 * One garment line. Accepts either explicit `method` / `locations`, or the
 * storefront's `placements` list (what goes where, and how), from which both
 * are derived and a readable summary is added to the notes for the print team.
 */
export function parseItem(body: Body, errors: string[]): QuoteItem {
  const productId = str(body, 'productId', 80, true, errors);
  const productSlug = str(body, 'productSlug', 160, true, errors);
  const productName = str(body, 'productName', 200, true, errors);
  const sku = str(body, 'sku', 80, true, errors);
  const colorName = str(body, 'colorName', 80, false, errors);
  const sizes = strList(body, 'sizes', 20, 20, errors);

  const quantity = body.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    errors.push('quantity must be a whole number between 1 and 1,000,000');
  }

  let method = str(body, 'method', 120, false, errors);
  let locations = strList(body, 'locations', 8, 40, errors);
  let placementSummary: string[] = [];
  if (body.placements !== undefined && body.placements !== null) {
    if (!Array.isArray(body.placements) || body.placements.length > 8) {
      errors.push('placements must be a list of at most 8 entries');
    } else {
      const placements = body.placements.filter(
        (entry): entry is Body => typeof entry === 'object' && entry !== null
      );
      if (locations.length === 0) {
        locations = Array.from(
          new Set(placements.map((p) => p.location).filter((l): l is string => typeof l === 'string'))
        ).map((l) => l.slice(0, 40));
      }
      if (!method) {
        const methods = Array.from(
          new Set(placements.map((p) => p.method).filter((m): m is string => typeof m === 'string'))
        );
        method = methods.length > 0 ? methods.join(', ').slice(0, 120) : null;
      }
      placementSummary = placements.map(placementLine).filter((line): line is string => Boolean(line));
    }
  }

  const designFiles = strList(body, 'designFiles', 10, 200, errors);
  if (designFiles.some((url) => !ARTWORK_URL_RE.test(url))) {
    errors.push('designFiles must be artwork uploaded through /api/custom-wear/artwork');
  }

  const notes = str(body, 'notes', 4000, false, errors);
  const combinedNotes = [
    notes,
    placementSummary.length > 0 ? `Placements:\n${placementSummary.map((l) => `- ${l}`).join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    productId: productId ?? '',
    productSlug: productSlug ?? '',
    productName: productName ?? '',
    sku: sku ?? '',
    colorName,
    sizes,
    quantity: typeof quantity === 'number' ? quantity : 0,
    method,
    locations,
    designFiles,
    notes: combinedNotes || null,
  };
}

// ── References ───────────────────────────────────────────────────────

export const REFERENCE_RE = /^CWQ-\d{4}-\d{6}$/;

export const newReference = (): string =>
  `CWQ-${new Date().getFullYear()}-${randomInt(0, 1_000_000).toString().padStart(6, '0')}`;

export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Run `create` with a fresh reference, retrying on the (rare) collision with
 * an existing one. A million references a year leaves plenty of headroom.
 */
export async function withUniqueReference<T>(create: (reference: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await create(newReference());
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new HttpError(503, 'Could not issue a quote reference. Please try again.');
}
