import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { AuthTokenPurpose } from '@prisma/client';
import {
  authMiddleware,
  AuthRequest,
  createSession,
  revokeSession,
  revokeAllSessions,
} from '@/middleware/auth';
import { generateToken } from '@/utils/jwt';
import { prisma } from '@/lib/prisma';
import { isValidEmail, isNonEmptyString, sanitizeUser } from '@/utils/helpers';
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
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
import {
  sendEmailVerificationLink,
  sendPasswordChangedNotice,
  sendPasswordResetLink,
} from '@/services/notifications';

const router = Router();

const MIN_PASSWORD_LENGTH = 8;

/*
 * Budgets for the endpoints that put a message in someone else's inbox.
 *
 * The application-wide auth limiter does not cover these. It is configured
 * with `skipSuccessfulRequests`, and these answer 200 whatever happens —
 * `forgot-password` deliberately so, to avoid confirming which addresses are
 * registered — so every request would be skipped and the budget would never be
 * spent. Without something here, an unauthenticated caller could post a
 * stranger's address in a loop and use the store as a mail cannon.
 *
 * They are two separate budgets rather than one shared limiter because they
 * are not the same risk, and because sharing meant a customer who had just
 * asked for a reset link could not then ask for a confirmation link.
 */
const mailLimiterOptions = {
  windowMs: 60 * 60 * 1000,
  message: {
    success: false,
    message: 'Too many requests. Please wait a while before asking for another email.',
  },
  // Counting every outcome is the entire point here.
  skipSuccessfulRequests: false,
  skip: () => process.env.NODE_ENV === 'test',
};

/** Unauthenticated, and the address is whatever the caller typed. Kept tight. */
const forgotPasswordLimiter = rateLimit({ ...mailLimiterOptions, max: 5 });

/**
 * Authenticated, and the address comes from the account rather than the
 * request, so the only person who can be mailed is the one asking. The looser
 * number is for shared connections — an office behind one address should not
 * run out because five colleagues signed up this morning.
 */
const resendVerificationLimiter = rateLimit({ ...mailLimiterOptions, max: 20 });

/**
 * Do not send a second link within a minute of the last one.
 *
 * The IP limiter above stops a flood; this stops the ordinary case of an
 * impatient person pressing the button four times and receiving four links,
 * three of which are dead because each new one invalidates the last.
 */
const RESEND_COOLDOWN_MS = 60 * 1000;

/** The address as it is stored: lowercased and trimmed, always. */
const normalizeEmail = (email: string): string => String(email).toLowerCase().trim();

const clientIp = (req: Request): string | null => req.ip ?? null;

/**
 * Issue a fresh single-use token and retire the account's outstanding ones.
 *
 * Retiring the old ones is what makes "the newest link is the only live link"
 * true. Without it a reset link from three weeks ago still works, which turns
 * every old mailbox and browser history into a way in.
 */
const issueAuthToken = async (
  userId: string,
  purpose: AuthTokenPurpose,
  ttlMs: number,
  req: Request
): Promise<{ token: string; expiresAt: Date } | null> => {
  const recent = await prisma.authToken.findFirst({
    where: { userId, purpose, usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return null;
  }

  const issued = issueToken(ttlMs);

  await prisma.$transaction([
    /*
     * Everything this account had for this purpose goes, live links included.
     * That is what makes the newest link the only working one, and it doubles
     * as the sweep for used and expired rows — this table is only ever written
     * here, so this is the one moment a cron job would have had anything to
     * do, and the project has no scheduler to hang one on.
     */
    prisma.authToken.deleteMany({ where: { userId, purpose } }),
    prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        requestedIp: clientIp(req),
      },
    }),
  ]);

  return { token: issued.token, expiresAt: issued.expiresAt };
};

