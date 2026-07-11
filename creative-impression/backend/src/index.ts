import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';

// Import routes
import authRoutes from '@/routes/auth';
import productRoutes from '@/routes/products';
import orderRoutes from '@/routes/orders';
import userRoutes from '@/routes/users';
import cartRoutes from '@/routes/cart';
import b2bRoutes from '@/routes/b2b';
import paymentRoutes from '@/routes/payments';
import adminRoutes from '@/routes/admin';

// Load environment variables
dotenv.config();

const app: Express = express();
const prisma = new PrismaClient();

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
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

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
app.use('/api/admin', adminRoutes);

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

const PORT = process.env.PORT || 3001;

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
