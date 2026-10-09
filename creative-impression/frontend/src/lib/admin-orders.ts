'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * One order, as an administrator sees it.
 *
 * `GET /orders/:id` already lets an admin through, but it is the customer's
 * own view of their order and omits the account behind it — so the console
 * reads its own endpoint instead of widening that one.
 *
 * The status vocabulary lives here rather than in a screen because two screens
 * need it: the table advances an order one step, and the detail page cancels
 * or returns it. Neither should hold its own copy of what the enum allows.
 */

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;

export type AdminOrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Statuses an order is finished at. Mirrors `CLOSED_STATUSES` in the backend's
 * `utils/order-status`, which answers 409 rather than 400 — so the console
 * disables a control instead of offering a click that will be refused.
 */
export const CLOSED_ORDER_STATUSES: readonly AdminOrderStatus[] = [
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
];

/** An order can be called off at any point before it closes. */
export const canCancel = (status: AdminOrderStatus): boolean =>
  !CLOSED_ORDER_STATUSES.includes(status);

/**
 * Goods can only come back after they arrived, so this is the one move out of
 * a closed status the server allows. Marking it here runs the same refund and
 * restock as completing a return request.
 */
export const canMarkReturned = (status: AdminOrderStatus): boolean => status === 'DELIVERED';

/** The happy path, one step at a time. Cancelling and returning sit outside it. */
export const NEXT_ORDER_STATUS: Partial<Record<AdminOrderStatus, AdminOrderStatus>> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'PROCESSING',
  PROCESSING: 'READY_FOR_SHIPMENT',
  READY_FOR_SHIPMENT: 'SHIPPED',
  SHIPPED: 'DELIVERED',
};

/** `READY_FOR_SHIPMENT` reads badly in a sentence and worse in a button. */
export const statusLabel = (status: string): string =>
  status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export interface AdminOrderCustomer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone?: string | null;
  role?: string;
}

export interface AdminOrderProduct {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
}

export interface AdminOrderVariant {
  id: string;
  name: string;
  size: string | null;
  color: string | null;
  sku: string;
}

export interface AdminOrderLine {
  id: string;
  productId: string;
  product: AdminOrderProduct | null;
  variantId?: string | null;
  variant?: AdminOrderVariant | null;
  sellerOrderId?: string | null;
  quantity: number;
  price: number;
  discount: number;
  sku: string;
  mockupImage?: string | null;
  /** Whatever the shopper chose, keyed by option. Heterogeneous by design. */
  customization?: Record<string, unknown> | null;
}

export interface AdminOrderAddress {
  id: string;
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstNumber?: string | null;
}

export interface AdminSellerOrder {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  vendor: { id: string; shopName: string; shopSlug: string } | null;
  items: Array<{ id: string }>;
  subtotal: number;
  discount: number;
  shippingCost: number;
  total: number;
  commissionRate: number;
  commissionAmount: number;
  payoutAmount: number;
  settledAt: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface AdminOrderTimelineEntry {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  paymentStatus: string;
  paymentMethod: string | null;
  total: number;
  createdAt: string;
  user: AdminOrderCustomer | null;
  items: AdminOrderLine[];
  subtotal: number;
  discount: number;
  discountCode: string | null;
  tax: number;
  gstAmount: number;
  gstNumber: string | null;
  shippingCost: number;
  isB2B: boolean;
  isBulkOrder: boolean;
  notes: string | null;
  adminNotes: string | null;
  paymentId: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  updatedAt: string;
  shippingAddress: AdminOrderAddress | null;
  billingAddress: AdminOrderAddress | null;
  sellerOrders: AdminSellerOrder[];
  timeline: AdminOrderTimelineEntry[];
  returnRequest: {
    id: string;
    reason: string;
    requestType: string;
    description: string | null;
    status: string;
    refundAmount: number | null;
    createdAt: string;
  } | null;
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail> {
  try {
    const response = await apiClient.get(`/admin/orders/${encodeURIComponent(id)}`);
    const order = response.data?.data?.order;
    if (!order) throw new Error('That order could not be found.');
    return order as AdminOrderDetail;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load that order.'));
  }
}

/**
 * Move an order to a status.
 *
 * Any value the enum allows, not just the next one along — cancelling and
 * marking returned are the two an admin actually reaches for, and neither is a
 * step in the fulfilment chain. The cascade onto seller sub-orders is the
 * server's job; this only ever sends the parent status.
 */
export async function setAdminOrderStatus(id: string, status: AdminOrderStatus): Promise<string> {
  try {
    const response = await apiClient.patch(`/admin/orders/${encodeURIComponent(id)}/status`, {
      status,
    });
    return response.data?.message ?? 'Order updated.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that order.'));
  }
}

// ============================================
// Payment
// ============================================

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;
export type AdminPaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Record a payment fact by hand: a bank transfer that landed, a COD parcel
 * refused, a refund made outside the gateway. It does not move money.
 */
export async function setAdminOrderPayment(
  id: string,
  input: { paymentStatus: AdminPaymentStatus; paymentId?: string; notes?: string }
): Promise<string> {
  try {
    const response = await apiClient.patch(`/admin/orders/${encodeURIComponent(id)}/payment`, input);
    return response.data?.message ?? 'Payment updated';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update the payment.'));
  }
}

/**
 * Refund through Razorpay. Leave `amount` out for a full refund. Only works
 * for orders paid through the gateway; the API says why when it cannot.
 */
export async function refundAdminOrder(
  orderId: string,
  input: { amount?: number; reason?: string }
): Promise<string> {
  try {
    const response = await apiClient.post('/payments/razorpay/refund', { orderId, ...input });
    return response.data?.message ?? 'Refund issued';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not issue the refund.'));
  }
}
