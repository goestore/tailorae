'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Marketplace switches (`GET/PATCH /admin/settings`, FINANCE or KYC_REVIEW).
 *
 * The API accepts known keys only and checks each against the permission that
 * owns it: the applications switch is KYC_REVIEW's, the money settings are
 * FINANCE's. Rates are basis points, money is paise, the hold is whole days.
 */
export interface PlatformSettings {
  /** When false, the public seller sign-up says "by invitation" and the API refuses it. */
  'seller.applications_open': boolean;
  /** Commission when neither the seller nor a category sets one (1000 = 10%). */
  'commission.default_rate_bp': number;
  /** Days after delivery before a sale is credited to the seller's ledger. */
  'settlement.hold_days': number;
  /** Shipping charged below the free-shipping threshold. */
  'shipping.flat_paise': number;
  /** Orders at or above this (after discount) ship free. */
  'shipping.free_above_paise': number;
}

/** Which permission may change each setting (SUPER_ADMIN may change all). */
export const SETTING_PERMISSION: Record<keyof PlatformSettings, 'KYC_REVIEW' | 'FINANCE'> = {
  'seller.applications_open': 'KYC_REVIEW',
  'commission.default_rate_bp': 'FINANCE',
  'settlement.hold_days': 'FINANCE',
  'shipping.flat_paise': 'FINANCE',
  'shipping.free_above_paise': 'FINANCE',
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const response = await apiClient.get('/admin/settings');
    return response.data?.data as PlatformSettings;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load settings.'));
  }
}

export async function updatePlatformSettings(
  input: Partial<PlatformSettings>
): Promise<PlatformSettings> {
  try {
    const response = await apiClient.patch('/admin/settings', input);
    return response.data?.data as PlatformSettings;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save settings.'));
  }
}
