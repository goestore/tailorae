import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';
import { roleCan, setActiveSeller, syncActiveSeller, type Membership } from './seller-api';

const shop = (sellerId: string): Membership => ({ sellerId, shopName: sellerId, role: 'OWNER', status: 'APPROVED' });

/** The X-Seller-Id header the client would send for `url`. */
async function headerFor(url: string, sellerHeader?: boolean): Promise<string | undefined> {
  let seen: string | undefined;
  const adapter = vi.fn(async (config) => {
    seen = config.headers?.get?.('X-Seller-Id') ?? config.headers?.['X-Seller-Id'];
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
  });
  await apiClient.get(url, { adapter, sellerHeader });
  return seen;
}

describe('roleCan', () => {
  it('follows the permission matrix', () => {
    expect(roleCan('OWNER', 'PROFILE')).toBe(true);
    expect(roleCan('MANAGER', 'PROFILE')).toBe(false);
    expect(roleCan('MANAGER', 'MEMBERS')).toBe(true);
    expect(roleCan('CATALOG', 'ORDERS')).toBe(false);
    expect(roleCan('FULFILMENT', 'ORDERS')).toBe(true);
    expect(roleCan('FINANCE', 'FINANCE')).toBe(true);
    expect(roleCan('MANAGER', 'FINANCE')).toBe(false);
    expect(roleCan(null, 'CATALOG')).toBe(false);
  });
});

describe('the active shop header', () => {
  afterEach(() => {
    setActiveSeller(null);
    vi.unstubAllGlobals();
  });

  it('is only sent for a shop other than the first, and only to seller routes', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    const memberships = [shop('a'), shop('b')];

    expect(syncActiveSeller(memberships)).toBe('a');
    expect(await headerFor('/seller/orders')).toBeUndefined();

    setActiveSeller('b');
    expect(syncActiveSeller(memberships)).toBe('b');
    expect(await headerFor('/seller/orders')).toBe('b');
    expect(await headerFor('/seller/auth/me')).toBeUndefined();
    expect(await headerFor('/products')).toBeUndefined();
    // The first read on load asks as the default shop.
    expect(await headerFor('/seller/me', false)).toBeUndefined();

    // A choice that is no longer one of the person's shops is forgotten.
    setActiveSeller('gone');
    expect(syncActiveSeller(memberships)).toBe('a');
    expect(store.has('tl:seller:active')).toBe(false);
  });
});
