import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Load environment variables before anything reads process.env
dotenv.config();

import { prisma } from '@/lib/prisma';

// Import routes
import authRoutes from '@/routes/auth';
import productRoutes from '@/routes/products';
import orderRoutes from '@/routes/orders';
import userRoutes from '@/routes/users';
import cartRoutes from '@/routes/cart';
import b2bRoutes from '@/routes/b2b';
import paymentRoutes from '@/routes/payments';
import adminRoutes from '@/routes/admin';
import contentRoutes, { publicContentRouter } from '@/routes/content';
import mediaRoutes, { UPLOAD_DIR } from '@/routes/media';

const app: Express = express();

// ============================================
// MIDDLEWARE
// ============================================

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
//
// A flat 100/15min across every /api/ route was tripping during ordinary use:
// browsing the catalogue fires a request per filter click, and `next build`
// prerenders every section page against this API, so a single build burned a
// large share of the budget from one IP. Reads now get a budget that suits a
// browsing session, while auth keeps a tight one because that is the endpoint
// worth throttling.
const WINDOW_MS = 15 * 60 * 1000;

const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
  // Local dev drives the API from one address — the frontend server, the
  // browser and any build all share it — so the limiter only measures noise.
  skip: () => process.env.NODE_ENV !== 'production',
});

const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 30,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware (simple)
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/b2b', b2bRoutes);
app.use('/api/payments', paymentRoutes);
// Mounted before the general admin router so the more specific prefix wins
// rather than falling through that router's guards first.
app.use('/api/admin/content', contentRoutes);
app.use('/api/admin/media', mediaRoutes);
app.use('/api/admin', adminRoutes);
// Uploaded images. Served unauthenticated because the storefront renders them
// for shoppers, and cached hard because a file's name is the hash of its bytes
// — the content at a given URL can never change.
app.use(
  '/uploads',
  // helmet() defaults Cross-Origin-Resource-Policy to same-origin, which would
  // stop the storefront on another port from rendering any of these. Relaxed
  // here only — the rest of the API keeps the strict default.
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(UPLOAD_DIR, {
    maxAge: '1y',
    immutable: true,
    // Nothing in here is meant to be executed or listed.
    index: false,
    dotfiles: 'ignore',
  })
);

// Published content is read by every storefront page, including during
// `next build`, so it is mounted outside the admin router and stays unauthenticated.
app.use('/api/content', publicContentRouter);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
  });
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err : undefined,
  });
});

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Try database connection but don't block server startup
  try {
    await prisma.$connect();
    console.log('✓ Database connected');
  } catch (error) {
    console.warn('⚠ Database not available — start PostgreSQL at localhost:5432');
    console.warn('  Run: docker-compose up -d  OR install PostgreSQL locally');
  }

  // Start server regardless of DB status
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║  Creative Impression API Server        ║
║  Running on: http://localhost:${PORT}   ║
║  Environment: ${process.env.NODE_ENV || 'development'}        ║
╚════════════════════════════════════════╝
    `);
  });
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

export default app;
