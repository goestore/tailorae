/**
 * Money arrives from the API as integer paise (`pricePaise`, `totalPaise`…).
 * It stays in paise everywhere in the app — sums, comparisons, request bodies —
 * and becomes rupees only here, at the moment it is shown.
 */

const WHOLE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const FRACTIONAL = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `129900` → `₹1,299`, `129950` → `₹1,299.50`. Whole rupees drop the decimals;
 * a part-rupee amount always shows both digits, never `₹1,299.5`.
 */
export function formatPaise(paise: number | null | undefined): string {
  const value = Number.isFinite(paise) ? Math.round(paise as number) : 0;
  return value % 100 === 0 ? WHOLE.format(value / 100) : FRACTIONAL.format(value / 100);
}

/** Paise → rupees, for inputs and URLs that speak rupees (the price filter). */
export const paiseToRupees = (paise: number): number => paise / 100;

/** Rupees → paise, rounded to the nearest paisa. */
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
