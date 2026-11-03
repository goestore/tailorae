import { canonicalFamily } from '@/utils/colour-families';
import { ProductStatus } from '@prisma/client';

/**
 * Error that carries an HTTP status code so route handlers (and
 * transaction callbacks) can signal the right response from deep code.
 */
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Send the standard error envelope for a caught error. */
export const isHttpError = (error: unknown): error is HttpError => error instanceof HttpError;

/** Remove sensitive fields from a user record before returning it. */
export const sanitizeUser = <
  T extends {
    password?: unknown;
    twoFactorSecret?: unknown;
    loginAttempts?: unknown;
    lockUntil?: unknown;
  },
>(
  user: T
): Omit<T, 'password' | 'twoFactorSecret' | 'loginAttempts' | 'lockUntil'> => {
  /**
   * `loginAttempts` and `lockUntil` are the lockout counters. They are only
   * ever the account holder's own numbers, so this is self-disclosure rather
   * than a leak — but they are bookkeeping no client has a use for, and
   * publishing how many attempts remain is a courtesy to anyone working
   * through a password list against an account they have already reached.
   */
  const {
    password: _password,
    twoFactorSecret: _twoFactorSecret,
    loginAttempts: _loginAttempts,
    lockUntil: _lockUntil,
    ...rest
  } = user;
  return rest;
};

export const isValidEmail = (email: unknown): email is string =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Parse page/limit query params with sane bounds. */
export const parsePagination = (
  query: Record<string, unknown>,
  defaultLimit = 12,
  maxLimit = 50
): { page: number; limit: number; skip: number } => {
  const rawPage = parseInt(String(query.page ?? '1'), 10);
  const rawLimit = parseInt(String(query.limit ?? String(defaultLimit)), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Math.min(maxLimit, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit);
  return { page, limit, skip: (page - 1) * limit };
};

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Short random uppercase alphanumeric suffix for order/RFQ numbers. */
export const randomSuffix = (length = 4): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

// ============================================
// Product field whitelist (shared by /products and /admin/products)
// ============================================

const PRODUCT_STRING_FIELDS = [
  'name',
  'slug',
  'description',
  'shortDescription',
  'categoryId',
  // Nullable on the model, so an empty string has to clear it rather than
  // store "" — handled where these are read, below.
  'brandId',
  'sku',
  'barcode',
  'dimensions',
  'material',
  'color',
  'sizeGuide',
  'thumbnail',
  'videoUrl',
  'metaTitle',
  'metaDescription',
  'metaKeywords',
] as const;

const PRODUCT_FLOAT_FIELDS = ['price', 'costPrice', 'originalPrice', 'discountPercentage', 'weight'] as const;

const PRODUCT_INT_FIELDS = ['quantity', 'minOrderQuantity', 'maxOrderQuantity'] as const;

const PRODUCT_BOOL_FIELDS = ['isFeatured', 'isCustomizable', 'allowBulkOrders'] as const;

/**
 * Build a Prisma-safe product data object from a request body.
 * Only whitelisted fields are picked — raw req.body is never passed to Prisma.
 * Returns collected validation errors for any provided-but-invalid field.
 */
export const pickProductFields = (
  body: Record<string, unknown>
): { data: Record<string, unknown>; errors: string[] } => {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const field of PRODUCT_STRING_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      errors.push(`${field} must be a string`);
    } else if (field === 'brandId' && value.trim() === '') {
      // "No brand" is a real choice in a form, and it arrives as an empty
      // string. Storing that would leave a foreign key pointing at nothing.
      data[field] = null;
    } else {
      data[field] = value;
    }
  }

  for (const field of PRODUCT_FLOAT_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      errors.push(`${field} must be a non-negative number`);
    } else {
      data[field] = num;
    }
  }

  for (const field of PRODUCT_INT_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) {
      errors.push(`${field} must be a non-negative integer`);
    } else {
      data[field] = num;
    }
  }

  for (const field of PRODUCT_BOOL_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      errors.push(`${field} must be a boolean`);
    } else {
      data[field] = value;
    }
  }

  // Swatch colours: { "Navy Blue": "#1F2A44" }. Only #RRGGBB values are kept;
  // null clears them all.
  if (body.colourHexes !== undefined) {
    const raw = body.colourHexes;
    if (raw === null) {
      data.colourHexes = null;
    } else if (typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push('colourHexes must be an object of colour name to #RRGGBB');
    } else {
      const clean: Record<string, string> = {};
      for (const [name, hex] of Object.entries(raw as Record<string, unknown>)) {
        if (!name.trim()) continue;
        if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex.trim())) {
          errors.push(`Swatch for "${name}" must be a colour like #1F2A44`);
          continue;
        }
        clean[name.trim().slice(0, 60)] = hex.trim().toUpperCase();
      }
      data.colourHexes = Object.keys(clean).length > 0 ? clean : null;
    }
  }

  // The product's own colour family (listings without variants filter on it).
  if (body.colorFamily !== undefined) {
    if (body.colorFamily === null || body.colorFamily === '') data.colorFamily = null;
    else if (typeof body.colorFamily !== 'string' || !canonicalFamily(body.colorFamily)) {
      errors.push(`"${String(body.colorFamily)}" is not a colour family`);
    } else data.colorFamily = canonicalFamily(body.colorFamily)!.name;
  }

  if (body.status !== undefined) {
    const statuses = Object.values(ProductStatus) as string[];
    if (typeof body.status !== 'string' || !statuses.includes(body.status)) {
      errors.push(`status must be one of: ${statuses.join(', ')}`);
    } else {
      data.status = body.status;
    }
  }

  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.some((img) => typeof img !== 'string')) {
      errors.push('images must be an array of strings');
    } else {
      data.images = body.images;
    }
  }

  pickListingFields(body, data, errors);

  return { data, errors };
};

