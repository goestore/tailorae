import {
  EMAIL_VERIFICATION_TTL_MS,
  LOCK_DURATION_MS,
  MAX_LOGIN_ATTEMPTS,
  MIN_JWT_SECRET_LENGTH,
  PASSWORD_RESET_TTL_MS,
  TOKEN_BYTES,
  attemptsRemaining,
  checkJwtSecret,
  clearFailedAttempts,
  formatLockRemaining,
  hashToken,
  isLocked,
  isTokenUsable,
  isWellFormedToken,
  issueToken,
  lockRemainingMs,
  registerFailedAttempt,
  tokenRefusalReason,
} from '@/utils/auth-tokens';

/**
 * The rules that decide whether a stranger can take an account over.
 *
 * Every failure mode pinned here is one that leaves the server answering
 * normally while being wrong: a link that outlives its window, a link that
 * works twice, a lock that never lifts, a lock that never engages, a signing
 * secret that is the one printed in the README. None of them throws, none
 * shows up in a smoke test, and each is somebody's account.
 *
 * Time is passed in rather than read from the clock, so the boundaries are
 * exact instead of nearly.
 */

const NOW = new Date('2026-09-05T12:00:00.000Z');
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

describe('hashToken', () => {
  it('produces a 64-character hex SHA-256 digest', () => {
    const digest = hashToken('abc');
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is the published SHA-256 of a known input', () => {
    // Guards against the algorithm being swapped for something weaker during a
    // refactor; the digest of "abc" is a fixed, checkable value.
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('is deterministic, which is what makes the lookup by hash work', () => {
    expect(hashToken('the-same-token')).toBe(hashToken('the-same-token'));
  });

  it('separates tokens that differ by a single character', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('does not contain the token it was given', () => {
    // The reason the column exists at all: a database dump must not be a list
    // of working links.
    const token = 'deadbeefdeadbeefdeadbeefdeadbeef';
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('issueToken', () => {
  it('mints a hex token of the full configured length', () => {
    const issued = issueToken(PASSWORD_RESET_TTL_MS, NOW);
    expect(issued.token).toHaveLength(TOKEN_BYTES * 2);
    expect(issued.token).toMatch(/^[0-9a-f]+$/);
  });

  it('stores the hash of the token it hands out, never the token', () => {
    const issued = issueToken(PASSWORD_RESET_TTL_MS, NOW);
    expect(issued.tokenHash).toBe(hashToken(issued.token));
    expect(issued.tokenHash).not.toBe(issued.token);
  });

  it('expires exactly one TTL after the moment it was issued', () => {
    const issued = issueToken(PASSWORD_RESET_TTL_MS, NOW);
    expect(issued.expiresAt.getTime()).toBe(NOW.getTime() + PASSWORD_RESET_TTL_MS);
  });

  it('never repeats itself across many mintings', () => {
    // A collision would mean one person's link opening another's account.
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      seen.add(issueToken(PASSWORD_RESET_TTL_MS, NOW).token);
    }
    expect(seen.size).toBe(500);
  });

  it('gives a reset a far shorter life than a verification', () => {
    // A leaked reset link is an account takeover; a leaked verification link
    // confirms an address its holder already owns. The windows should not be
    // the same, and the reset should be the tight one.
    expect(PASSWORD_RESET_TTL_MS).toBeLessThan(EMAIL_VERIFICATION_TTL_MS);
    expect(PASSWORD_RESET_TTL_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});

describe('isWellFormedToken', () => {
  const valid = issueToken(PASSWORD_RESET_TTL_MS, NOW).token;

  it('accepts a token this module issued', () => {
    expect(isWellFormedToken(valid)).toBe(true);
  });

  it('accepts one with surrounding whitespace, as a mail client may wrap it', () => {
    expect(isWellFormedToken(`  ${valid}\n`)).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isWellFormedToken(valid.slice(0, -1))).toBe(false);
    expect(isWellFormedToken(`${valid}a`)).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isWellFormedToken(`${valid.slice(0, -1)}z`)).toBe(false);
  });

  it('rejects uppercase, which this module never produces', () => {
    expect(isWellFormedToken(valid.toUpperCase())).toBe(false);
  });

  it('rejects anything that is not a string', () => {
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken(null)).toBe(false);
    expect(isWellFormedToken(12345)).toBe(false);
    expect(isWellFormedToken({})).toBe(false);
    // Prisma would happily turn this into a query if it reached the database.
    expect(isWellFormedToken({ not: 'a string' })).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isWellFormedToken('')).toBe(false);
  });
});

describe('isTokenUsable', () => {
  const unused = { expiresAt: at(PASSWORD_RESET_TTL_MS), usedAt: null };

  it('accepts an unused token inside its window', () => {
    expect(isTokenUsable(unused, NOW)).toBe(true);
  });

  it('accepts one with a millisecond left', () => {
    expect(isTokenUsable(unused, at(PASSWORD_RESET_TTL_MS - 1))).toBe(true);
  });

  it('refuses one at the exact instant it expires', () => {
    // The boundary is exclusive by design: an inclusive one makes the last
    // millisecond of every window behave unlike all the others.
    expect(isTokenUsable(unused, at(PASSWORD_RESET_TTL_MS))).toBe(false);
  });

  it('refuses one past its window', () => {
    expect(isTokenUsable(unused, at(PASSWORD_RESET_TTL_MS + 1))).toBe(false);
  });

  it('refuses a token that has already been redeemed', () => {
    // The headline case for single use. A reset link sitting in a mailbox is
    // otherwise a permanent key to the account.
    expect(isTokenUsable({ expiresAt: at(PASSWORD_RESET_TTL_MS), usedAt: NOW }, NOW)).toBe(false);
  });

  it('refuses a redeemed token even while it is still in date', () => {
    expect(
      isTokenUsable({ expiresAt: at(PASSWORD_RESET_TTL_MS), usedAt: at(-1000) }, NOW)
    ).toBe(false);
  });
});

describe('tokenRefusalReason', () => {
  it('says nothing is wrong with a usable token', () => {
    expect(tokenRefusalReason({ expiresAt: at(1000), usedAt: null }, NOW)).toBeNull();
  });

  it('distinguishes unknown, used and expired for the log', () => {
    expect(tokenRefusalReason(null, NOW)).toBe('unknown');
    expect(tokenRefusalReason({ expiresAt: at(1000), usedAt: NOW }, NOW)).toBe('used');
    expect(tokenRefusalReason({ expiresAt: at(-1000), usedAt: null }, NOW)).toBe('expired');
  });

  it('reports a used token as used even when it is also expired', () => {
    expect(tokenRefusalReason({ expiresAt: at(-1000), usedAt: at(-2000) }, NOW)).toBe('used');
  });
});

describe('isLocked', () => {
  it('is not locked when there is no lock', () => {
    expect(isLocked(null, NOW)).toBe(false);
  });

  it('is locked while the lock is in the future', () => {
    expect(isLocked(at(60_000), NOW)).toBe(true);
  });

  it('is not locked at the instant the lock runs out', () => {
    expect(isLocked(NOW, NOW)).toBe(false);
  });

  it('is not locked once the lock is in the past', () => {
    expect(isLocked(at(-1), NOW)).toBe(false);
  });
});

describe('lockRemainingMs and formatLockRemaining', () => {
  it('reports the time left on a live lock', () => {
    expect(lockRemainingMs(at(90_000), NOW)).toBe(90_000);
  });

  it('reports nothing left when there is no lock or it has passed', () => {
    expect(lockRemainingMs(null, NOW)).toBe(0);
    expect(lockRemainingMs(at(-5000), NOW)).toBe(0);
  });

  it('rounds up, so nobody is told to wait zero minutes', () => {
    expect(formatLockRemaining(1)).toBe('1 minute');
    expect(formatLockRemaining(60_000)).toBe('1 minute');
    expect(formatLockRemaining(60_001)).toBe('2 minutes');
    expect(formatLockRemaining(LOCK_DURATION_MS)).toBe('15 minutes');
  });

  it('singularises one minute', () => {
    expect(formatLockRemaining(30_000)).toBe('1 minute');
    expect(formatLockRemaining(120_000)).toBe('2 minutes');
  });

  it('has wording for an elapsed lock rather than a negative number', () => {
    expect(formatLockRemaining(0)).toBe('a moment');
    expect(formatLockRemaining(-1)).toBe('a moment');
  });
});

describe('registerFailedAttempt', () => {
  const fresh = { loginAttempts: 0, lockUntil: null };

  it('counts the first wrong password without locking', () => {
    const next = registerFailedAttempt(fresh, NOW);
    expect(next.loginAttempts).toBe(1);
    expect(next.lockUntil).toBeNull();
  });

  it('does not lock on the attempt before the limit', () => {
    const next = registerFailedAttempt({ loginAttempts: MAX_LOGIN_ATTEMPTS - 2, lockUntil: null }, NOW);
    expect(next.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS - 1);
    expect(next.lockUntil).toBeNull();
  });

  it('locks exactly on the fifth wrong password', () => {
    const next = registerFailedAttempt({ loginAttempts: MAX_LOGIN_ATTEMPTS - 1, lockUntil: null }, NOW);
    expect(next.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS);
    expect(next.lockUntil).toEqual(at(LOCK_DURATION_MS));
  });

  it('reaches the lock in exactly five steps from a clean account', () => {
    let state = { loginAttempts: 0, lockUntil: null as Date | null };
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) {
      state = registerFailedAttempt(state, NOW);
      expect(isLocked(state.lockUntil, NOW)).toBe(false);
    }
    state = registerFailedAttempt(state, NOW);
    expect(isLocked(state.lockUntil, NOW)).toBe(true);
  });

  it('restarts the count after a lock has been served', () => {
    /*
     * The case that matters most. The counter is still at the maximum when a
     * lock expires, so counting naively would re-lock the account on one more
     * mistake and go on doing so for ever — a customer who has genuinely
     * forgotten their password would be locked out permanently by trying to
     * remember it.
     */
    const served = { loginAttempts: MAX_LOGIN_ATTEMPTS, lockUntil: at(-1) };
    const next = registerFailedAttempt(served, NOW);
    expect(next.loginAttempts).toBe(1);
    expect(next.lockUntil).toBeNull();
  });

  it('gives a served lock the full five tries again, not one', () => {
    let state: { loginAttempts: number; lockUntil: Date | null } = {
      loginAttempts: MAX_LOGIN_ATTEMPTS,
      lockUntil: at(-1),
    };
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) {
      state = registerFailedAttempt(state, NOW);
      expect(isLocked(state.lockUntil, NOW)).toBe(false);
    }
    state = registerFailedAttempt(state, NOW);
    expect(isLocked(state.lockUntil, NOW)).toBe(true);
  });

  it('extends a live lock rather than letting attempts run past the limit', () => {
    const locked = { loginAttempts: MAX_LOGIN_ATTEMPTS, lockUntil: at(60_000) };
    const next = registerFailedAttempt(locked, at(1000));
    expect(next.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS);
    expect(next.lockUntil).toEqual(new Date(NOW.getTime() + 1000 + LOCK_DURATION_MS));
  });

  it('never lets the counter climb above the limit', () => {
    // A script hammering a locked account must not push the number somewhere
    // the reset arithmetic has never seen.
    let state: { loginAttempts: number; lockUntil: Date | null } = {
      loginAttempts: MAX_LOGIN_ATTEMPTS,
      lockUntil: at(60_000),
    };
    for (let i = 0; i < 50; i++) {
      state = registerFailedAttempt(state, NOW);
    }
    expect(state.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS);
  });
});

describe('clearFailedAttempts', () => {
  it('wipes both the counter and the lock', () => {
    // Anything surviving a correct password is a trap for the next honest slip.
    expect(clearFailedAttempts()).toEqual({ loginAttempts: 0, lockUntil: null });
  });
});

describe('attemptsRemaining', () => {
  it('counts down from the limit', () => {
    expect(attemptsRemaining({ loginAttempts: 0, lockUntil: null })).toBe(MAX_LOGIN_ATTEMPTS);
    expect(attemptsRemaining({ loginAttempts: 3, lockUntil: null })).toBe(MAX_LOGIN_ATTEMPTS - 3);
  });

  it('never goes below zero', () => {
    expect(attemptsRemaining({ loginAttempts: 99, lockUntil: null })).toBe(0);
  });
});

describe('checkJwtSecret', () => {
  const strong = 'f4b1c9a6e2d8073b5c1e9f2a7d4b6c8e0a3f5d7b9c1e2f4a';

  it('refuses to start with no secret at all, in any environment', () => {
    // The fallback this replaces was the literal string 'secret', published in
    // every clone of the repository — anyone could have signed an admin token.
    for (const env of ['production', 'development', 'test', undefined]) {
      const verdict = checkJwtSecret(undefined, env);
      expect(verdict.ok).toBe(false);
    }
  });

  it('treats an empty or whitespace-only secret as missing', () => {
    expect(checkJwtSecret('', 'development').ok).toBe(false);
    expect(checkJwtSecret('   ', 'development').ok).toBe(false);
  });

  it('accepts a long random secret without complaint', () => {
    const verdict = checkJwtSecret(strong, 'production');
    expect(verdict).toEqual({ ok: true });
  });

  it('refuses the old hardcoded fallback in production', () => {
    expect(checkJwtSecret('secret', 'production').ok).toBe(false);
  });

  it('refuses the placeholder printed in .env.example in production', () => {
    expect(
      checkJwtSecret('your-super-secret-jwt-key-change-in-production', 'production').ok
    ).toBe(false);
  });

  it('is case-insensitive about placeholder values', () => {
    expect(checkJwtSecret('SECRET', 'production').ok).toBe(false);
    expect(checkJwtSecret('ChangeMe', 'production').ok).toBe(false);
  });

  it('refuses a short secret in production', () => {
    expect(checkJwtSecret('a'.repeat(MIN_JWT_SECRET_LENGTH - 1), 'production').ok).toBe(false);
    expect(checkJwtSecret('a'.repeat(MIN_JWT_SECRET_LENGTH), 'production').ok).toBe(true);
  });

  it('warns but does not block a weak secret outside production', () => {
    // A developer on a throwaway database should not be stopped from starting
    // the server; a deployment should never get that far.
    const verdict = checkJwtSecret('secret', 'development');
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.warning).toBeTruthy();
  });

  it('warns on a short secret outside production', () => {
    const verdict = checkJwtSecret('short', undefined);
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.warning).toContain('5 characters');
  });

  it('accepts the local development secret this project ships with', () => {
    expect(checkJwtSecret('dev-only-secret-not-for-production-8f3a91c4b7e2', 'development')).toEqual({
      ok: true,
    });
  });
});
