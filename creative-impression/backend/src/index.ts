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
import adminB2BRoutes from '@/routes/admin-b2b';
import paymentRoutes, { RAZORPAY_WEBHOOK_PATH } from '@/routes/payments';
import adminRoutes from '@/routes/admin';
import catalogImportRoutes from '@/routes/catalog-import';
import catalogExportRoutes from '@/routes/catalog-export';
import contentRoutes, { publicContentRouter } from '@/routes/content';
import mediaRoutes, { UPLOAD_DIR } from '@/routes/media';
import contactRoutes from '@/routes/contact';
import couponRoutes from '@/routes/coupons';
import newsletterRoutes from '@/routes/newsletter';
import deliveryRoutes from '@/routes/delivery';
import trackOrderRoutes from '@/routes/track-order';
import stockNotifyRoutes from '@/routes/stock-notify';
import sellerRoutes from '@/routes/seller';
import catalogueRoutes from '@/routes/catalogue';
import adminReportRoutes from '@/routes/admin-report';
import customWearRoutes from '@/routes/custom-wear';
import adminCustomWearRoutes from '@/routes/admin-custom-wear';
import adminCategoryFieldRoutes from '@/routes/admin-category-fields';
import { assertFieldCryptoReady } from '@/utils/field-crypto';

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
  // Custom response headers are invisible to a cross-origin caller unless they
  // are exposed. The storefront runs on a different port in development and
  // reads the listing total from this one.
  exposedHeaders: ['X-Total-Count'],
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

// Razorpay signs the raw request body, so the webhook route needs the bytes
// exactly as sent: `express.json()` below would consume the stream and leave
// nothing to verify against `x-razorpay-signature`, and re-serialising the
// parsed object does not reproduce the same digest. Mounted first and for that
// one path only — body-parser marks the request as read, so the JSON parser
// skips it and every other route is unaffected.
app.use(RAZORPAY_WEBHOOK_PATH, express.raw({ type: '*/*', limit: '1mb' }));

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
app.use('/api/contact', contactRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/track-order', trackOrderRoutes);
app.use('/api/stock-notify', stockNotifyRoutes);
// A seller's own shop. The public seller directory lives under /api/products.
app.use('/api/seller', sellerRoutes);
app.use('/api/custom-wear', customWearRoutes);
app.use('/api/catalogue', catalogueRoutes);
app.use('/api/admin/report', adminReportRoutes);
// Mounted before the general admin router so the more specific prefix wins
// rather than falling through that router's guards first.
app.use('/api/admin/content', contentRoutes);
app.use('/api/admin/media', mediaRoutes);
app.use('/api/admin/custom-wear', adminCustomWearRoutes);
app.use('/api/admin/b2b', adminB2BRoutes);
// Only /:id/fields; the category CRUD itself stays in the admin router.
app.use('/api/admin/categories', adminCategoryFieldRoutes);
// Before the admin router, whose /products/:id routes would otherwise see "export".
app.use('/api/admin/products/export', catalogExportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/catalog-import', catalogImportRoutes);
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
  // Fail at boot, not on the first payout, if bank details cannot be decrypted.
  assertFieldCryptoReady();

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
