import { describe, expect, it } from 'vitest';
import { formatPaise, rupeesToPaise } from './money';

// Intl may separate the symbol with a narrow no-break space on some ICU builds.
const normalise = (value: string) => value.replace(/\s/g, '');

describe('formatPaise', () => {
  it('drops the decimals for whole rupees', () => {
    expect(normalise(formatPaise(129900))).toBe('₹1,299');
    expect(normalise(formatPaise(0))).toBe('₹0');
  });

  it('always shows two decimals for part-rupee amounts', () => {
    expect(normalise(formatPaise(129950))).toBe('₹1,299.50');
    expect(normalise(formatPaise(5))).toBe('₹0.05');
  });

  it('groups lakhs the Indian way', () => {
    expect(normalise(formatPaise(12345678900))).toBe('₹12,34,56,789');
  });

  it('treats a missing amount as zero', () => {
    expect(normalise(formatPaise(undefined))).toBe('₹0');
    expect(normalise(formatPaise(null))).toBe('₹0');
  });
});

describe('rupeesToPaise', () => {
  it('rounds to the nearest paisa', () => {
    expect(rupeesToPaise(1299.5)).toBe(129950);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });
});
