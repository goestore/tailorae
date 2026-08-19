import jwt, { SignOptions } from 'jsonwebtoken';

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
export const getJwtSecret = (): string => process.env.JWT_SECRET || 'secret';

const getJwtExpiresIn = (): SignOptions['expiresIn'] =>
  (process.env.JWT_EXPIRE || '7d') as SignOptions['expiresIn'];

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(
    { userId: payload.userId, email: payload.email, role: payload.role },
    getJwtSecret(),
    { expiresIn: getJwtExpiresIn() }
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
