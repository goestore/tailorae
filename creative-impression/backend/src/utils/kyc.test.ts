import { gstinCheckChar, isValidGstin, isValidIfsc, isValidPan, validateKyc } from '@/utils/kyc';

// A widely published sample GSTIN with a correct checksum.
const GOOD_GSTIN = '27AAPFU0939F1ZV';

describe('kyc', () => {
  it('accepts a real-shaped PAN and rejects others', () => {
    expect(isValidPan('AAPFU0939F')).toBe(true);
    expect(isValidPan(' aapfu0939f ')).toBe(true);
    expect(isValidPan('AAPF0939F')).toBe(false);
    expect(isValidPan('12345ABCDE')).toBe(false);
  });

  it('verifies the GSTIN checksum', () => {
    expect(gstinCheckChar(GOOD_GSTIN.slice(0, 14))).toBe('V');
    expect(isValidGstin(GOOD_GSTIN)).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZA')).toBe(false); // wrong check char
    expect(isValidGstin('00AAPFU0939F1ZV')).toBe(false); // no such state
  });

  it('checks IFSC shape', () => {
    expect(isValidIfsc('HDFC0001234')).toBe(true);
    expect(isValidIfsc('HDFC1001234')).toBe(false);
  });

  it('requires PAN and ties GSTIN to it', () => {
    expect(validateKyc({}).errors).toContain('PAN is required');
    expect(validateKyc({ pan: 'AAPFU0939F', gstin: GOOD_GSTIN }).errors).toEqual([]);
    expect(validateKyc({ pan: 'ABCDE1234F', gstin: GOOD_GSTIN }).errors).toContain(
      'GSTIN does not belong to this PAN'
    );
    expect(validateKyc({ pan: 'AAPFU0939F' })).toMatchObject({ gstin: null, errors: [] });
  });
});
