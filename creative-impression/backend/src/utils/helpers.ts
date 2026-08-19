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
export const sanitizeUser = <T extends { password?: unknown; twoFactorSecret?: unknown }>(
  user: T
): Omit<T, 'password' | 'twoFactorSecret'> => {
  const { password: _password, twoFactorSecret: _twoFactorSecret, ...rest } = user;
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

  return { data, errors };
};

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
