'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * One order, as staff see it (`GET /admin/orders/{id}`, SUPPORT or FINANCE).
 *
 * The status vocabulary lives here rather than in a screen because two screens
 * need it: the table advances an order one step, and the detail page cancels
 * or returns it. Neither should hold its own copy of what the enum allows.
 *
 * Every amount is integer paise.
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
 * Statuses an order is finished at. Mirrors `OrderStatusRules.CLOSED` in the
 * API, which answers 409 rather than 400 — so the console disables a control
 * instead of offering a click that will be refused.
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
  status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;
export type AdminPaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** An address snapshot as the order stored it. */
export interface AdminOrderAddress {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  gstin?: string | null;
}

export interface AdminOrderLine {
  id: string;
  productId: string;
  productSlug: string | null;
  variantId: string | null;
  sellerId: string;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  thumbnail: string | null;
  quantity: number;
  unitPaise: number;
  discountPaise: number;
  /** Whatever the shopper chose, keyed by option. Heterogeneous by design. */
  customization: Record<string, unknown> | null;
  mockupImage: string | null;
}

/** One shop's part of the order: its own parcel, status and tracking. */
export interface AdminSellerPart {
  id: string;
  orderNumber: string;
  sellerId: string;
  shopName: string;
  status: AdminOrderStatus;
  totalPaise: number;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface AdminOrderTimelineEntry {
  status: string;
  message: string | null;
  createdAt: string;
}

export interface AdminReturnRequest {
  id: string;
  requestType: string;
  reason: string;
  description: string | null;
  images: string[];
  status: string;
  refundPaise: number | null;
  refundedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  customerId: string;
  status: AdminOrderStatus;
  paymentStatus: AdminPaymentStatus;
  paymentMethod: 'COD' | 'RAZORPAY';
  shippingAddress: AdminOrderAddress | null;
  billingAddress: AdminOrderAddress | null;
  contactEmail: string;
  subtotalPaise: number;
  discountPaise: number;
  couponCode: string | null;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  refundedPaise: number;
  trackingNumber: string | null;
  carrier: string | null;
  deliveredAt: string | null;
  notes: string | null;
  adminNotes: string | null;
  /** An unpaid online order is cancelled after this. */
  paymentDueBy: string | null;
  createdAt: string;
  items: AdminOrderLine[];
  sellerOrders: AdminSellerPart[];
  timeline: AdminOrderTimelineEntry[];
  returnRequest: AdminReturnRequest | null;
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

export interface StatusChange {
  status: AdminOrderStatus;
  /** Shown on the order's timeline. */
  message?: string;
  trackingNumber?: string;
  carrier?: string;
}

/**
 * Move an order to a status (SUPPORT). The cascade onto the shops' parts is
 * the server's job; this only ever sends the parent status. RETURNED runs the
 * same refund and restock as completing a return.
 */
export async function setAdminOrderStatus(id: string, change: StatusChange): Promise<string> {
  try {
    const body = Object.fromEntries(
      Object.entries(change).filter(([, value]) => value !== undefined && value !== '')
    );
    const response = await apiClient.patch(`/admin/orders/${encodeURIComponent(id)}/status`, body);
    return response.data?.message ?? 'Order updated.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that order.'));
  }
}

/** Cancel the whole order (SUPPORT). The reason is required; the customer sees it. */
export async function cancelAdminOrder(id: string, reason: string): Promise<string> {
  try {
    const response = await apiClient.post(`/admin/orders/${encodeURIComponent(id)}/cancel`, {
      reason,
    });
    return response.data?.message ?? 'Order cancelled.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not cancel that order.'));
  }
}

/** Staff-only notes on the order (SUPPORT). Never shown to the customer. */
export async function saveAdminOrderNotes(id: string, adminNotes: string): Promise<string> {
  try {
    const response = await apiClient.patch(`/admin/orders/${encodeURIComponent(id)}/notes`, {
      adminNotes,
    });
    return response.data?.message ?? 'Notes saved.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save the notes.'));
  }
}

/**
 * Refund through Razorpay (FINANCE). Leave `amountPaise` out for everything
 * still refundable. Only orders paid online can be refunded this way; the API
 * says why when it cannot.
 */
export async function refundAdminOrder(
  orderId: string,
  input: { amountPaise?: number; reason: string }
): Promise<string> {
  try {
    const response = await apiClient.post(
      `/admin/orders/${encodeURIComponent(orderId)}/refund`,
      input
    );
    return response.data?.message ?? 'Refund sent.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not issue the refund.'));
  }
}

/**
 * Decide a return or exchange request (SUPPORT). COMPLETED means the goods are
 * back: the order becomes RETURNED, stock is restored, the shops' earnings
 * are reversed and the refund (`refundPaise`, default the refundable rest) is
 * raised.
 */
export async function decideReturn(
  returnId: string,
  input: { status: 'APPROVED' | 'REJECTED' | 'COMPLETED'; refundPaise?: number; notes?: string }
): Promise<string> {
  try {
    const response = await apiClient.patch(`/admin/returns/${encodeURIComponent(returnId)}`, input);
    return response.data?.message ?? 'Return updated.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not record that decision.'));
  }
}