/** Mint a verification link and post it, without ever failing the caller. */
const sendVerification = async (
  user: { id: string; email: string; firstName: string | null },
  req: Request
): Promise<void> => {
  try {
    const issued = await issueAuthToken(
      user.id,
      AuthTokenPurpose.EMAIL_VERIFICATION,
      EMAIL_VERIFICATION_TTL_MS,
      req
    );
    if (!issued) return;
    await sendEmailVerificationLink({
      to: user.email,
      firstName: user.firstName,
      token: issued.token,
      expiresInDays: Math.round(EMAIL_VERIFICATION_TTL_MS / (24 * 60 * 60 * 1000)),
    });
  } catch (error) {
    console.error('[AUTH] verification dispatch failed:', (error as Error).message);
  }
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body ?? {};

    // 1. Validate input
    const errors: string[] = [];
    if (!isNonEmptyString(firstName)) errors.push('firstName is required');
    if (!isNonEmptyString(lastName)) errors.push('lastName is required');
    if (!isValidEmail(email)) errors.push('A valid email is required');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const normalizedEmail = normalizeEmail(email);

    // 2. Check if user exists
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }

    // 3. Hash password
    const hashed = await bcrypt.hash(password, 10);

    /*
     * 4. Create user (with an empty cart).
     *
     * The account is ACTIVE and not PENDING_VERIFICATION even though the
     * address is unconfirmed. Login refuses any status other than ACTIVE, and
     * this store has no SMTP credentials — mail is written to a log — so
     * gating on verification would lock every new customer out of the account
     * they just made. Verification is tracked by `emailVerified` and is a
     * signal, not a gate; make it a gate on the day mail actually leaves the
     * building.
     */
    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        password: hashed,
        role: 'RETAIL_CUSTOMER',
        status: 'ACTIVE',
        emailVerified: false,
        cart: { create: {} },
      },
    });

    // 5. Generate token and record the session it belongs to
    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    await createSession(token, user.id, req);

    // 6. Confirm the address. Fire-and-forget — a mail problem must not undo a
    // registration that has already committed.
    void sendVerification(user, req);

    // 7. Return user (without password) and token
    res.status(201).json({
      success: true,
      message: 'Registration successful. Check your email to confirm your address.',
      data: { user: sanitizeUser(user), token },
    });
  } catch (error) {
    console.error('[AUTH] register failed:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });

    // Same message for unknown email and wrong password — do not leak which one failed.
    if (!user || !user.password) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    /*
     * The lock is checked before the password is compared, not after. Checking
     * afterwards would let an attacker keep testing guesses against a locked
     * account and learn from the timing which one was right, and it spends a
     * bcrypt comparison on a request that cannot succeed either way.
     *
     * This message differs from the one above, which does tell a patient
     * attacker that the address is registered. That is accepted knowingly: the
     * signal costs five wrong passwords per address to obtain, through an IP
     * limiter, and the alternative is telling a locked-out customer nothing
     * but "wrong password" while their correct password keeps being refused.
     */
    if (isLocked(user.lockUntil)) {
      res.status(429).json({
        success: false,
        message: `Too many failed sign-in attempts. Try again in ${formatLockRemaining(
          lockRemainingMs(user.lockUntil)
        )}, or reset your password.`,
      });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      const next = registerFailedAttempt({
        loginAttempts: user.loginAttempts,
        lockUntil: user.lockUntil,
      });
      await prisma.user.update({ where: { id: user.id }, data: next });

      if (isLocked(next.lockUntil)) {
        res.status(429).json({
          success: false,
          message: `Too many failed sign-in attempts. Try again in ${formatLockRemaining(
            lockRemainingMs(next.lockUntil)
          )}, or reset your password.`,
        });
        return;
      }

      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({ success: false, message: 'Your account is not active. Please contact support.' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date(), ...clearFailedAttempts() },
    });

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    await createSession(token, user.id, req);

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: sanitizeUser(updatedUser), token },
    });
  } catch (error) {
    console.error('[AUTH] login failed:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current authenticated user (session restore)
// @access  Private
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Current user fetched',
      data: { user: sanitizeUser(user) },
    });
  } catch (error) {
    console.error('[AUTH] me failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current user',
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Log out, ending this session for good
// @access  Private
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    /*
     * This used to be a no-op with a comment explaining that JWTs are
     * stateless. They are, which is why the token is now paired with a session
     * row — revoking it is what turns "the browser forgot the token" into "the
     * token no longer works". It matters most on a shared or public machine,
     * where a copy of the token taken before logout would otherwise stay good
     * for another week.
     */
    if (req.authSessionId) {
      await revokeSession(req.authSessionId);
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('[AUTH] logout failed:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
});

// @route   POST /api/auth/refresh-token
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh-token', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Re-read the user so role/status changes are reflected in the new token.
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({ success: false, message: 'Your account is not active. Please contact support.' });
      return;
    }

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    await createSession(token, user.id, req);

    // The old token is retired rather than left to run alongside the new one.
    // Two live tokens per refresh would mean a week's worth of them piling up
    // from one browser, each independently usable if it leaked.
    if (req.authSessionId) {
      await revokeSession(req.authSessionId);
    }

    res.json({
      success: true,
      message: 'Token refreshed',
      data: { token },
    });
  } catch (error) {
    console.error('[AUTH] refresh-token failed:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed',
    });
  }
});

