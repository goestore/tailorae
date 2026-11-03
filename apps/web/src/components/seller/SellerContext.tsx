'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getSellerMe,
  roleCan,
  setActiveSeller,
  syncActiveSeller,
  type SellerMe,
  type SellerPermission,
} from '@/lib/seller-api';

/**
 * The seller console's view of "who am I and which shop": `GET /seller/me`,
 * read once by the shell and shared by every page, so the banners, the
 * sidebar and the pages agree on the shop's status and the person's role.
 */
export interface SellerSession {
  me: SellerMe | null;
  /** True until the first answer (or failure). */
  loading: boolean;
  error: string | null;
  /** The shop the console is acting for. */
  activeSellerId: string | null;
  /** Re-read after anything that changes the shop, the checklist or the role. */
  refresh: () => Promise<SellerMe | null>;
  /** What the person's role allows in the active shop. */
  can: (permission: SellerPermission) => boolean;
  /** Switch to another of the person's shops. */
  switchShop: (sellerId: string) => Promise<void>;
}

const SellerContext = createContext<SellerSession | null>(null);

export function SellerProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [me, setMe] = useState<SellerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSellerId, setActiveSellerId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // A shop that cannot be opened (the person was removed from it, or the
    // request was refused) must not leave every page of the console failing:
    // forget the choice and fall back to the person's first shop.
    let switchError: string | null = null;
    try {
      // First as the person's default shop: that lists their shops, and only
      // then is it known whether the stored choice is still one of them.
      let next = await getSellerMe({ defaultShop: true });
      const before = next.shop?.id ?? null;
      const active = syncActiveSeller(next.memberships);
      if (active && before && active !== before) {
        try {
          next = await getSellerMe();
        } catch {
          setActiveSeller(null);
          syncActiveSeller(next.memberships);
          switchError = 'Could not open that shop, so you are back in your first one.';
        }
      }
      setMe(next);
      setActiveSellerId(next.shop?.id ?? null);
      setError(switchError);
      return next;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Started from a microtask so no state is set synchronously in the effect.
    void Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh]);

  const switchShop = useCallback(
    async (sellerId: string) => {
      setActiveSeller(sellerId);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<SellerSession>(
    () => ({
      me,
      loading: enabled && loading,
      error,
      activeSellerId,
      refresh,
      can: (permission) => roleCan(me?.role, permission),
      switchShop,
    }),
    [me, enabled, loading, error, activeSellerId, refresh, switchShop]
  );

  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>;
}

export function useSeller(): SellerSession {
  const value = useContext(SellerContext);
  if (!value) throw new Error('useSeller must be used inside the seller console.');
  return value;
}
