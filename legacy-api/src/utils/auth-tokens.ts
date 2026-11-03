import crypto from 'crypto';

/**
 * The arithmetic behind password reset, email verification and account
 * lockout — every part of those flows that can be decided without a database.
 *
 * It lives apart from the route for one reason: these are the rules that are
 * expensive to get wrong and cheap to test. A reset token that outlives its
 * window, a lock that never lifts, or a counter that never resets are all
 * silent failures — nothing throws, the endpoint keeps answering, and the
 * damage only shows up as an account someone else can take or a customer who
 * can never sign in again. Pinned here, they are checked on every run.
 */

// ============================================
// TOKENS
// ============================================

/**
 * 32 bytes, hex-encoded, from the OS entropy pool.
 *
 * 256 bits is far past what a reset link needs, but the cost of the extra
 * bytes is a longer URL and nothing else, whereas the cost of being too short
 * is that a link becomes guessable. `randomBytes` is used rather than
 * `Math.random`, which is seeded pseudo-randomness and predictable from a
 * handful of prior outputs.
 */
export const TOKEN_BYTES = 32;

/** How long a password reset link is good for. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Email verification gets a much longer window than a reset.
 *
 * The two look alike but carry different risk: a leaked reset link is an
 * account takeover, while a leaked verification link only confirms an address
 * the holder already controls. So the reset window is kept tight enough to
 * hurt, and verification is given long enough that someone who signs up on a
 * phone and opens their mail the next day is not sent back to square one.
 */
export const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface IssuedToken {
  /** Goes in the emailed link. Never stored. */
  token: string;
  /** Goes in the database. Never emailed. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Reduce a token to what is safe to keep.
 *
 * SHA-256 and not bcrypt, which is the usual instinct here and is wrong for
 * this case on both counts. Bcrypt's slowness buys resistance to dictionary
 * attack, and there is no dictionary to defend against — the input is 256 bits
 * of uniform randomness, so an attacker's only route is brute force over a
 * space no work factor makes meaningfully harder. And bcrypt salts per record,
 * which destroys the ability to look a token up: verifying would mean reading
 * every outstanding row and comparing each one. A plain digest keeps the
 * unique-index lookup, so verification is one indexed read.
 *
 * The point of hashing at all is unchanged: a leaked database backup must not
 * hand over working reset links.
 */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

/** Mint a token and everything needed to store and expire it. */
export const issueToken = (ttlMs: number, now: Date = new Date()): IssuedToken => {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + ttlMs),
  };
};

/**
 * Reject anything that cannot be a token we issued before touching the
 * database. A hex string of a known length is cheap to check and stops
 * malformed input becoming a query.
 */
export const isWellFormedToken = (value: unknown): value is string =>
  typeof value === 'string' && new RegExp(`^[0-9a-f]{${TOKEN_BYTES * 2}}$`).test(value.trim());

