import {
  decryptField,
  encryptField,
  isEncrypted,
  last4,
  resetFieldCryptoForTests,
} from '@/utils/field-crypto';

beforeEach(() => {
  process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);
  resetFieldCryptoForTests();
});

describe('field-crypto', () => {
  it('round-trips a value and never stores the plaintext', () => {
    const stored = encryptField('123456789012')!;
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain('123456789012');
    expect(decryptField(stored)).toBe('123456789012');
  });

  it('uses a fresh IV each time, so equal accounts do not look equal', () => {
    expect(encryptField('1111')).not.toBe(encryptField('1111'));
  });

  it('passes legacy plaintext through so un-backfilled rows still work', () => {
    expect(decryptField('98765')).toBe('98765');
    expect(last4('9876543210')).toBe('3210');
  });

  it('does not double-encrypt', () => {
    const once = encryptField('42')!;
    expect(encryptField(once)).toBe(once);
  });

  it('treats empty as null', () => {
    expect(encryptField('')).toBeNull();
    expect(decryptField(null)).toBeNull();
  });

  it('rejects a tampered value instead of returning garbage', () => {
    const stored = encryptField('123456789012')!;
    const parts = stored.split(':');
    const ct = Buffer.from(parts[4], 'base64url');
    ct[0] ^= 0xff;
    parts[4] = ct.toString('base64url');
    expect(() => decryptField(parts.join(':'))).toThrow();
  });

  it('cannot be read with a different key', () => {
    const stored = encryptField('123456789012')!;
    process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(64);
    resetFieldCryptoForTests();
    expect(() => decryptField(stored)).toThrow();
  });
});
