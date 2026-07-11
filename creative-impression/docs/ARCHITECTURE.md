# System Architecture - Creative Impression

Comprehensive technical architecture documentation for the Creative Impression platform.

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       Client Layer (Browser)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Next.js 15 Frontend Application                   │   │
│  │  ├─ React Components                                     │   │
│  │  ├─ Redux Store (Auth, Cart, Product, UI)              │   │
│  │  ├─ Custom Hooks                                        │   │
│  │  └─ Tailwind CSS Styling                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────┬────────────────────────────────────────┬───────────┘
             │                                        │
        (HTTP/REST)                            (WebSocket)
             │                                        │
┌────────────▼────────────────────────────────────────▼───────────┐
│                    Presentation Layer                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  HTTP Request Router & Middleware Stack                  │   │
│  │  ├─ CORS                                                │   │
│  │  ├─ Authentication                                      │   │
│  │  ├─ Rate Limiting                                       │   │
│  │  └─ Error Handling                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────┬─────────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────────┐
│                    Application Layer                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Express.js Routes & Controllers                         │   │
│  │  ├─ /api/auth                                           │   │
│  │  ├─ /api/products                                       │   │
│  │  ├─ /api/orders                                         │   │
│  │  ├─ /api/cart                                           │   │
│  │  ├─ /api/b2b                                            │   │
│  │  ├─ /api/payments                                       │   │
│  │  └─ /api/admin                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────┬─────────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────────┐
│                    Service Layer                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Business Logic & Orchestration                          │   │
│  │  ├─ Authentication Service                              │   │
│  │  ├─ Product Service                                     │   │
│  │  ├─ Order Service                                       │   │
│  │  ├─ Payment Service                                     │   │
│  │  ├─ B2B Service                                         │   │
│  │  └─ Email Service                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────┬─────────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────────┐
│                    Data Access Layer                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Prisma ORM                                              │   │
│  │  ├─ Query Builder                                       │   │
│  │  ├─ Connection Pooling                                  │   │
│  │  └─ Migration Management                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────┬─────────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────────┐
│                    Data Layer                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL Database                                     │   │
│  │  ├─ Users                                               │   │
│  │  ├─ Products                                            │   │
│  │  ├─ Orders                                              │   │
│  │  ├─ Cart & Wishlist                                     │   │
│  │  ├─ B2B Profiles & RFQ                                 │   │
│  │  └─ Transactions                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    External Integrations                         │
│  ├─ Payment Gateways (Razorpay, Stripe, PayPal)                 │
│  ├─ Storage (AWS S3)                                            │
│  ├─ Email Service (SMTP, SendGrid)                              │
│  ├─ Shipping APIs (Shiprocket, Delhivery)                       │
│  ├─ SMS Service (Twilio)                                        │
│  └─ Analytics (Google Analytics, Sentry)                        │
└──────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture (Next.js 15)

### Directory Structure
```
src/
├── app/                      # Next.js 15 App Router
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Homepage
│   ├── (auth)/               # Auth routes
│   ├── (products)/           # Product routes
│   ├── (checkout)/           # Checkout flow
│   ├── (admin)/              # Admin panel
│   └── api/                  # API routes (optional)
├── components/               # Reusable React components
│   ├── common/              # Navbar, Footer, etc.
│   ├── layout/              # Layout components
│   ├── product/             # Product-specific
│   ├── cart/                # Cart components
│   ├── auth/                # Authentication
│   ├── customization/       # Customization UI
│   └── b2b/                 # B2B features
├── lib/                      # Utility libraries
│   └── api-client.ts        # Axios config
├── hooks/                    # Custom React hooks
├── store/                    # Redux store
│   ├── slices/              # Redux slices
│   └── index.ts             # Store config
├── types/                    # TypeScript types
├── utils/                    # Helper functions
└── styles/                   # Global CSS/Tailwind
```

### State Management (Redux Toolkit)

**Store Structure:**
```
{
  auth: {
    user: User | null,
    token: string | null,
    isAuthenticated: boolean,
    isLoading: boolean,
    error: string | null
  },
  cart: {
    items: CartItem[],
    total: number,
    count: number,
    isLoading: boolean
  },
  product: {
    products: Product[],
    filteredProducts: Product[],
    selectedProduct: Product | null,
    filters: ProductFilters,
    isLoading: boolean
  },
  ui: {
    isDarkMode: boolean,
    sidebarOpen: boolean,
    cartOpen: boolean,
    // ... other UI states
  }
}
```

### Component Hierarchy
```
App
├── Header
│   ├── Logo
│   ├── Search
│   ├── Cart Icon
│   └── User Menu
├── Main Content
│   ├── Hero Banner
│   ├── Product Grid
│   ├── Filters
│   └── Pagination
├── Sidebar
│   ├── Navigation
│   └── Filters
└── Footer
    ├── Links
    ├── Newsletter
    └── Social Media
```

## Backend Architecture (Node.js + Express)

### Request Flow
```
Request → CORS → Rate Limit → Auth Middleware → Route Handler → Service → Database
Response ← Error Handler ← Service ← Database
```

### Route Organization
```
routes/
├── auth.ts           # Authentication routes
├── products.ts       # Product catalog
├── orders.ts         # Order management
├── users.ts          # User profiles
├── cart.ts           # Shopping cart
├── b2b.ts            # B2B features
├── payments.ts       # Payment processing
└── admin.ts          # Admin operations
```

### Service Layer Pattern
```
Controller
    ↓
Service
├─ Business Logic
├─ Validation
├─ Error Handling
└─ Data Transformation
    ↓
Repository (Prisma)
├─ Database Queries
├─ Aggregations
└─ Transactions
    ↓
Database
```

