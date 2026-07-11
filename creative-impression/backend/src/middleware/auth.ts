import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string; email: string; role: string; userId?: string };
    req.user = decoded;
    req.userId = decoded.userId || decoded.id;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string; email: string; role: string; userId?: string };
      req.user = decoded;
      req.userId = decoded.userId || decoded.id;
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