/**
 * Marketplace listing fields (the Myntra template's business, content and
 * packaging columns). Shape is checked here; whether a value is one of
 * Myntra's dropdown options is checked per article type by
 * `validateListingValues` in utils/product-spec.ts.
 */
const LISTING_TEXT_FIELDS: Record<string, number> = {
  articleType: 60,
  styleGroupId: 80,
  colourGroupId: 80,
  displayName: 200,
  listViewName: 120,
  brandColour: 80,
  primaryColour: 40,
  secondaryColour: 40,
  tertiaryColour: 40,
  ageGroup: 40,
  fashionType: 40,
  usage: 40,
  season: 40,
  hsn: 8,
  manufacturerDetails: 500,
  packerDetails: 500,
  importerDetails: 500,
  styleNote: 2000,
  materialCare: 1000,
  sizeAndFit: 1000,
  measurementBasis: 80,
  netQuantityUnit: 20,
  numberOfItems: 20,
  multipackSet: 20,
  packageContains: 200,
};

const IMAGE_ANGLES = ['front', 'back', 'side', 'detail', 'lookShot', 'additional1', 'additional2'];

function pickListingFields(body: Record<string, unknown>, data: Record<string, unknown>, errors: string[]): void {
  for (const [field, max] of Object.entries(LISTING_TEXT_FIELDS)) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || value === '') data[field] = null;
    else if (typeof value !== 'string') errors.push(`${field} must be a string`);
    else data[field] = value.trim().slice(0, max);
  }

  for (const field of ['year', 'netQuantity'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || value === '') {
      data[field] = null;
      continue;
    }
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0 || num > 100000) errors.push(`${field} must be a whole number`);
    else data[field] = num;
  }

  for (const field of ['countriesOfOrigin', 'tags'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      errors.push(`${field} must be a list of text values`);
    } else {
      data[field] = [...new Set((value as string[]).map((v) => v.trim()).filter(Boolean))].slice(
        0,
        field === 'tags' ? 30 : 5
      );
    }
  }

  if (body.attributes !== undefined) {
    if (body.attributes === null) data.attributes = null;
    else if (typeof body.attributes !== 'object' || Array.isArray(body.attributes)) {
      errors.push('attributes must be an object');
    } else data.attributes = { ...(body.attributes as Record<string, unknown>) };
  }

  if (body.imageAngles !== undefined) {
    if (body.imageAngles === null) data.imageAngles = null;
    else if (typeof body.imageAngles !== 'object' || Array.isArray(body.imageAngles)) {
      errors.push('imageAngles must be an object');
    } else {
      const angles: Record<string, string> = {};
      for (const [angle, url] of Object.entries(body.imageAngles as Record<string, unknown>)) {
        if (!IMAGE_ANGLES.includes(angle)) errors.push(`${angle} is not an image angle`);
        else if (url === null || url === '') continue;
        else if (typeof url !== 'string' || url.length > 1000) errors.push(`${angle} image must be a URL`);
        else angles[angle] = url;
      }
      data.imageAngles = angles;
    }
  }

  if (body.bisCertificate !== undefined) {
    if (body.bisCertificate === null) data.bisCertificate = null;
    else if (typeof body.bisCertificate !== 'object' || Array.isArray(body.bisCertificate)) {
      errors.push('bisCertificate must be an object');
    } else {
      const bis = body.bisCertificate as Record<string, unknown>;
      const clean: Record<string, string> = {};
      for (const key of ['number', 'imageUrl', 'expiryDate']) {
        if (typeof bis[key] === 'string' && (bis[key] as string).trim()) clean[key] = (bis[key] as string).trim().slice(0, 500);
      }
      data.bisCertificate = Object.keys(clean).length ? clean : null;
    }
  }
}

// ============================================
// Address input (shared by orders checkout and user address book)
// ============================================

export interface AddressInput {
  type: string;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstNumber: string | null;
}

/** Validate and whitelist an address payload. */
export const parseAddressInput = (
  body: unknown,
  label = 'address'
): { address?: AddressInput; errors: string[] } => {
  if (typeof body !== 'object' || body === null) {
    return { errors: [`${label} must be an object`] };
  }
  const raw = body as Record<string, unknown>;
  const errors: string[] = [];

  const required = ['fullName', 'phoneNumber', 'addressLine1', 'city', 'state', 'postalCode', 'country'] as const;
  for (const field of required) {
    if (!isNonEmptyString(raw[field])) errors.push(`${label}.${field} is required`);
  }
  if (raw.email !== undefined && raw.email !== null && raw.email !== '' && !isValidEmail(raw.email)) {
    errors.push(`${label}.email must be a valid email`);
  }
  if (errors.length > 0) return { errors };

  return {
    errors: [],
    address: {
      type: isNonEmptyString(raw.type) ? raw.type.trim() : 'home',
      fullName: (raw.fullName as string).trim(),
      phoneNumber: (raw.phoneNumber as string).trim(),
      email: isNonEmptyString(raw.email) ? raw.email.trim() : null,
      addressLine1: (raw.addressLine1 as string).trim(),
      addressLine2: isNonEmptyString(raw.addressLine2) ? raw.addressLine2.trim() : null,
      city: (raw.city as string).trim(),
      state: (raw.state as string).trim(),
      postalCode: (raw.postalCode as string).trim(),
      country: (raw.country as string).trim(),
      gstNumber: isNonEmptyString(raw.gstNumber) ? raw.gstNumber.trim() : null,
    },
  };
};

/** Parse a date-ish input; returns undefined when absent, null when invalid. */
export const parseDateInput = (value: unknown): Date | null | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Rupees, as they are written to a person: symbol, Indian grouping, two decimals. */
export const formatRupees = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
