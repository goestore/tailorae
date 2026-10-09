'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Promotion codes.
 *
 * The console could create a coupon and toggle it, but never correct one — a
 * wrong value or a wrong end date meant living with it, or deactivating it and
 * creating a near-duplicate that then shows up twice in the list. Both the
 * update and the delete endpoints already existed and neither was called.
 *
 * Deleting is offered because a code typed wrongly and never used is clutter,
 * not history. A code that has been redeemed should be deactivated instead —
 * the screen says so rather than blocking it, since the orders keep their own
 * snapshot of the discount either way.
 */

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  requireB2B: boolean;
  createdAt: string;
}

export interface CouponInput {
  code?: string;
  description?: string | null;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue?: number;
  minOrderAmount?: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  requireB2B?: boolean;
}

export async function getCoupons(): Promise<AdminCoupon[]> {
  try {
    const response = await apiClient.get('/admin/coupons');
    return response.data?.data?.coupons ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load coupons.'));
  }
}

export async function createCoupon(input: CouponInput): Promise<AdminCoupon> {
  try {
    const response = await apiClient.post('/admin/coupons', input);
    return response.data?.data?.coupon;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create that coupon.'));
  }
}

export async function updateCoupon(id: string, input: CouponInput): Promise<AdminCoupon> {
  try {
    const response = await apiClient.put(`/admin/coupons/${encodeURIComponent(id)}`, input);
    return response.data?.data?.coupon;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not update that coupon.'));
  }
}

export async function deleteCoupon(id: string): Promise<string> {
  try {
    const response = await apiClient.delete(`/admin/coupons/${encodeURIComponent(id)}`);
    return response.data?.message ?? 'Coupon deleted.';
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not delete that coupon.'));
  }
}