### Authentication Flow
```
1. User submits credentials
2. Server validates input
3. Check user exists
4. Compare password hash
5. Generate JWT token
6. Return user + token
7. Client stores token
8. Token sent with requests
9. Middleware verifies token
10. Continue to handler
```

### Payment Processing Flow
```
Order Placed
    ↓
Validate Order
    ↓
Create Payment Order (Gateway)
    ↓
Redirect to Gateway
    ↓
User Completes Payment
    ↓
Payment Callback
    ↓
Verify Signature
    ↓
Update Order Status
    ↓
Send Confirmation Email
    ↓
Return to App
```

## Database Architecture

### Connection Pooling
- **Min Connections**: 5
- **Max Connections**: 20
- **Idle Timeout**: 30s

### Query Optimization
- **Connection Pooling**: Managed by Prisma
- **Query Caching**: Redis layer
- **Indexes**: On frequently queried fields
- **Batch Queries**: Minimize round trips

### Backup Strategy
```
Real-time Replication (Primary ↔ Secondary)
        ↓
Hourly Incremental Backups
        ↓
Daily Full Backups
        ↓
Weekly Offsite Backups
        ↓
Monthly Archive
```

## API Design Principles

### RESTful Conventions
```
GET    /api/products              # List
GET    /api/products/:id          # Single
POST   /api/products              # Create
PUT    /api/products/:id          # Update
DELETE /api/products/:id          # Delete
```

### Request/Response Format
```json
{
  "success": true,
  "data": {...},
  "message": "Success message",
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

### Error Handling
```
400 - Bad Request (validation error)
401 - Unauthorized (missing auth)
403 - Forbidden (insufficient permissions)
404 - Not Found (resource doesn't exist)
409 - Conflict (duplicate data)
429 - Too Many Requests (rate limited)
500 - Server Error
```

## Caching Strategy

### Frontend Caching
- **React Query**: API response caching
- **LocalStorage**: User preferences
- **SessionStorage**: Temporary data

### Backend Caching
- **Redis**: 
  - Session storage
  - Product catalog (1 hour TTL)
  - User data (30 min TTL)
  - Frequently accessed queries

### CDN Caching
- **Static Assets**: Cloudflare CDN
- **Images**: Compressed & optimized
- **Cache Headers**: Aggressive for immutable assets

## Security Architecture

### Authentication & Authorization
```
User Login
    ↓
Validate Credentials
    ↓
Generate JWT Token
    ↓
Return Token
    ↓
Store Token (Client)
    ↓
Send Token with Requests
    ↓
Verify Token (Server)
    ↓
Check Role & Permissions
    ↓
Grant Access
```

### Data Protection
- **Passwords**: bcrypt hashing (12 rounds)
- **Sensitive Data**: Encrypted in transit (HTTPS)
- **API Keys**: Environment variables
- **Database**: SSL connections
- **CORS**: Whitelist origins
- **Rate Limiting**: 100 req/15min

### Session Management
- **JWT Expiry**: 7 days
- **Refresh Tokens**: 30 days
- **HTTPS Only**: Secure cookies
- **CSRF Protection**: Token validation

## Deployment Architecture

### Frontend (Vercel)
```
GitHub Push
    ↓
GitHub Actions
    ↓
Build (Next.js)
    ↓
Deploy (Vercel)
    ↓
CDN Distribution
    ↓
Global Availability
```

### Backend (Container-based)
```
GitHub Push
    ↓
CI/CD Pipeline
    ↓
Build Image
    ↓
Push to Registry
    ↓
Deploy Container
    ↓
Health Checks
    ↓
Load Balancer
    ↓
Active Service
```

### Infrastructure
```
Application Layer
├─ Web Servers (Multiple instances)
├─ Load Balancer
└─ Auto-scaling Group

Database Layer
├─ Primary (Read/Write)
├─ Replica (Read-only)
└─ Backup

Storage Layer
└─ AWS S3 (Images, Documents)
```

## Monitoring & Logging

### Application Monitoring
- **APM**: Sentry (error tracking)
- **Metrics**: CloudWatch
- **Logs**: ELK Stack or CloudWatch Logs
- **Uptime**: UptimeRobot

### Performance Monitoring
- **Frontend**: Vercel Analytics
- **Backend**: New Relic or DataDog
- **Database**: Slow query logs
- **API Response**: Average < 200ms

### Alerting
- **Error Rate**: Alert if > 1%
- **CPU**: Alert if > 80%
- **Memory**: Alert if > 85%
- **Database**: Alert if > 50ms query
- **Disk**: Alert if > 90%

## Scalability Considerations

### Horizontal Scaling
- Multiple app server instances
- Load balancing
- Database replication
- Cache distribution

### Vertical Scaling
- Increase server resources
- Larger database instances
- More cache memory

### Database Optimization
- Read replicas
- Connection pooling
- Query optimization
- Indexing strategy

### Caching Strategy
- Redis for frequently accessed data
- CDN for static assets
- Browser caching for client

## Disaster Recovery

### Recovery Time Objective (RTO)
- **Critical**: 4 hours
- **High Priority**: 8 hours
- **Medium**: 24 hours

### Recovery Point Objective (RPO)
- **Database**: 1 hour
- **Files**: 24 hours
- **Application**: 15 minutes

### Backup Redundancy
- Primary datacenter
- Secondary datacenter
- Offsite archive
- Quarterly restore tests

---

This architecture supports:
- 100K+ concurrent users
- 1M+ transactions/day
- Sub-second response times
- 99.9% uptime SLA
