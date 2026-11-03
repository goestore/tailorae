import { apiClient } from '@/lib/api-client';
import type { CheckoutRequest, ReturnRequestBody } from '@/lib/api/types';
import type { Order, OrderSummary, PaymentMethod } from '@/types';

/**
 * The shopper's orders. Order numbers are minted server-side as
 * `TL-<timestamp>-<suffix>`; every endpoint taking an order accepts either
 * that number or the row id.
 */

/** What checkout sends: a saved address by id, or a new one in full. */
export type PlaceOrderInput = Omit<CheckoutRequest, 'shippingAddress' | 'paymentMethod'> & {
  paymentMethod: PaymentMethod;
  /** `isDefault` rather than the schema's `default`: that is what the API reads. */
  shippingAddress?: Omit<NonNullable<CheckoutRequest['shippingAddress']>, 'default'> & {
    isDefault?: boolean;
  };
};

export interface PlacedOrder {
  order: Order;
  /** Whether money is still owed, and how — COD orders need nothing more. */
  payment: { required: boolean; method: PaymentMethod };
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const response = await apiClient.post('/orders', input);
  const data = response.data?.data as PlacedOrder | undefined;
  if (!data?.order) throw new Error('Unexpected response from the server.');
  return data;
}

export interface OrdersPage {
  orders: OrderSummary[];
  total: number;
  pages: number;
}

/** One page of the shopper's orders, newest first. */
export async function listOrders(page = 1, limit = 10): Promise<OrdersPage> {
  const response = await apiClient.get('/orders', { params: { page, limit } });
  const data = response.data?.data as
    | { items?: OrderSummary[]; total?: number; pages?: number }
    | undefined;
  return { orders: data?.items ?? [], total: data?.total ?? 0, pages: data?.pages ?? 1 };
}

/**
 * Fetch one order by its human-facing order number, or by its id. The URL
 * carries the reference printed on the order and quoted in the confirmation
 * email, so it survives a refresh and can be sent to someone.
 *
 * Resolves to `null` when the API has no such order for this shopper; other
 * failures (including the 401 the client turns into a sign-in) reject, so the
 * caller can tell "not yours" from "not reachable".
 */
export async function fetchOrderByReference(reference: string): Promise<Order | null> {
  const trimmed = reference.trim();
  if (!trimmed) return null;
  const res = await apiClient.get(`/orders/${encodeURIComponent(trimmed)}`);
  return (res.data?.data?.order as Order | undefined) ?? null;
}

/** Cancels an order that has not shipped. Resolves to the updated order. */
export async function cancelOrder(id: string): Promise<Order> {
  const res = await apiClient.patch(`/orders/${encodeURIComponent(id)}/cancel`);
  return res.data?.data?.order as Order;
}

/** Raises a return (or exchange) on a delivered order. */
export async function requestReturn(id: string, body: ReturnRequestBody): Promise<Order> {
  const res = await apiClient.patch(`/orders/${encodeURIComponent(id)}/return`, body);
  return res.data?.data?.order as Order;
}

/** Where the confirmation for a freshly placed order lives. */
export const orderConfirmationPath = (orderNumber: string): string =>
  `/orders/${encodeURIComponent(orderNumber)}?placed=1`;
