'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Platform switches the owner controls, stored server-side in SystemSetting
 * (backend utils/settings.ts). Keys are dotted so new ones can be added
 * without a schema change.
 */
export interface PlatformSettings {
  /** When false, /sell and the apply form say "by invitation" and the API refuses applications. */
  'seller.applicationsOpen': boolean;
  /** Commission % when neither the seller nor the category sets one. */
  'commission.defaultRate': number;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const response = await apiClient.get('/admin/settings');
    return response.data?.data?.settings;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load settings.'));
  }
}

export async function updatePlatformSettings(
  input: Partial<PlatformSettings>
): Promise<PlatformSettings> {
  try {
    const response = await apiClient.patch('/admin/settings', input);
    return response.data?.data?.settings;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save settings.'));
  }
}