export interface StoredToken {
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * A token is good exactly once, and only inside its window.
 *
 * The boundary is deliberately exclusive: a token whose `expiresAt` is exactly
 * now has expired. Anything else means the last millisecond of the window
 * behaves differently from every other, which is the kind of edge nobody tests
 * by hand.
 */
export const isTokenUsable = (record: StoredToken, now: Date = new Date()): boolean =>
  record.usedAt === null && record.expiresAt.getTime() > now.getTime();

/** Why a token was refused, for logging — never for the response body. */
export const tokenRefusalReason = (
  record: StoredToken | null,
  now: Date = new Date()
): 'unknown' | 'used' | 'expired' | null => {
  if (!record) return 'unknown';
  if (record.usedAt !== null) return 'used';
  if (record.expiresAt.getTime() <= now.getTime()) return 'expired';
  return null;
};

// ============================================
// ACCOUNT LOCKOUT
// ============================================

/**
 * Five wrong passwords, then fifteen minutes off.
 *
 * The numbers are a compromise. Low enough that guessing a common password
 * against one account is not worth attempting; high enough that a person who
 * genuinely cannot remember which of their three passwords it was does not get
 * shut out. The IP rate limiter already handles the case of one attacker
 * spraying many accounts; this handles the case of many attempts against one.
 */
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LockState {
  loginAttempts: number;
  lockUntil: Date | null;
}

/** Is this account currently shut? */
export const isLocked = (lockUntil: Date | null, now: Date = new Date()): boolean =>
  lockUntil !== null && lockUntil.getTime() > now.getTime();

/** Milliseconds left on a lock; zero when it is not locked. */
export const lockRemainingMs = (lockUntil: Date | null, now: Date = new Date()): number =>
  isLocked(lockUntil, now) ? lockUntil!.getTime() - now.getTime() : 0;

/**
 * How long is left, as it is said to a person.
 *
 * Rounded up, because "try again in 0 minutes" is not an instruction, and a
 * customer told to wait a minute who finds it was really ninety seconds is
 * more annoyed than one told two.
 */
export const formatLockRemaining = (ms: number): string => {
  if (ms <= 0) return 'a moment';
  const minutes = Math.ceil(ms / 60000);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
};

/**
 * The counter after one more wrong password.
 *
 * The case worth being careful about is the failure that arrives *after* a
 * lock has run out. The counter is still sitting at the maximum, so counting
 * naively would re-lock the account on a single mistake and go on doing so
 * forever — a customer who has genuinely forgotten their password would be
 * locked out permanently by their own attempts to remember it. A served lock
 * clears the slate, so the count starts again from one.
 *
 * The count is also held at the maximum rather than climbing, so that a
 * script hammering a locked account cannot push the number somewhere the
 * reset logic has never been tested against.
 */
export const registerFailedAttempt = (state: LockState, now: Date = new Date()): LockState => {
  const lockHasBeenServed = state.lockUntil !== null && state.lockUntil.getTime() <= now.getTime();
  const attempts = lockHasBeenServed ? 1 : state.loginAttempts + 1;

  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return {
      loginAttempts: MAX_LOGIN_ATTEMPTS,
      lockUntil: new Date(now.getTime() + LOCK_DURATION_MS),
    };
  }

  return { loginAttempts: attempts, lockUntil: null };
};

/**
 * The counter after a correct password.
 *
 * Always a full clear. Anything that survives a successful sign-in is a booby
 * trap for the next honest mistake.
 */
export const clearFailedAttempts = (): LockState => ({ loginAttempts: 0, lockUntil: null });

/** How many tries are left before the door shuts, for the response message. */
export const attemptsRemaining = (state: LockState): number =>
  Math.max(0, MAX_LOGIN_ATTEMPTS - state.loginAttempts);

// ============================================
// SIGNING SECRET
// ============================================

/**
 * Values that mean somebody left the placeholder in. Compared lowercased.
 * `secret` heads the list because it was this codebase's own fallback.
 */
const KNOWN_WEAK_SECRETS = [
  'secret',
  'changeme',
  'change_me',
  'password',
  'jwt_secret',
  'your-secret-key',
  'your-super-secret-jwt-key-change-in-production',
];

/** Below this, a secret is short enough to be worth attacking offline. */
export const MIN_JWT_SECRET_LENGTH = 32;

export type SecretVerdict =
  | { ok: true; warning?: string }
  | { ok: false; reason: string };

/**
 * Judge a signing secret.
 *
 * Missing is fatal everywhere, because the alternative was signing with a
 * fallback string that is in every copy of this repository — anyone could mint
 * an admin token. That failure is invisible: the server starts, tokens verify,
 * and nothing looks wrong until someone signs one themselves.
 *
 * Weak-but-present is fatal in production and a warning elsewhere. A developer
 * running against a throwaway database should not be stopped from starting the
 * server by a short secret, but a deployment should never get that far.
 */
export const checkJwtSecret = (value: string | undefined, nodeEnv: string | undefined): SecretVerdict => {
  const secret = value?.trim() ?? '';

  if (secret.length === 0) {
    return {
      ok: false,
      reason: 'JWT_SECRET is not set. Every session token would be signed with a value published in this repository.',
    };
  }

  const isProduction = nodeEnv === 'production';
  const problem = KNOWN_WEAK_SECRETS.includes(secret.toLowerCase())
    ? 'JWT_SECRET is a placeholder value from the documentation.'
    : secret.length < MIN_JWT_SECRET_LENGTH
      ? `JWT_SECRET is only ${secret.length} characters; use at least ${MIN_JWT_SECRET_LENGTH}.`
      : null;

  if (!problem) return { ok: true };
  return isProduction ? { ok: false, reason: problem } : { ok: true, warning: problem };
};
