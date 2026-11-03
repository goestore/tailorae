/**
 * Seller identity checks for India: PAN, GSTIN and IFSC.
 *
 * A public marketplace pays out to whoever registers, so a seller's tax
 * identity is checked for shape and internal consistency before an admin ever
 * sees it. This does not prove the registration is real; that needs the GSTN
 * API or a human looking at the certificate. It does catch typos and made-up
 * numbers, which is most of what arrives.
 *
 * Format checks follow CreativeKids' `lib/gstin.js`. The checksum is new here.
 */

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const normalizeId = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : '';

export function isValidPan(value: unknown): boolean {
  return PAN_RE.test(normalizeId(value));
}

export function isValidIfsc(value: unknown): boolean {
  return IFSC_RE.test(normalizeId(value));
}

/** The 15th character of a GSTIN, computed from the first 14. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = BASE36.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36];
}

export function isValidGstin(value: unknown): boolean {
  const g = normalizeId(value);
  if (!GSTIN_RE.test(g)) return false;
  const state = Number(g.slice(0, 2));
  if (state < 1 || (state > 38 && state !== 97 && state !== 99)) return false;
  return gstinCheckChar(g.slice(0, 14)) === g[14];
}

export interface KycInput {
  pan?: unknown;
  gstin?: unknown;
}

/**
 * Validate what a seller submitted. PAN is required. GSTIN is optional,
 * because small sellers below the threshold may not have one, but when given
 * it must embed the same PAN.
 */
export function validateKyc(input: KycInput): {
  pan: string | null;
  gstin: string | null;
  errors: string[];
} {
  const errors: string[] = [];
  const pan = normalizeId(input.pan);
  const gstin = normalizeId(input.gstin);

  if (!pan) errors.push('PAN is required');
  else if (!isValidPan(pan)) errors.push('PAN must look like ABCDE1234F');

  if (gstin) {
    if (!isValidGstin(gstin)) errors.push('GSTIN is not valid. Check for a typo');
    else if (pan && gstin.slice(2, 12) !== pan) errors.push('GSTIN does not belong to this PAN');
  }

  return { pan: pan || null, gstin: gstin || null, errors };
}
