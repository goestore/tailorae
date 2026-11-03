import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

/**
 * The browser's client for the TAILORAE API.
 *
 * Sessions live in httpOnly cookies the API sets on sign-in, one set per
 * account realm (docs/ACCOUNTS.md). Script never sees a token: requests go out
 * `withCredentials` and the browser attaches the right cookie. Access cookies
 * last fifteen minutes, so a 401 first asks that realm to refresh — once, and
 * shared by every request that failed at the same moment — and replays the
 * request. Only when the refresh itself is refused is the session over, and the
 * reader is sent to their realm's sign-in page.
 */

export type Realm = 'customer' | 'seller' | 'admin';

export interface RealmConfig {
  /** Prefix of the realm's auth endpoints, relative to the API base. */
  authPath: string;
  /** The web page a signed-out member of the realm is sent to. */
  signInPage: string;
}

export const REALMS: Record<Realm, RealmConfig> = {
  customer: { authPath: '/auth', signInPage: '/auth/login' },
  seller: { authPath: '/seller/auth', signInPage: '/seller/login' },
  admin: { authPath: '/admin/auth', signInPage: '/admin/login' },
};

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082/api').replace(
  /\/+$/,
  ''
);

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * A probe whose 401 is an answer, not a failure — the session check on page
     * load. It still tries a refresh (a returning shopper's access cookie has
     * usually expired), but a signed-out visitor is never redirected.
     */
    silent?: boolean;
    /** Set on the replay after a refresh so a second 401 is not retried again. */
    _retried?: boolean;
  }
}

/** Which realm an API path belongs to: `/seller/...` → seller, `/admin/...` → staff. */
export function realmOf(url: string | undefined): Realm {
  let path = url ?? '';
  // Absolute URLs (rare, but axios allows them) are reduced to the part after the API base.
  if (/^https?:\/\//i.test(path)) {
    path = path.startsWith(API_BASE_URL) ? path.slice(API_BASE_URL.length) : new URL(path).pathname;
  }
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/seller' || path.startsWith('/seller/')) return 'seller';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  return 'customer';
}

/**
 * Auth endpoints answer 401 for reasons a refresh cannot fix (a wrong
 * password), and refreshing on the refresh call itself would loop.
 */
const NO_REFRESH = /\/auth\/(login|register|refresh|logout|forgot-password|reset-password|verify-email)(\/|$|\?)/;

const refreshing: Partial<Record<Realm, Promise<boolean>>> = {};

/** One refresh per realm at a time; every 401 that arrives meanwhile waits on it. */
export function refreshSession(realm: Realm, baseURL = API_BASE_URL): Promise<boolean> {
  const pending = refreshing[realm];
  if (pending) return pending;
  const attempt = axios
    .post(`${baseURL}${REALMS[realm].authPath}/refresh`, undefined, {
      withCredentials: true,
      timeout: 10000,
    })
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      delete refreshing[realm];
    });
  refreshing[realm] = attempt;
  return attempt;
}

function sendToSignIn(realm: Realm): void {
  if (typeof window === 'undefined') return;
  const { signInPage } = REALMS[realm];
  const here = window.location.pathname;
  // Already on a sign-in, sign-up or password page: nothing to send them to.
  if (here === signInPage || /\/(login|register|forgot-password|reset-password)$/.test(here)) return;
  /**
   * A full page load, not a router push, and deliberately so. This is module
   * scope — there is no router here — and an expired session should discard
   * every piece of client state that was read under it: the redux store, the
   * cart, any half-filled form. A soft navigation would carry all of it into
   * the sign-in page.
   */
  const redirect = encodeURIComponent(`${here}${window.location.search}`);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `${signInPage}?redirect=${redirect}`;
}

export const createApiClient = (baseURL: string = API_BASE_URL): AxiosInstance => {
  const client = axios.create({
    baseURL,
    timeout: 10000,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    // A file upload must not go out as JSON. With the default JSON header,
    // axios serialises FormData to a JSON string and the file is dropped.
    // Removing the header lets the browser write multipart/form-data with its
    // own boundary.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      config.headers.delete('Content-Type');
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config;
      if (
        error.response?.status !== 401 ||
        !config ||
        config._retried ||
        typeof window === 'undefined' ||
        NO_REFRESH.test(config.url ?? '')
      ) {
        return Promise.reject(error);
      }

      const realm = realmOf(config.url);
      if (await refreshSession(realm, baseURL)) {
        config._retried = true;
        return client.request(config);
      }
      if (!config.silent) sendToSignIn(realm);
      return Promise.reject(error);
    }
  );

  return client;
};

export const apiClient = createApiClient();
