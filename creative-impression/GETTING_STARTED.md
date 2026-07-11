# Getting Started - Creative Impression

Complete setup and development guide for the Creative Impression platform.

## Prerequisites

Before starting, ensure you have:

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher (or yarn)
- **Git**: Latest version
- **PostgreSQL**: v12.0 or higher (local or remote)
- **Git Account**: For version control

## Project Overview

**Creative Impression** is a full-stack eCommerce platform for B2B wholesale and B2C retail customers.

- **Frontend**: Next.js 15 with React 19 and Tailwind CSS
- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Deployment**: Vercel (Frontend), Railway/Heroku (Backend)

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/yourname/creative-impression.git
cd creative-impression
```

### 2. Setup Frontend

**Navigate to frontend directory:**
```bash
cd frontend
```

**Install dependencies:**
```bash
npm install
```

**Configure environment variables:**
```bash
cp .env.example .env.local
```

**Edit .env.local with your values:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
NEXTAUTH_SECRET=generate-random-secret-here
```

**Generate NextAuth secret:**
```bash
openssl rand -base64 32
# Use the generated string in NEXTAUTH_SECRET
```

**Start development server:**
```bash
npm run dev
```

The frontend will be available at: `http://localhost:3000`

### 3. Setup Backend

**In a new terminal, navigate to backend directory:**
```bash
cd backend
```

**Install dependencies:**
```bash
npm install
```

**Configure environment variables:**
```bash
cp .env.example .env
```

**Setup PostgreSQL Database**

> ⚠️ **Important**: You must set up PostgreSQL before starting the backend server!
> See [DATABASE_SETUP.md](./DATABASE_SETUP.md) for detailed instructions.

**Quick Start with Docker (Recommended):**

If you have Docker installed, run this from the project root:
```bash
docker-compose up -d
```

This will:
- Start PostgreSQL 15 container
- Create the `creative_impression` database
- Expose it on `localhost:5432`

**Alternative: Manual PostgreSQL Setup**

1. Install PostgreSQL v13+: https://www.postgresql.org/download/
2. Create database:
   ```bash
   createdb -U postgres creative_impression
   ```
3. Verify connection in `.env`:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/creative_impression
   ```

**Environment Variables**

The `.env` file is already configured for local development:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/creative_impression
PORT=3001
NODE_ENV=development
JWT_SECRET=creative-impression-dev-secret-key-2024
FRONTEND_URL=http://localhost:3001
```

For production, update these values before deployment.

**Run Prisma migrations:**
```bash
npx prisma migrate dev --name init
```

This will:
1. Create all tables
2. Setup relationships
3. Create initial indexes

**Seed initial data (optional):**
```bash
npx prisma db seed
```

**Open Prisma Studio (optional):**
```bash
npx prisma studio
```

**Start backend server:**
```bash
npm run dev
```

The backend API will be available at: `http://localhost:5000`

## Verification

### Check Frontend
```bash
curl http://localhost:3001
# Should return HTML
```

### Check Backend
```bash
curl http://localhost:5000/api/health
# Should return: {"status":"OK","timestamp":"..."}
```

### Check Database
```bash
# Option 1: Using Prisma Studio
cd backend && npx prisma studio

# Option 2: Using Docker (if PostgreSQL in container)
docker exec -it creative-impression-db psql -U postgres -d creative_impression -c "\dt"
```

## Project Structure Overview

```
creative-impression/
├── frontend/                 # Next.js application
│   ├── src/
│   │   ├── app/             # App router pages
│   │   ├── components/      # React components
│   │   ├── store/           # Redux store
│   │   ├── types/           # TypeScript types
│   │   └── styles/          # Global CSS
│   ├── package.json
│   ├── tailwind.config.js
│   └── next.config.js
│
├── backend/                 # Express API
│   ├── src/
│   │   ├── routes/          # API routes
│   │   ├── middleware/      # Custom middleware
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Helper functions
│   │   └── index.ts         # Entry point
│   ├── prisma/
│   │   └── schema.prisma    # Database schema
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                    # Documentation
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── ARCHITECTURE.md
│   └── DATABASE.md
│
└── README.md               # Project README
```

## Common Commands

### Frontend

```bash
# Development
npm run dev                 # Start dev server

# Production
npm run build              # Build for production
npm start                  # Start production server

# Maintenance
npm run lint              # Run ESLint
npm run type-check        # Check TypeScript
npm run format            # Format code with Prettier

# Testing
npm run test              # Run tests
```

### Backend

```bash
# Development
npm run dev               # Start dev server with auto-reload

# Production
npm run build            # Build TypeScript
npm start                # Start production server

# Database
npx prisma migrate dev   # Create migration
npx prisma migrate deploy # Deploy migration
npx prisma db seed       # Seed database
npx prisma studio       # Open database UI

# Maintenance
npm run lint             # Run ESLint
npm run type-check       # Check TypeScript
npm run test             # Run tests
```

