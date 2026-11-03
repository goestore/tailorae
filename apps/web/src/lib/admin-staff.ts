'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import type { Page } from '@/lib/api/types';

/**
 * Platform staff: who is signed in to the console, what they may do, and (for
 * a SUPER_ADMIN) the staff list itself.
 *
 * Permissions are granted one by one (docs/ACCOUNTS.md, "Platform staff"). The
 * API checks them on every call and answers 403 for a missing one; the console
 * reads the same list from `GET /admin/staff/me` only to leave out the menu
 * items and buttons that would be refused. SUPER_ADMIN implies every other.
 */

export const STAFF_PERMISSIONS = [
  'SUPER_ADMIN',
  'MODERATOR',
  'KYC_REVIEW',
  'FINANCE',
  'SUPPORT',
  'CONTENT',
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<StaffPermission, { label: string; detail: string }> = {
  SUPER_ADMIN: { label: 'Super admin', detail: 'Everything, including staff and the audit log' },
  MODERATOR: { label: 'Moderator', detail: 'Listings, brands, categories, reviews' },
  KYC_REVIEW: { label: 'KYC review', detail: 'Seller applications, KYC documents, bank details' },
  FINANCE: { label: 'Finance', detail: 'Commission, payouts, refunds, statements' },
  SUPPORT: { label: 'Support', detail: 'Customers, orders, cancellations, returns' },
  CONTENT: { label: 'Content', detail: 'Homepage, banners, media, custom wear' },
};

export interface StaffMember {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED' | string;
  permissions: StaffPermission[];
  createdAt: string;
}

/**
 * Whether a set of permissions covers a route that accepts any of `anyOf`.
 * An empty `anyOf` means "any signed-in staff member".
 */
export function permits(
  held: readonly StaffPermission[] | null | undefined,
  anyOf: readonly StaffPermission[] = []
): boolean {
  if (!held) return false;
  if (held.includes('SUPER_ADMIN')) return true;
  if (anyOf.length === 0) return true;
  return anyOf.some((permission) => held.includes(permission));
}

/** The signed-in staff member, or null when the staff session is missing or over. */
export async function getStaffMe(): Promise<StaffMember | null> {
  try {
    const response = await apiClient.get('/admin/staff/me', { silent: true });
    return (response.data?.data as StaffMember) ?? null;
  } catch {
    return null;
  }
}

export async function listStaff(page = 1, limit = 100): Promise<Page<StaffMember>> {
  try {
    const response = await apiClient.get('/admin/staff', { params: { page, limit } });
    return response.data?.data as Page<StaffMember>;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load staff.'));
  }
}

export interface NewStaffInput {
  email: string;
  fullName: string;
  password: string;
  permissions: StaffPermission[];
}

export async function createStaff(input: NewStaffInput): Promise<StaffMember> {
  try {
    const response = await apiClient.post('/admin/staff', input);
    return response.data?.data as StaffMember;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not create that staff account.'));
  }
}

export async function setStaffPermissions(
  id: string,
  permissions: StaffPermission[]
): Promise<StaffMember> {
  try {
    const response = await apiClient.put(
      `/admin/staff/${encodeURIComponent(id)}/permissions`,
      permissions
    );
    return response.data?.data as StaffMember;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save those permissions.'));
  }
}

export async function setStaffStatus(
  id: string,
  status: 'ACTIVE' | 'SUSPENDED'
): Promise<StaffMember> {
  try {
    const response = await apiClient.patch(`/admin/staff/${encodeURIComponent(id)}/status`, {
      status,
    });
    return response.data?.data as StaffMember;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not change that account.'));
  }
}

/* ----- Audit log --------------------------------------------------------- */

export interface AuditEntry {
  id: string;
  actorRealm: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  /** JSON text as stored, or null. */
  before: string | null;
  after: string | null;
  createdAt: string;
}

export async function getAuditLog(params: {
  entity?: string;
  entityId?: string;
  page?: number;
  limit?: number;
}): Promise<Page<AuditEntry>> {
  try {
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
    );
    const response = await apiClient.get('/admin/audit', { params: clean });
    return response.data?.data as Page<AuditEntry>;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the audit log.'));
  }
}
