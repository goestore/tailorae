import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Single source of truth for the JWT secret.
 * Read at CALL time (not module load) so dotenv.config() in index.ts
 * has always run before the first token is signed/verified.
 */
export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  /**
   * No fallback. This used to read `|| 'secret'`, which meant a deployment
   * missing one environment variable signed every token with a five-letter
   * word — anybody could mint an admin JWT. `middleware/auth.ts` now asserts
   * the variable at import and every route pulls that in, so this branch
   * should be unreachable; it is kept as the guarantee rather than removed,
   * because the cost of being wrong is the whole authentication system.
   */
  if (!secret) {
    throw new Error('JWT_SECRET is not set — refusing to sign or verify a token');
  }
  return secret;
};

const getJwtExpiresIn = (): SignOptions['expiresIn'] =>
  (process.env.JWT_EXPIRE || '7d') as SignOptions['expiresIn'];

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(
    { userId: payload.userId, email: payload.email, role: payload.role },
    getJwtSecret(),
    {
      expiresIn: getJwtExpiresIn(),
      // A unique id per token. Without it, two sign-ins by the same user in
      // the same second (a double-clicked button, two tabs) produced
      // byte-identical tokens; the session table stores a hash of each token
      // under a unique index, so the second sign-in failed with a 500.
      jwtid: randomUUID(),
    }
  );
};

export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded !== 'object' || decoded === null) {
      return null;
    }
    const payload = decoded as jwt.JwtPayload & Partial<JWTPayload>;
    if (typeof payload.userId !== 'string' || payload.userId.length === 0) {
      return null;
    }
    return {
      userId: payload.userId,
      email: typeof payload.email === 'string' ? payload.email : '',
      role: typeof payload.role === 'string' ? payload.role : '',
    };
  } catch {
    return null;
  }
};

export const decodeToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.decode(token) as JWTPayload | null;
    return decoded;
  } catch {
    return null;
  }
};