// ============================================
// PASSWORD RESET
// ============================================

/**
 * The one response `forgot-password` ever gives.
 *
 * Identical for a registered address, an unknown address, a suspended account
 * and one that asked a moment ago. Any difference between them — wording,
 * status code, or the presence of a field — turns this endpoint into a
 * membership oracle: post a list of addresses, keep the ones that answer
 * differently, and you have a verified customer list to phish.
 */
const FORGOT_PASSWORD_RESPONSE = {
  success: true,
  message: 'If that address has an account, a reset link is on its way.',
};

// @route   POST /api/auth/forgot-password
// @desc    Email a single-use password reset link
// @access  Public
router.post('/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body ?? {};

    if (!isValidEmail(email)) {
      // Malformed input is not a lookup, so saying so leaks nothing.
      res.status(400).json({ success: false, message: 'A valid email is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { id: true, email: true, firstName: true, status: true },
    });

    /*
     * A suspended account gets no link. Letting one reset its way back in
     * would make suspension a formality. It gets the same answer as everyone
     * else, so the refusal is not visible from outside.
     */
    if (user && user.status !== 'SUSPENDED' && user.status !== 'INACTIVE') {
      const issued = await issueAuthToken(
        user.id,
        AuthTokenPurpose.PASSWORD_RESET,
        PASSWORD_RESET_TTL_MS,
        req
      );
      if (issued) {
        await sendPasswordResetLink({
          to: user.email,
          firstName: user.firstName,
          token: issued.token,
          expiresInMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60000),
        });
      }
    }

    res.json(FORGOT_PASSWORD_RESPONSE);
  } catch (error) {
    console.error('[AUTH] forgot-password failed:', error);
    // Even a crash answers the same way. A 500 for known addresses and a 200
    // for unknown ones would be the same oracle by another route.
    res.json(FORGOT_PASSWORD_RESPONSE);
  }
});

// @route   POST /api/auth/reset-password
// @desc    Redeem a reset link and set a new password
// @access  Public
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    /*
     * `password` is the field, and `newPassword` is not read.
     *
     * The two were both being sent while the contract was unsettled. This one
     * wins because it is what /register and /login already call it, and
     * because `newPassword` only earns its name next to a `currentPassword` —
     * which this flow has not got, the emailed token being what stands in for
     * proof of identity here.
     */
    const { token, password } = req.body ?? {};

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
      return;
    }

    // Checked before the token is looked up, so a password the form should
    // have caught never burns a single-use link.
    if (!isWellFormedToken(token)) {
      res.status(400).json({
        success: false,
        message: 'This reset link is not valid. Please request a new one.',
      });
      return;
    }

    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token.trim()) },
      include: { user: { select: { id: true, email: true, firstName: true, status: true } } },
    });

    const usable = record && record.purpose === AuthTokenPurpose.PASSWORD_RESET && isTokenUsable(record);

    if (!record || !usable) {
      // The reason is logged, never returned: "already used" and "never
      // existed" are different facts about someone else's account.
      console.warn(
        `[AUTH] reset-password refused (${tokenRefusalReason(record)}${
          record && record.purpose !== AuthTokenPurpose.PASSWORD_RESET ? ', wrong purpose' : ''
        })`
      );
      res.status(400).json({
        success: false,
        message: 'This reset link has expired or has already been used. Please request a new one.',
      });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const now = new Date();

    /*
     * One transaction, because a password changed without the token being
     * spent leaves a live reset link for an account whose owner believes it is
     * now secure — and the reverse leaves a customer with a burnt link and the
     * old password.
     */
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: {
          password: hashed,
          // Whoever was locked out is the person most likely to be resetting.
          // Leaving the lock in place would hand them a new password they
          // still cannot use.
          ...clearFailedAttempts(),
        },
      }),
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    ]);

    /*
     * Every existing session ends. Someone resetting a password has either
     * forgotten it or is recovering an account somebody else got into, and in
     * the second case an intruder's live session would sail straight through
     * the reset that was meant to remove them.
     */
    const ended = await revokeAllSessions(record.userId);
    console.info(`[AUTH] password reset for ${record.userId}; ${ended} session(s) ended`);

    void sendPasswordChangedNotice({
      to: record.user.email,
      firstName: record.user.firstName,
      changedAt: now,
    });

    res.json({
      success: true,
      message: 'Your password has been changed. Sign in with the new one.',
    });
  } catch (error) {
    console.error('[AUTH] reset-password failed:', error);
    res.status(500).json({ success: false, message: 'Could not reset your password' });
  }
});

