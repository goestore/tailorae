'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { formatPaise } from '@/lib/money';

/**
 * Promotion codes (`/admin/coupons`, FINANCE or CONTENT).
 *
 * Amounts are integer paise. A PERCENTAGE coupon's value is in basis points
 * (1000 = 10%); a FIXED_AMOUNT coupon's value is paise. The API saves a coupon
 * whole — every write sends the full request, so a toggle sends the coupon back
 * with one field changed.
 *
 * Deleting a code that has been redeemed deactivates it instead (the server
 * decides and says so), since orders keep their own snapshot of the discount.
 */

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  /** Basis points for PERCENTAGE, paise for FIXED_AMOUNT. */
  discountValue: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  applicableCategoryIds: string[];
  applicableProductIds: string[];
  requireBusiness: boolean;
  createdAt: string;
}

/** The API's `CouponRequest`. */
export interface CouponInput {
  code: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: number;
  minOrderPaise: number;
  maxDiscountPaise?: number | null;
  usageLimit?: number | null;
  perCustomerLimit: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  applicableCategoryIds: string[];
  applicableProductIds: string[];
  requireBusiness: boolean;
}

/** "10%" / "12.5%" for percentages (basis points), "₹200" for fixed amounts (paise). */
export function formatCouponValue(coupon: Pick<AdminCoupon, 'discountType' | 'discountValue'>): string {
  if (coupon.discountType === 'PERCENTAGE') {
    const percent = (Number(coupon.discountValue) || 0) / 100;
    return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, '')}%`;
  }
  return formatPaise(coupon.discountValue);
}

/** A saved coupon as the request that would save it again unchanged. */
export function couponToRequest(coupon: AdminCoupon): CouponInput {
  return {
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minOrderPaise: coupon.minOrderPaise ?? 0,
    maxDiscountPaise: coupon.maxDiscountPaise ?? null,
    usageLimit: coupon.usageLimit ?? null,
    perCustomerLimit: coupon.perCustomerLimit ?? 0,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    isActive: coupon.isActive,
    applicableCategoryIds: coupon.applicableCategoryIds ?? [],
    applicableProductIds: coupon.applicableProductIds ?? [],
    requireBusiness: coupon.requireBusiness ?? false,
  };
}

export async function getCoupons(q?: string): Promise<AdminCoupon[]> {
  try {
    const response = await apiClient.get('/admin/coupons', {
      params: { limit: 100, ...(q ? { q } : {}) },
    });
    return response.data?.data?.items ?? [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load coupons.'));
  }
}

export async function createCoupon(input: CouponInput): Promise<AdminCoupon> {
  try {
    const response = await apiClient.post('/admin/coupons', input);
    return response.data?.data as AdminCoupon;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create that coupon.'));
  }
}

export async function updateCoupon(id: string, input: CouponInput): Promise<AdminCoupon> {
  try {
    const response = await apiClient.put(`/admin/coupons/${encodeURIComponent(id)}`, input);
    return response.data?.data as AdminCoupon;
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
