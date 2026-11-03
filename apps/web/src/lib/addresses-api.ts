import { apiClient } from '@/lib/api-client';
import type { Address, AddressInput, AddressLabel } from '@/types';

/**
 * The shopper's address book: `/users/addresses` → `{addresses}` / `{address}`.
 * Fields are `label (HOME|OFFICE|OTHER), fullName, phone, email, line1, line2,
 * city, state, postalCode, country, gstin, isDefault`. The API sorts the
 * default first, then newest.
 */

export const ADDRESS_LABELS: Array<{ value: AddressLabel; text: string }> = [
  { value: 'HOME', text: 'Home' },
  { value: 'OFFICE', text: 'Office' },
  { value: 'OTHER', text: 'Other' },
];

/** "HOME" → "Home", for display. */
export const labelText = (label: string | null | undefined): string =>
  ADDRESS_LABELS.find((l) => l.value === (label ?? '').toUpperCase())?.text ?? 'Other';

/** Addresses are stored with an ISO country code; the forms speak names. */
const COUNTRY_NAMES: Record<string, string> = { IN: 'India' };

export const countryName = (code: string | null | undefined): string =>
  COUNTRY_NAMES[(code ?? '').toUpperCase()] ?? code ?? '';

export const countryCode = (name: string): string => {
  const trimmed = name.trim();
  const match = Object.entries(COUNTRY_NAMES).find(
    ([, value]) => value.toLowerCase() === trimmed.toLowerCase()
  );
  return match ? match[0] : trimmed.toUpperCase() || 'IN';
};

/** The API's own rules (AddressRequest), checked before the request. */
export const PHONE_PATTERN = /^\+?[0-9 ]{10,16}$/;
export const PIN_PATTERN = /^[1-9][0-9]{5}$/;

export async function listAddresses(): Promise<Address[]> {
  const response = await apiClient.get('/users/addresses');
  return (response.data?.data?.addresses as Address[]) ?? [];
}

export async function createAddress(input: AddressInput): Promise<Address> {
  const response = await apiClient.post('/users/addresses', input);
  return response.data?.data?.address as Address;
}

/** A full replacement: send every field, not just the changed ones. */
export async function updateAddress(id: string, input: AddressInput): Promise<Address> {
  const response = await apiClient.put(`/users/addresses/${encodeURIComponent(id)}`, input);
  return response.data?.data?.address as Address;
}

export async function deleteAddress(id: string): Promise<void> {
  await apiClient.delete(`/users/addresses/${encodeURIComponent(id)}`);
}

/** An address as the API stores it, ready to send back (e.g. to make it the default). */
export const toAddressInput = (address: Address): AddressInput => ({
  label: address.label,
  fullName: address.fullName,
  phone: address.phone,
  email: address.email ?? null,
  line1: address.line1,
  line2: address.line2 ?? null,
  city: address.city,
  state: address.state,
  postalCode: address.postalCode,
  country: address.country,
  gstin: address.gstin ?? null,
  isDefault: address.isDefault,
});