// ============================================
// EMAIL VERIFICATION
// ============================================

type VerificationOutcome = 'verified' | 'already' | 'invalid';

/**
 * Redeem a verification token. Shared by the link in the mail and the JSON
 * endpoint so the two can never disagree about what a token means.
 */
const redeemVerification = async (token: unknown): Promise<VerificationOutcome> => {
  if (!isWellFormedToken(token)) return 'invalid';

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token.trim()) },
    include: { user: { select: { id: true, emailVerified: true, status: true } } },
  });

  if (!record || record.purpose !== AuthTokenPurpose.EMAIL_VERIFICATION) return 'invalid';

  // Answered before the usability check on purpose: someone who clicks the
  // link in an old mail twice has done nothing wrong, and "this link is
  // broken" would be a confusing thing to tell them about an address that is
  // already confirmed.
  if (record.user.emailVerified) return 'already';

  if (!isTokenUsable(record)) return 'invalid';

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: now,
        // Promotes an account that was created awaiting verification. Accounts
        // made through /register are already ACTIVE, so this is only for ones
        // seeded or invited at the schema default.
        ...(record.user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' as const } : {}),
      },
    }),
    prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
  ]);

  return 'verified';
};

// @route   GET /api/auth/verify-email
// @desc    Confirm an address from the emailed link, then hand off to the site
// @access  Public
router.get('/verify-email', async (req: Request, res: Response) => {
  /*
   * The emailed link lands here rather than on the storefront because the
   * storefront has no page for it, and a link in an already-sent email cannot
   * be changed later. Verifying here and redirecting means the mail is correct
   * today and stays correct if a page is added — point the redirect at it.
   */
  const site = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  try {
    const outcome = await redeemVerification(req.query.token);
    res.redirect(`${site}/auth/login?verified=${outcome}`);
  } catch (error) {
    console.error('[AUTH] verify-email (link) failed:', error);
    res.redirect(`${site}/auth/login?verified=invalid`);
  }
});

// @route   POST /api/auth/verify-email
// @desc    Confirm an address from a token, for a page that wants JSON
// @access  Public
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const outcome = await redeemVerification(req.body?.token);

    if (outcome === 'invalid') {
      res.status(400).json({
        success: false,
        message: 'This confirmation link has expired or has already been used.',
      });
      return;
    }

    res.json({
      success: true,
      message:
        outcome === 'already'
          ? 'That address was already confirmed.'
          : 'Thanks — your email address is confirmed.',
      data: { emailVerified: true },
    });
  } catch (error) {
    console.error('[AUTH] verify-email failed:', error);
    res.status(500).json({ success: false, message: 'Could not confirm your address' });
  }
});

// @route   POST /api/auth/resend-verification
// @desc    Send a fresh confirmation link to the signed-in user
// @access  Private
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      /*
       * Sign-in is required, and the address is taken from the account rather
       * than the request body. An open "send a confirmation to this address"
       * endpoint is both a mail cannon aimed at anyone and a way to find out
       * which addresses are registered; taking the address from the session
       * removes both, and anyone who has just registered is already signed in.
       */
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { id: true, email: true, firstName: true, emailVerified: true },
      });

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      if (user.emailVerified) {
        res.json({ success: true, message: 'Your address is already confirmed.' });
        return;
      }

      await sendVerification(user, req);

      res.json({
        success: true,
        message: 'Confirmation link sent. Check your inbox.',
      });
    } catch (error) {
      console.error('[AUTH] resend-verification failed:', error);
      res.status(500).json({ success: false, message: 'Could not send a confirmation email' });
    }
  }
);

export default router;