## Development Workflow

### 1. Create Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes
- Edit frontend/backend files
- Test locally
- Follow code style

### 3. Commit Changes
```bash
git add .
git commit -m "feat: add your feature description"
```

### 4. Push and Create PR
```bash
git push origin feature/your-feature-name
```

## Environment Variables Reference

### Frontend (.env.local)
```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret

# Analytics (Optional)
NEXT_PUBLIC_GA_ID=your-google-analytics-id
```

### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/creative_impression

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRE=7d

# Application
NODE_ENV=development
PORT=3001

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Payment Gateways (Optional)
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret
STRIPE_SECRET_KEY=your-stripe-key

# AWS S3 (Optional)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET_NAME=your-bucket-name

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

## Troubleshooting

### Issue: "Port 3000/3001 already in use"

**Solution:**
```bash
# Find process using port
lsof -i :3000
# Kill process
kill -9 <PID>

# Or use different port
PORT=3002 npm run dev
```

### Issue: "Cannot find module '@prisma/client'"

**Solution:**
```bash
cd backend
npm install
npx prisma generate
```

### Issue: "Database connection refused"

**Solution:**
```bash
# Check PostgreSQL is running
psql -U postgres

# Verify DATABASE_URL
echo $DATABASE_URL

# Restart PostgreSQL
# macOS
brew services restart postgresql

# Ubuntu
sudo service postgresql restart
```

### Issue: "Migration pending"

**Solution:**
```bash
cd backend
npx prisma migrate deploy
```

### Issue: "CORS Error"

**Solution:**
```env
# In backend .env
FRONTEND_URL=http://localhost:3000

# Restart backend server
npm run dev
```

## Next Steps

### 1. Create Admin User

**Via database:**
```bash
psql -U ci_user -d creative_impression
INSERT INTO "User" (id, email, password, role, status, "emailVerified")
VALUES (
  'admin-id-here',
  'admin@creativeimpression.com',
  'hashed-password',
  'ADMIN',
  'ACTIVE',
  true
);
```

### 2. Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project
3. Enable OAuth 2.0
4. Create credentials (OAuth 2.0 Client ID)
5. Add authorized redirect URIs
6. Copy credentials to .env

### 3. Implement Features

Start with core features:
1. User authentication
2. Product listing
3. Shopping cart
4. Orders

See [API Documentation](docs/API.md) for endpoints.

### 4. Styling & Components

The project includes:
- Tailwind CSS configuration
- Global styles
- Reusable component templates

Check [Tailwind Docs](https://tailwindcss.com) for utilities.

### 5. Testing

```bash
# Frontend
npm run test

# Backend
npm run test

# End-to-end
npm run test:e2e
```

### 6. Deployment

When ready to deploy:

**Frontend to Vercel:**
```bash
cd frontend
vercel --prod
```

**Backend to Railway:**
```bash
cd backend
npm i -g railway
railway login
railway up
```

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed steps.

## Learning Resources

### Next.js
- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js App Router Guide](https://nextjs.org/docs/app)

### React
- [React Documentation](https://react.dev)
- [React Hooks Guide](https://react.dev/reference/react/hooks)

### Tailwind CSS
- [Tailwind Documentation](https://tailwindcss.com/docs)
- [Tailwind Component Examples](https://tailwindui.com)

### Express.js
- [Express Documentation](https://expressjs.com)
- [REST API Best Practices](https://restfulapi.net)

### PostgreSQL
- [PostgreSQL Documentation](https://www.postgresql.org/docs)
- [SQL Tutorial](https://www.w3schools.com/sql/)

### Prisma
- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)

## Support & Help

### Documentation
- [API Documentation](docs/API.md)
- [Database Schema](docs/DATABASE.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

### Community
- Check GitHub Issues
- Search existing documentation
- Ask in development team

### Reporting Issues

When reporting issues, include:
1. Operating System
2. Node.js version
3. Error message (full stack trace)
4. Steps to reproduce
5. Expected vs actual behavior

## Next Phase Checklist

- [ ] Frontend runs on http://localhost:3000
- [ ] Backend runs on http://localhost:3001
- [ ] Database migrations completed
- [ ] Health check returns success
- [ ] Admin user created
- [ ] Google OAuth configured
- [ ] Environment variables set
- [ ] Git repository initialized
- [ ] Basic components reviewed
- [ ] API documentation understood

## Performance Tips

### Frontend
- Use lazy loading for images
- Optimize bundle size
- Enable code splitting
- Use React.memo for expensive components

### Backend
- Use indexes on frequently queried columns
- Implement caching with Redis
- Use connection pooling
- Optimize database queries

### Database
- Regular VACUUM and ANALYZE
- Monitor slow queries
- Archive old data
- Use read replicas

---

**You're all set! Happy coding! 🚀**

For more questions, refer to the documentation folder or contact the development team.
