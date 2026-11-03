import axios from 'axios';

/**
 * Extract the backend envelope's `message` from an API error.
 * The backend responds with `{ success: false, message: string }` on failures.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (error.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
    if (!error.response) return 'Could not reach the server. Please check your connection.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Status code of an API error, if any. */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) return error.response?.status;
  return undefined;
}

/**
 * Shipping, in paise: free once (subtotal − discount) reaches ₹999, otherwise a
 * flat ₹79 — the API's defaults (`shipping.free_above_paise`,
 * `shipping.flat_paise`). Only an estimate for the summary: staff can change
 * both settings, there is no public endpoint to read them, and the order the
 * API creates carries the real `shippingPaise`.
 */
export const FREE_SHIPPING_THRESHOLD_PAISE = 99_900;
export const FLAT_SHIPPING_PAISE = 7_900;

export function calculateShipping(subtotalPaise: number, discountPaise = 0): number {
  return subtotalPaise - discountPaise >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : FLAT_SHIPPING_PAISE;
}
