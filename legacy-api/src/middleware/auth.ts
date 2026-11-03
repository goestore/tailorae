import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { verifyToken } from '@/utils/jwt';
import { prisma } from '@/lib/prisma';
import { hashToken, checkJwtSecret } from '@/utils/auth-tokens';

/*
 * The environment is loaded here as well as in index.ts, and it has to be.
 * TypeScript compiles `import` to `require` and hoists every one of them above
 * the module body, so `dotenv.config()` on line 8 of index.ts actually runs
 * *after* this file has finished loading — which is exactly why utils/jwt.ts
 * reads its secret at call time rather than at import. The assertion below has
 * to see the real environment, so it loads it itself. `config()` never
 * overwrites a variable that is already set, so calling it twice is harmless
 * and a deployed process's real environment still wins over any .env file.
 */
dotenv.config();

/*
 * Refuse to start without a signing secret.
 *
 * utils/jwt.ts falls back to the literal string 'secret' when JWT_SECRET is
 * missing. That fallback is in every clone of this repository, so a single
 * absent environment variable meant anyone could sign themselves an admin
 * token — and nothing about the running server would look wrong. There is no
 * safe way to carry on, so this throws, and it throws at import: every route
 * file pulls this module in, so the process cannot reach `listen` with an
 * unusable secret, let alone serve a request with one.
 */
const secretVerdict = checkJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV);
if (!secretVerdict.ok) {
  throw new Error(`[auth] refusing to start: ${secretVerdict.reason}`);
}
if (secretVerdict.warning) {
  console.warn(`⚠ [auth] ${secretVerdict.warning} This would be fatal with NODE_ENV=production.`);
}

declare global {
  namespace Express {
    interface Request {
      user?: any;
      userId?: string;
    }
  }
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  userId?: string;
  /** The session row backing this request, for logout to revoke. */
  authSessionId?: string;
}

/** The bearer token on a request, if it carries one. */
const bearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
};

/** A JWT's own expiry, so a session row can be given the same lifetime. */
const tokenExpiry = (token: string): Date => {
  const decoded = jwt.decode(token);
  const exp = typeof decoded === 'object' && decoded !== null ? (decoded as jwt.JwtPayload).exp : undefined;
  // Seven days matches the JWT_EXPIRE default, and is only reached for a token
  // that somehow verified without carrying an expiry.
  return typeof exp === 'number' ? new Date(exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
};

/**
 * Record a signed-in session so the token that was just issued can later be
 * withdrawn. Call this everywhere a token is handed out.
 */
export const createSession = async (
  token: string,
  userId: string,
  req: Request
): Promise<string> => {
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: tokenExpiry(token),
      // Truncated because a user agent is attacker-controlled free text and
      // this column is only ever read by a human looking at a session list.
      deviceInfo: req.headers['user-agent']?.slice(0, 255) ?? null,
      ipAddress: req.ip ?? null,
    },
  });
  return session.id;
};

/** End one session. Idempotent — logging out twice is not an error. */
export const revokeSession = async (sessionId: string): Promise<void> => {
  await prisma.authSession.updateMany({
    where: { id: sessionId, isRevoked: false },
    data: { isRevoked: true, revokedAt: new Date() },
  });
};

/**
 * End every session an account has.
 *
 * Used after a password reset. Someone resetting a password has either
 * forgotten it or is recovering from a compromise, and in the second case
 * leaving the intruder's existing sessions alive would make the reset
 * pointless.
 */
export const revokeAllSessions = async (userId: string): Promise<number> => {
  const result = await prisma.authSession.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true, revokedAt: new Date() },
  });
  return result.count;
};

interface ResolvedSession {
  user: { id: string; email: string; role: string; status: string };
  sessionId: string;
}

type Resolution =
  | { outcome: 'ok'; session: ResolvedSession }
  | { outcome: 'rejected'; status: number; message: string }
  | { outcome: 'unavailable' };

