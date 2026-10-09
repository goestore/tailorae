import { apiClient } from '@/lib/api-client';
import { Order } from '@/types';

/**
 * Order numbers are minted server-side as `CI-<timestamp>-<suffix>`, while row
 * ids are cuids. Telling the two apart lets one route accept either without
 * spending a round trip discovering which it was handed.
 */

/**
 * Fetch one order by its human-facing order number, or by its id.
 *
 * `GET /orders/:id` is keyed on the id alone, so a number has to be resolved
 * through the customer's own order list first and the detail then re-read: the
 * list projection omits the shipping address and the seller split, which the
 * confirmation page shows. The extra hop is what buys the important property —
 * the URL carries the reference printed on the order and quoted in the
 * confirmation email, so it survives a refresh and can be sent to someone.
 *
 * Resolves to `null` when no order of the customer's matches; API failures
 * (including the 401 that the client interceptor turns into a sign-in) are
 * left to reject so the caller can tell "not yours" from "not reachable".
 */
export async function fetchOrderByReference(reference: string): Promise<Order | null> {
  const trimmed = reference.trim();
  if (!trimmed) return null;

  // The API resolves either the id or the order number in one request.
  const res = await apiClient.get(`/orders/${encodeURIComponent(trimmed)}`);
  return (res.data?.data?.order as Order | undefined) ?? null;
}

/** Where the confirmation for a freshly placed order lives. */
export const orderConfirmationPath = (orderNumber: string): string =>
  `/orders/${encodeURIComponent(orderNumber)}?placed=1`;
