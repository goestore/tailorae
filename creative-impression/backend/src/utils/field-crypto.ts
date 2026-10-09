import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Encryption for the few columns that must never sit in the database as
 * plaintext — today, a seller's bank account number.
 *
 * AES-256-GCM, so a tampered value fails to decrypt instead of decrypting to
 * garbage. Each value gets its own random IV. The stored form is
 * `enc:v1:<iv>:<tag>:<ciphertext>` (base64url), which makes it obvious in a
 * dump which rows are protected and lets a later key rotation add `v2`.
 *
 * Values written before encryption existed are plain strings without the
 * prefix. `decryptField` hands those back unchanged, so the app keeps working
 * while `scripts/encrypt-bank-details.ts` backfills them.
 *
 * Pattern borrowed from IXImpression's `core/field-crypto.js`.
 */

const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (raw) {
    const decoded = Buffer.from(raw, /^[0-9a-f]{64}$/i.test(raw) ? 'hex' : 'base64');
    if (decoded.length !== 32) {
      throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)');
    }
    cachedKey = decoded;
    return cachedKey;
  }

  // Production must have a real key. Deriving one from JWT_SECRET would tie
  // bank details to the token secret, and rotating that after a leak would
  // then make every stored account number unreadable.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FIELD_ENCRYPTION_KEY is not set — refusing to read or write bank details');
  }
  const fallback = process.env.JWT_SECRET || 'dev-only-field-key';
  console.warn(
    '[CRYPTO] FIELD_ENCRYPTION_KEY not set; deriving a development key. Never do this in production.'
  );
  cachedKey = createHash('sha256').update(`field-crypto:${fallback}`).digest();
  return cachedKey;
}

/** Throws at boot rather than on the first payout if the key is unusable. */
export function assertFieldCryptoReady(): void {
  key();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptField(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (isEncrypted(value)) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (!isEncrypted(value)) return value; // legacy plaintext, pending backfill

  const [iv, tag, ciphertext] = value.slice(PREFIX.length).split(':');
  if (!iv || !tag || !ciphertext) throw new Error('Malformed encrypted field');

  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** The last four digits, for "which account is on file" without revealing it. */
export function last4(value: string | null | undefined): string | null {
  const plain = decryptField(value);
  return plain ? plain.slice(-4) : null;
}

/** Test hook: forget the cached key after changing the environment. */
export function resetFieldCryptoForTests(): void {
  cachedKey = null;
}