/**
 * Turn a bearer token into a live session, or say why it is not one.
 *
 * Two things happen here that a signature check alone cannot do. The session
 * row makes logout real: a revoked row ends the token immediately instead of
 * leaving it valid for the remainder of its seven days. And the user is read
 * back from the database, so a suspension or a role change takes effect on the
 * very next request rather than whenever the holder happens to sign in again —
 * which is the bug that let a demoted admin keep admin routes for a week.
 *
 * Both come out of a single indexed read, because the user is joined onto the
 * session lookup rather than fetched separately.
 */
const resolveSession = async (token: string): Promise<Resolution> => {
  const payload = verifyToken(token);
  if (!payload) {
    return { outcome: 'rejected', status: 401, message: 'Invalid token' };
  }

  let session;
  try {
    session = await prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: { select: { id: true, email: true, role: true, status: true } },
      },
    });
  } catch (error) {
    // The database being down is not the caller's fault and must not read as a
    // bad token — a 401 would have every client throw its session away over an
    // outage it had nothing to do with.
    console.error('[auth] session lookup failed:', (error as Error).message);
    return { outcome: 'unavailable' };
  }

  if (!session) {
    /*
     * A validly signed token with no session row. This is a token issued
     * before sessions existed, and adopting it is deliberate: the alternative
     * is signing every current customer out the moment this deploys, to fix a
     * problem none of them has. Adoption gives up nothing, because a token can
     * only reach this branch by carrying a valid signature from our own key,
     * and anyone able to forge that does not need this branch. From this point
     * the token has a row, so logout and revocation work on it like any other.
     *
     * The branch stops being reachable once every pre-deployment token has
     * expired, and can be deleted then.
     */
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, role: true, status: true },
      });
      if (!user) {
        return { outcome: 'rejected', status: 401, message: 'Invalid token' };
      }
      const adopted = await prisma.authSession.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: tokenExpiry(token),
        },
      });
      return { outcome: 'ok', session: { user, sessionId: adopted.id } };
    } catch (error) {
      console.error('[auth] session adoption failed:', (error as Error).message);
      return { outcome: 'unavailable' };
    }
  }

  if (session.isRevoked) {
    return { outcome: 'rejected', status: 401, message: 'This session has ended. Please sign in again.' };
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    return { outcome: 'rejected', status: 401, message: 'This session has expired. Please sign in again.' };
  }

  if (session.user.status !== 'ACTIVE') {
    return {
      outcome: 'rejected',
      status: 403,
      message: 'Your account is not active. Please contact support.',
    };
  }

  return { outcome: 'ok', session: { user: session.user, sessionId: session.id } };
};

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = bearerToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    const resolution = await resolveSession(token);

    if (resolution.outcome === 'unavailable') {
      res.status(503).json({
        success: false,
        message: 'Could not verify your session right now. Please try again.',
      });
      return;
    }

    if (resolution.outcome === 'rejected') {
      res.status(resolution.status).json({
        success: false,
        message: resolution.message,
      });
      return;
    }

    const { user, sessionId } = resolution.session;
    // Role comes from the database rather than the token's own claim, so a
    // change of role is in force immediately.
    req.user = { id: user.id, email: user.email, role: user.role };
    req.userId = user.id;
    req.authSessionId = sessionId;

    next();
  } catch (error) {
    console.error('[auth] middleware failed:', (error as Error).message);
    res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

/**
 * Attach a user when there is one, and never stand in the way when there is
 * not. Guards public pages that show a little more to someone signed in, so a
 * bad or ended session here means "anonymous", not "error".
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = bearerToken(req);
    if (token) {
      const resolution = await resolveSession(token);
      if (resolution.outcome === 'ok') {
        const { user, sessionId } = resolution.session;
        req.user = { id: user.id, email: user.email, role: user.role };
        req.userId = user.id;
        req.authSessionId = sessionId;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.role) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient permissions',
      });
      return;
    }

    next();
  };
};

export const adminOnly = roleMiddleware(['ADMIN']);
export const vendorOnly = roleMiddleware(['VENDOR']);
export const b2bOnly = roleMiddleware(['B2B_BUYER']);
