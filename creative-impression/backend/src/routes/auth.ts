import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { generateToken } from '@/utils/jwt';
import { prisma } from '@/lib/prisma';
import { isValidEmail, isNonEmptyString, sanitizeUser } from '@/utils/helpers';

const router = Router();

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
    if (typeof password !== 'string' || password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // 2. Check if user exists
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }

    // 3. Hash password
    const hashed = await bcrypt.hash(password, 10);

    // 4. Create user (with an empty cart)
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

    // 5. Generate token
    const token = generateToken({ userId: user.id, email: user.email, role: user.role });

    // 6. Return user (without password) and token
    res.status(201).json({
      success: true,
      message: 'Registration successful',
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

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });

    // Same message for unknown email and wrong password — do not leak which one failed.
    if (!user || !user.password) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({ success: false, message: 'Your account is not active. Please contact support.' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });

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
// @desc    Logout user
// @access  Private
router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  try {
    // JWTs are stateless — nothing to invalidate server-side.
    // The client should discard the token; a token blocklist can be added later.
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
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

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Not available yet — email service not configured',
  });
});

// @route   POST /api/auth/reset-password
// @desc    Reset password
// @access  Public
router.post('/reset-password', async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Not available yet — email service not configured',
  });
});

export default router;
