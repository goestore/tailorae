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

/** Shipping is free at (subtotal - discount) >= 999, otherwise a flat 49. */
export const FREE_SHIPPING_THRESHOLD = 999;
export const FLAT_SHIPPING_COST = 49;

export function calculateShipping(subtotal: number, discount = 0): number {
  return subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_COST;
}
