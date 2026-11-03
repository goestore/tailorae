import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { API_BASE_URL, realmOf, refreshSession } from './api-client';

describe('realmOf', () => {
  it('routes seller and staff paths to their own realms', () => {
    expect(realmOf('/seller/orders')).toBe('seller');
    expect(realmOf('/seller/auth/refresh')).toBe('seller');
    expect(realmOf('/admin/dashboard')).toBe('admin');
    expect(realmOf('admin/queues')).toBe('admin');
  });

  it('treats everything else as the customer realm', () => {
    expect(realmOf('/cart')).toBe('customer');
    expect(realmOf('/auth/me')).toBe('customer');
    // The storefront's seller directory is public catalogue, not the seller realm.
    expect(realmOf('/products/sellers/list')).toBe('customer');
    expect(realmOf('/sellers')).toBe('customer');
    expect(realmOf(undefined)).toBe('customer');
  });

  it('reads absolute URLs relative to the API base', () => {
    expect(realmOf(`${API_BASE_URL}/seller/me`)).toBe('seller');
    expect(realmOf(`${API_BASE_URL}/orders`)).toBe('customer');
  });
});

describe('refreshSession', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shares one refresh between concurrent callers of a realm', async () => {
    let resolve: (value: unknown) => void = () => {};
    const post = vi
      .spyOn(axios, 'post')
      .mockImplementation(() => new Promise((r) => (resolve = r)));

    const first = refreshSession('customer');
    const second = refreshSession('customer');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe(`${API_BASE_URL}/auth/refresh`);

    resolve({ status: 200 });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('refreshes each realm at its own endpoint and reports a refusal as false', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('401'));
    await expect(refreshSession('seller')).resolves.toBe(false);
    await expect(refreshSession('admin')).resolves.toBe(false);
    expect(post.mock.calls.map((call) => call[0])).toEqual([
      `${API_BASE_URL}/seller/auth/refresh`,
      `${API_BASE_URL}/admin/auth/refresh`,
    ]);
  });
});
