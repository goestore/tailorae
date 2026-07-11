# Deployment Guide - Creative Impression

Complete guide for deploying Creative Impression to production environments.

## Table of Contents
1. [Frontend Deployment](#frontend-deployment)
2. [Backend Deployment](#backend-deployment)
3. [Database Setup](#database-setup)
4. [Environment Configuration](#environment-configuration)
5. [Post-Deployment](#post-deployment)

---

## Frontend Deployment

### Option 1: Vercel (Recommended)

Vercel is the optimal choice for Next.js applications with zero-configuration deployment.

**Steps:**

1. **Create Vercel Account**
   - Visit [vercel.com](https://vercel.com)
   - Sign up with GitHub account
   - Install Vercel GitHub App

2. **Connect Repository**
   - Import project from GitHub
   - Select `creative-impression` repository
   - Configure project settings

3. **Configure Environment Variables**
   ```
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   GOOGLE_CLIENT_ID=your-google-client-id
   NEXTAUTH_SECRET=generate-secure-secret
   ```

4. **Deploy**
   ```bash
   # Vercel CLI deployment (alternative)
   npm i -g vercel
   cd frontend
   vercel --prod
   ```

5. **Domain Configuration**
   - Add custom domain in Vercel dashboard
   - Configure DNS settings
   - SSL certificate automatically provisioned

### Option 2: AWS Amplify

**Steps:**

1. Connect GitHub repository
2. Select `frontend` directory as source
3. Add build settings
4. Add environment variables
5. Deploy with auto-scaling

### Option 3: Netlify

**Steps:**

```bash
cd frontend
npm run build

# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir=.next
```

### Option 4: Manual Deployment (Docker)

**Docker Setup:**

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**Build and Push:**

```bash
docker build -t creative-impression-frontend .
docker tag creative-impression-frontend your-registry/creative-impression-frontend:latest
docker push your-registry/creative-impression-frontend:latest
```

---

## Backend Deployment

### Option 1: Railway

**Steps:**

1. **Create Railway Account**
   - Visit [railway.app](https://railway.app)
   - Connect GitHub account

2. **Deploy Project**
   ```bash
   npm i -g railway
   railway login
   cd backend
   railway up
   ```

3. **Configure Environment**
   - Add database service
   - Configure environment variables
   - Set NODE_ENV=production

4. **Run Migrations**
   ```bash
   railway run npx prisma migrate deploy
   railway run npx prisma db seed
   ```

### Option 2: Heroku

**Steps:**

1. **Create Heroku App**
   ```bash
   npm i -g heroku
   heroku login
   heroku create creative-impression-api
   ```

2. **Add PostgreSQL**
   ```bash
   heroku addons:create heroku-postgresql:standard-0 -a creative-impression-api
   ```

3. **Configure Environment Variables**
   ```bash
   heroku config:set NODE_ENV=production -a creative-impression-api
   heroku config:set JWT_SECRET=your-secret -a creative-impression-api
   # Add other variables...
   ```

4. **Deploy**
   ```bash
   git push heroku main
   heroku run npx prisma migrate deploy
   ```

### Option 3: AWS EC2

**Steps:**

1. **Launch EC2 Instance**
   - AMI: Ubuntu 22.04 LTS
   - Instance: t3.medium or higher
   - Security Group: Allow ports 80, 443, 3001

2. **Setup Server**
   ```bash
   # SSH into instance
   ssh -i key.pem ubuntu@your-instance-ip

   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Install PM2
   sudo npm install -g pm2

   # Install Nginx
   sudo apt install -y nginx
   ```

3. **Setup Application**
   ```bash
   # Clone repository
   git clone your-repo-url
   cd creative-impression/backend

   # Install dependencies
   npm install

   # Build TypeScript
   npm run build

   # Configure PM2
   pm2 start dist/index.js --name "creative-impression-api"
   pm2 save
   pm2 startup
   ```

4. **Configure Nginx**
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   ```bash
   sudo systemctl restart nginx
   ```

5. **SSL Certificate (Let's Encrypt)**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d api.yourdomain.com
   ```

### Option 4: DigitalOcean App Platform

**Steps:**

1. Connect GitHub repository
2. Select backend directory
3. Configure build settings
4. Add PostgreSQL database
5. Set environment variables
6. Deploy

---

## Database Setup

### PostgreSQL Installation

**Option 1: Managed Database (Recommended)**

- **AWS RDS**: Automated backups, replication, scaling
- **Railway PostgreSQL**: Simple setup, automatic management
- **Heroku Postgres**: Integrated with app hosting

**Option 2: Self-Hosted PostgreSQL**

```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql
CREATE DATABASE creative_impression;
CREATE USER ci_user WITH PASSWORD 'strong-password';
ALTER ROLE ci_user SET client_encoding TO 'utf8';
ALTER ROLE ci_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE ci_user SET default_transaction_deferrable TO on;
ALTER ROLE ci_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE creative_impression TO ci_user;
\q
```

### Database Migrations

```bash
# Backend directory
cd backend

# Run migrations
npx prisma migrate deploy

# Seed initial data
npx prisma db seed
```

---

## Environment Configuration

### Production Environment Variables

**Backend (.env)**
```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/creative_impression
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRE=7d

# AWS S3
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET_NAME=creative-impression-prod

# Payment Gateways
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret
STRIPE_SECRET_KEY=your-stripe-key
PAYPAL_CLIENT_ID=your-paypal-client
PAYPAL_CLIENT_SECRET=your-paypal-secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Frontend URL
FRONTEND_URL=https://yourdomain.com

# Shipping
SHIPROCKET_API_KEY=your-shiprocket-key
SHIPROCKET_EMAIL=your-shiprocket-email
SHIPROCKET_PASSWORD=your-shiprocket-password

# Optional
REDIS_URL=redis://your-redis-url
SENTRY_DSN=your-sentry-dsn
```

**Frontend (.env.production)**
```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_SITE_NAME=Creative Impression
NEXT_PUBLIC_GA_ID=your-google-analytics-id
NEXTAUTH_SECRET=your-super-secret-key
NEXTAUTH_URL=https://yourdomain.com
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

---

## Post-Deployment

### 1. Health Checks
```bash
curl https://api.yourdomain.com/health
# Should return: {"status":"OK","timestamp":"..."}
```

### 2. Database Verification
```bash
# Connect to production database
psql postgresql://user:password@host:5432/creative_impression

# Verify tables
\dt

# Check migrations
SELECT name FROM _prisma_migrations;
```

### 3. SSL/HTTPS Configuration
- Ensure all traffic redirects to HTTPS
- Set HSTS headers
- Configure security headers

### 4. Monitoring Setup

**Sentry Error Tracking**
```bash
npm install @sentry/node
# Configure in backend/src/index.ts
```

**Logging**
- Use structured logging (Winston, Morgan)
- Log to centralized service (CloudWatch, Loggly)

**Uptime Monitoring**
- Setup monitoring with UptimeRobot
- Create alerts for downtime

### 5. Backup Strategy

**Database Backups**
```bash
# Manual backup
pg_dump creative_impression > backup.sql

# Restore from backup
psql creative_impression < backup.sql
```

**Automated Backups**
- Enable automated backups in managed database service
- Set retention policy (30 days recommended)
- Test restore procedures regularly

### 6. Performance Optimization

**Frontend**
- Enable Vercel analytics
- Configure CDN caching
- Optimize images
- Enable gzip compression

**Backend**
- Enable Redis caching
- Optimize database queries
- Use connection pooling
- Enable API rate limiting

### 7. Security Hardening

**CORS Configuration**
```javascript
cors({
  origin: ['https://yourdomain.com', 'https://www.yourdomain.com'],
  credentials: true,
})
```

**Security Headers**
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block

**Database Security**
- Use SSL connections
- Enable SSL verification
- Restrict database access by IP
- Use strong passwords

### 8. Admin Setup

**Create Admin User**
```bash
# Connect to database and run:
INSERT INTO "User" (id, email, password, role, status, "emailVerified")
VALUES ('admin-id', 'admin@creativeimpression.com', 'hashed-password', 'ADMIN', 'ACTIVE', true);
```

### 9. Initial Data

**Product Seeding**
```bash
npx prisma db seed
```

**Categories, Banners, etc.**
- Create through admin dashboard
- Or via seed script

### 10. Testing

**End-to-End Testing**
```bash
npm run test:e2e
```

**Performance Testing**
```bash
npm run test:performance
```

---

## Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL format
- Check network security groups
- Enable SSL mode if required

### CORS Errors
- Verify FRONTEND_URL matches request origin
- Check CORS configuration in backend

### Payment Gateway Issues
- Verify API keys in environment variables
- Test with sandbox credentials first

### Image Upload Issues
- Verify AWS S3 credentials
- Check bucket permissions
- Test CORS configuration in S3

---

## Monitoring Checklist

- [ ] Health checks pass
- [ ] Database backups configured
- [ ] Monitoring alerts set
- [ ] Error tracking active
- [ ] Performance metrics collected
- [ ] Security headers configured
- [ ] SSL certificates valid
- [ ] CDN caching enabled
- [ ] Admin user created
- [ ] Sample data loaded

---

For more help, refer to framework documentation:
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Documentation](https://vercel.com/docs)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
