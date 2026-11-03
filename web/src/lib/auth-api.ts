import { apiClient, REALMS, type Realm } from '@/lib/api-client';
import type {
  AccountSummary,
  CustomerProfile,
  CustomerRegisterRequest,
  SellerRegisterRequest,
  SessionView,
} from '@/lib/api/types';
import type { User } from '@/types';

/**
 * Sign-in, sign-up and session calls for the three account realms.
 *
 * Every realm answers `login`, `register` (not staff), `me` and `refresh` with
 * the same account summary `{id, realm, email, name, emailVerified}`; the
 * session itself is the httpOnly cookie the response sets. A customer's
 * first and last name and phone live on the profile (`GET /users/profile`), so
 * the storefront session reads both.
 */

const path = (realm: Realm, endpoint: string) => `${REALMS[realm].authPath}/${endpoint}`;

/** "Asha Rao" → first "Asha", last "Rao", for realms that store one full name. */
function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined };
}

/** The redux session user, from the account summary and (customers) the profile. */
export function toSessionUser(account: AccountSummary, profile?: CustomerProfile | null): User {
  const realm = (account.realm as Realm) || 'customer';
  const fromName = splitName(account.name ?? '');
  return {
    id: account.id,
    realm,
    email: profile?.email ?? account.email,
    name: account.name ?? '',
    emailVerified: profile?.emailVerified ?? account.emailVerified ?? false,
    firstName: profile?.firstName ?? fromName.firstName,
    lastName: profile?.lastName ?? fromName.lastName,
    phone: profile?.phone ?? undefined,
    type: profile?.type ?? undefined,
    marketingOptIn: profile?.marketingOptIn ?? undefined,
    createdAt: profile?.createdAt ?? undefined,
  };
}

/** The customer's own profile: names, phone, marketing consent. */
export async function getProfile(): Promise<CustomerProfile | null> {
  const response = await apiClient.get('/users/profile', { silent: true });
  return (response.data?.data?.user as CustomerProfile) ?? null;
}

/** Builds the session user for an account the API just confirmed. */
async function sessionUser(account: AccountSummary): Promise<User> {
  if (account.realm !== 'customer') return toSessionUser(account);
  const profile = await getProfile().catch(() => null);
  return toSessionUser(account, profile);
}

/**
 * The signed-in account of a realm, or null for a visitor without one.
 * Silent: a 401 here is the answer "nobody", never a redirect.
 */
export async function fetchSession(realm: Realm): Promise<User | null> {
  try {
    const response = await apiClient.get(path(realm, 'me'), { silent: true });
    const account = response.data?.data as AccountSummary | undefined;
    return account?.id ? await sessionUser(account) : null;
  } catch {
    return null;
  }
}

export async function signIn(realm: Realm, email: string, password: string): Promise<User> {
  const response = await apiClient.post(path(realm, 'login'), { email, password });
  const account = response.data?.data as AccountSummary | undefined;
  if (!account?.id) throw new Error('Unexpected response from the server.');
  return sessionUser(account);
}

export async function registerCustomer(body: CustomerRegisterRequest): Promise<User> {
  const response = await apiClient.post(path('customer', 'register'), body);
  const account = response.data?.data as AccountSummary | undefined;
  if (!account?.id) throw new Error('Unexpected response from the server.');
  return sessionUser(account);
}

export async function registerSeller(body: SellerRegisterRequest): Promise<User> {
  const response = await apiClient.post(path('seller', 'register'), body);
  const account = response.data?.data as AccountSummary | undefined;
  if (!account?.id) throw new Error('Unexpected response from the server.');
  return sessionUser(account);
}

/** Ends the realm's session server-side and clears its cookies. Never throws. */
export async function signOut(realm: Realm): Promise<void> {
  await apiClient.post(path(realm, 'logout'), undefined, { silent: true }).catch(() => {});
}

export async function requestPasswordReset(realm: Realm, email: string): Promise<void> {
  await apiClient.post(path(realm, 'forgot-password'), { email });
}

export async function resetPassword(realm: Realm, token: string, password: string): Promise<void> {
  await apiClient.post(path(realm, 'reset-password'), { token, password });
}

export async function changePassword(
  realm: Realm,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await apiClient.post(path(realm, 'change-password'), { currentPassword, newPassword });
}

export async function resendVerification(realm: Realm): Promise<void> {
  await apiClient.post(path(realm, 'verify-email/resend'));
}

/** Signed-in devices of the current account, the current one flagged. */
export async function listSessions(realm: Realm): Promise<SessionView[]> {
  const response = await apiClient.get(path(realm, 'sessions'));
  return (response.data?.data as SessionView[]) ?? [];
}

export async function revokeSession(realm: Realm, id: string): Promise<void> {
  await apiClient.delete(path(realm, `sessions/${encodeURIComponent(id)}`));
}

/** Signs out every other device; resolves to how many were ended. */
export async function revokeOtherSessions(realm: Realm): Promise<number> {
  const response = await apiClient.post(path(realm, 'sessions/revoke-others'));
  return Number(response.data?.data?.signedOut ?? 0);
}

/** Password floor the API enforces (PasswordPolicy), checked before the request. */
export const PASSWORD_MIN_LENGTH = 10;
