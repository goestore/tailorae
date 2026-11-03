'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { toQueueCounts, type AdminQueueCounts } from '@/lib/admin-moderation';

/**
 * The console's two summary reads: the dashboard (`GET /admin/dashboard`, any
 * staff member) and the sales report over a range (`GET /admin/reports`,
 * FINANCE or SUPPORT). Every amount is integer paise.
 */

export interface DashboardStats {
  totalCustomers: number;
  totalRevenuePaise: number;
  codPendingRevenuePaise: number;
  ordersToday: number;
  ordersThisMonth: number;
  gmvThisMonthPaise: number;
  ordersToShip: number;
  liveProducts: number;
  productsWithoutImages: number;
  liveSellers: number;
}

export interface Dashboard {
  stats: DashboardStats;
  /** The last seven days, oldest first. */
  week: Array<{ date: string; revenuePaise: number; orders: number }>;
  lowStock: Array<{ id: string; name: string; quantity: number; shopName: string | null }>;
  topProducts: Array<{
    id: string;
    name: string;
    pricePaise: number;
    category: string | null;
    unitsSold: number;
  }>;
  codPending: Array<{
    id: string;
    orderNumber: string;
    totalPaise: number;
    customerEmail: string | null;
    createdAt: string;
  }>;
  queues: AdminQueueCounts;
}

export async function getDashboard(): Promise<Dashboard> {
  try {
    const response = await apiClient.get('/admin/dashboard');
    const data = (response.data?.data ?? {}) as Partial<Dashboard> & {
      queues?: Record<string, unknown>;
    };
    return {
      stats: (data.stats ?? {}) as DashboardStats,
      week: data.week ?? [],
      lowStock: data.lowStock ?? [],
      topProducts: data.topProducts ?? [],
      codPending: data.codPending ?? [],
      queues: toQueueCounts(data.queues),
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the dashboard.'));
  }
}

export interface SalesReport {
  from: string;
  to: string;
  totals: {
    orders: number;
    gmvPaise: number;
    discountsPaise: number;
    shippingPaise: number;
    refundsPaise: number;
    averageOrderPaise: number;
    commissionPaise: number;
  };
  byDay: Array<{ date: string; orders: number; gmvPaise: number }>;
  bySeller: Array<{
    sellerId: string;
    shopName: string;
    orders: number;
    gmvPaise: number;
    commissionPaise: number;
  }>;
  byCategory: Array<{ category: string; units: number; revenuePaise: number }>;
  topProducts: Array<{
    id: string;
    name: string;
    pricePaise: number;
    category: string | null;
    unitsSold: number;
  }>;
}

/** `from`/`to` are `YYYY-MM-DD`; the API defaults to the last thirty days. */
export async function getSalesReport(from?: string, to?: string): Promise<SalesReport> {
  try {
    const response = await apiClient.get('/admin/reports', {
      params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
    });
    const data = response.data?.data as SalesReport;
    return {
      ...data,
      byDay: data?.byDay ?? [],
      bySeller: data?.bySeller ?? [],
      byCategory: data?.byCategory ?? [],
      topProducts: data?.topProducts ?? [],
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the sales report.'));
  }
}

/** One row of `GET /admin/orders` (OrderSummaryView). */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalPaise: number;
  itemCount: number;
  firstItemName: string | null;
  firstItemThumbnail: string | null;
  customerEmail: string | null;
  createdAt: string;
  returnStatus: string | null;
}

/** The newest orders, for the dashboard (SUPPORT or FINANCE). */
export async function getRecentOrders(limit = 8): Promise<OrderSummary[]> {
  try {
    const response = await apiClient.get('/admin/orders', { params: { page: 1, limit } });
    return (response.data?.data?.items as OrderSummary[]) ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load recent orders.'));
  }
}

/** `YYYY-MM-DD` in the reader's own calendar (the API reports in IST). */
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Every day from `from` to `to` inclusive, so a quiet day plots as zero rather than vanishing. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end && out.length < 400) {
    out.push(isoDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
