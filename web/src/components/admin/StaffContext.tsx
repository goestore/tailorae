'use client';

import React, { createContext, useCallback, useContext } from 'react';
import { permits, type StaffMember, type StaffPermission } from '@/lib/admin-staff';

/**
 * The signed-in staff member, shared by every console page.
 *
 * The console layout loads it once (`GET /admin/staff/me`) and renders nothing
 * until it has, so a page can read it synchronously. Pages use `useCan` to
 * leave out actions the API would refuse with a 403 — the API still checks
 * every call; this only keeps the screen honest about what will work.
 */

const StaffContext = createContext<StaffMember | null>(null);

export const StaffProvider: React.FC<{ staff: StaffMember; children: React.ReactNode }> = ({
  staff,
  children,
}) => <StaffContext.Provider value={staff}>{children}</StaffContext.Provider>;

export function useStaff(): StaffMember | null {
  return useContext(StaffContext);
}

/** `can('FINANCE')` — true when the member holds any of the given permissions (or SUPER_ADMIN). */
export function useCan(): (...anyOf: StaffPermission[]) => boolean {
  const staff = useContext(StaffContext);
  return useCallback(
    (...anyOf: StaffPermission[]) => permits(staff?.permissions, anyOf),
    [staff]
  );
}

/** Renders its children only for staff holding one of `anyOf`. */
export const Can: React.FC<{
  anyOf: StaffPermission[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ anyOf, children, fallback = null }) => {
  const can = useCan();
  return <>{can(...anyOf) ? children : fallback}</>;
};
