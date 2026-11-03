import { apiClient } from '@/lib/api-client';
import type { CouponPreview } from '@/lib/api/types';
import type { Cart } from '@/types';

/**
 * The shopper's bag. Every call answers `{cart}` with the whole bag, repriced:
 * `unitPaise` per line, `subtotalPaise`, and `problems` naming any line that
 * cannot be bought as it stands.
 */

export interface AddToCartInput {
  productId: string;
  /** Required for a product with sizes or options. */
  variantId?: string;
  quantity: number;
  customization?: Record<string, unknown>;
  mockupImage?: string;
  isBulkOrder?: boolean;
}

const unwrap = (data: unknown): Cart => {
  const cart = (data as { data?: { cart?: Cart } })?.data?.cart;
  if (!cart) throw new Error('Unexpected response from the server.');
  return cart;
};

/** Silent: an anonymous visitor simply has no bag. */
export async function getCart(): Promise<Cart> {
  const response = await apiClient.get('/cart', { silent: true });
  return unwrap(response.data);
}

export async function addToCart(input: AddToCartInput): Promise<Cart> {
  const response = await apiClient.post('/cart/items', input);
  return unwrap(response.data);
}

/** Quantity 0 removes the line. */
export async function updateCartLine(id: string, quantity: number): Promise<Cart> {
  const response = await apiClient.patch(`/cart/items/${encodeURIComponent(id)}`, { quantity });
  return unwrap(response.data);
}

export async function removeCartLine(id: string): Promise<Cart> {
  const response = await apiClient.delete(`/cart/items/${encodeURIComponent(id)}`);
  return unwrap(response.data);
}

export async function emptyCart(): Promise<Cart> {
  const response = await apiClient.delete('/cart');
  return unwrap(response.data);
}

/** Prices a coupon against the shopper's own bag. Throws with the API's reason when it does not apply. */
export async function applyCoupon(code: string): Promise<CouponPreview> {
  const response = await apiClient.post('/coupons/apply', { code });
  return response.data?.data as CouponPreview;
}
