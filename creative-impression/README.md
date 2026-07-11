# Creative Impression - Premium Fashion & Custom Apparel Platform

A modern, scalable full-stack eCommerce platform for B2B wholesale and B2C retail customers built with Next.js 15, React, Node.js, and PostgreSQL.

## 🎯 Features

### Core E-Commerce Features
- ✅ Product catalog with advanced search and filtering
- ✅ Shopping cart with persistent storage
- ✅ Secure checkout process
- ✅ Multiple payment gateways (Razorpay, Stripe, PayPal, UPI, COD)
- ✅ Order management and tracking
- ✅ Inventory management
- ✅ Return and refund management

### B2B Features
- ✅ Request for Quote (RFQ) system
- ✅ Bulk order management
- ✅ Credit payment options
- ✅ GST invoice generation
- ✅ Wholesale pricing and MOQ support
- ✅ Order negotiation module

### Customization Features
- ✅ Product customization interface
- ✅ Live mockup preview
- ✅ Logo/artwork upload
- ✅ Text editing capabilities
- ✅ Color picker
- ✅ Front/back print selection

### User Experience
- ✅ Responsive design (mobile-first)
- ✅ Dark/light mode
- ✅ Wishlist & comparison
- ✅ Product reviews & ratings
- ✅ Recently viewed products
- ✅ Multi-language support
- ✅ SEO optimized

### Admin Features
- ✅ Comprehensive dashboard with analytics
- ✅ User management
- ✅ Product management
- ✅ Order management
- ✅ Vendor management
- ✅ Coupon & promotion management
- ✅ Banner management
- ✅ Reports and exports

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 15
- **UI Library**: React 19
- **Styling**: Tailwind CSS
- **State Management**: Redux Toolkit
- **HTTP Client**: Axios
- **Animation**: Framer Motion
- **TypeScript**: Full type safety
- **Forms**: React Hook Form + Zod validation
- **Image**: Sharp + Next Image optimization

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT + NextAuth.js
- **Validation**: Express Validator
- **Payment**: Razorpay, Stripe, PayPal SDKs
- **Storage**: AWS S3
- **Email**: Nodemailer

### Infrastructure
- **Deployment**: Vercel (Frontend), Railway/Heroku (Backend)
- **Database Hosting**: Railway/AWS RDS
- **Storage**: AWS S3
- **CDN**: Cloudflare
- **Monitoring**: Sentry

## 📁 Project Structure

```
creative-impression/
├── frontend/                 # Next.js 15 application
│   ├── public/              # Static assets
│   ├── src/
│   │   ├── app/             # Next.js app router
│   │   ├── components/      # React components
│   │   │   ├── common/      # Reusable components
│   │   │   ├── layout/      # Layout components
│   │   │   ├── product/     # Product related
│   │   │   ├── home/        # Homepage sections
│   │   │   ├── cart/        # Cart components
│   │   │   ├── auth/        # Authentication
│   │   │   ├── customization/ # Customization UI
│   │   │   └── b2b/         # B2B features
│   │   ├── lib/             # Utility libraries
│   │   ├── hooks/           # Custom React hooks
│   │   ├── store/           # Redux store
│   │   │   ├── slices/      # Redux slices
│   │   │   └── index.ts     # Store configuration
│   │   ├── types/           # TypeScript types
│   │   ├── utils/           # Helper functions
│   │   └── styles/          # Global styles
│   ├── tailwind.config.js   # Tailwind configuration
│   ├── next.config.js       # Next.js configuration
│   ├── tsconfig.json        # TypeScript config
│   └── package.json         # Dependencies
│
├── backend/                 # Node.js + Express API
│   ├── src/
│   │   ├── index.ts         # Express server entry
│   │   ├── routes/          # API routes
│   │   │   ├── auth.ts      # Authentication routes
│   │   │   ├── products.ts  # Product routes
│   │   │   ├── orders.ts    # Order routes
│   │   │   ├── users.ts     # User routes
│   │   │   ├── cart.ts      # Cart routes
│   │   │   ├── b2b.ts       # B2B routes
│   │   │   ├── payments.ts  # Payment routes
│   │   │   └── admin.ts     # Admin routes
│   │   ├── controllers/     # Route handlers
│   │   ├── services/        # Business logic
│   │   ├── models/          # Database models
│   │   ├── middleware/      # Express middleware
│   │   │   └── auth.ts      # Authentication middleware
│   │   ├── utils/           # Helper functions
│   │   │   └── jwt.ts       # JWT utilities
│   │   └── config/          # Configuration
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   └── migrations/      # Database migrations
│   ├── tsconfig.json        # TypeScript config
│   ├── package.json         # Dependencies
│   └── .env.example         # Environment template
│
├── docs/                    # Documentation
│   ├── API.md              # API documentation
│   ├── DEPLOYMENT.md       # Deployment guide
│   ├── ARCHITECTURE.md     # System architecture
│   └── DATABASE.md         # Database schema
│
└── .env.example            # Environment variables
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm or yarn
- Git

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd creative-impression
```

2. **Setup Frontend**
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your values
npm run dev
# Runs on http://localhost:3000
```

3. **Setup Backend**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your values
npx prisma migrate dev
npm run dev
# Runs on http://localhost:3001
```

4. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Documentation: http://localhost:3001/api-docs (when configured)

## 🔐 Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
NEXTAUTH_SECRET=your-secret
```

### Backend (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/creative_impression
JWT_SECRET=your-jwt-secret
NODE_ENV=development
PORT=3001
```

See [.env.example](.env.example) for complete environment variable reference.

## 📊 Database Schema

Key tables:
- **Users**: User accounts and authentication
- **Products**: Product catalog
- **Orders**: Order management
- **Cart**: Shopping cart
- **B2BProfile**: B2B buyer profiles
- **VendorProfile**: Vendor information
- **RFQ**: Request for Quote system
- **BulkOrder**: Bulk order management
- **Reviews**: Product reviews
- **Coupons**: Promotional coupons

See [docs/DATABASE.md](docs/DATABASE.md) for detailed schema documentation.

## 🔄 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh-token` - Refresh JWT token

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product (Admin/Vendor)
- `PUT /api/products/:id` - Update product
- `GET /api/products/:id/reviews` - Get reviews

### Orders
- `GET /api/orders` - Get user orders
- `GET /api/orders/:id` - Get order details
- `POST /api/orders` - Create order
- `PATCH /api/orders/:id/cancel` - Cancel order

### Cart
- `GET /api/cart` - Get cart
- `POST /api/cart/items` - Add to cart
- `PATCH /api/cart/items/:id` - Update item
- `DELETE /api/cart/items/:id` - Remove from cart

### B2B
- `POST /api/b2b/rfq` - Create RFQ
- `GET /api/b2b/rfq` - Get RFQs
- `POST /api/b2b/bulk-orders` - Create bulk order

### Admin
- `GET /api/admin/dashboard` - Dashboard analytics
- `GET /api/admin/users` - Get all users
- `GET /api/admin/orders` - Get all orders
- `POST /api/admin/products` - Create product
- `POST /api/admin/coupons` - Create coupon

See [docs/API.md](docs/API.md) for comprehensive API documentation.

## 🚢 Deployment

### Frontend Deployment (Vercel)
```bash
cd frontend
npm run build
vercel --prod
```

### Backend Deployment
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions for:
- Railway
- Heroku
- AWS EC2
- DigitalOcean

## 📝 Key Features Implementation

### Authentication
- JWT-based authentication
- Google OAuth integration
- Email verification
- Password reset functionality
- Role-based access control

### Product Management
- Product variants (size, color, etc.)
- Customization options
- Bulk pricing tiers
- Inventory tracking
- Image optimization

### Payment Integration
- Razorpay integration
- Stripe integration
- PayPal integration
- UPI support
- Cash on Delivery option

### B2B Features
- RFQ system
- Bulk ordering
- Credit payment terms
- GST invoice generation
- Dealer registration

## 🎨 UI Components

Pre-built components in `frontend/src/components/`:
- Header with navigation
- Footer
- Product card
- Product grid
- Shopping cart sidebar
- Checkout form
- User profile
- Order list
- Admin dashboard
- And many more...

## 🧪 Testing

### Frontend Testing
```bash
cd frontend
npm run test
npm run test:coverage
```

### Backend Testing
```bash
cd backend
npm run test
npm run test:coverage
```

## 📱 Mobile Responsive

The application is fully responsive with:
- Mobile-first design approach
- Touchscreen optimized navigation
- Optimized images for mobile
- Fast loading on slow networks
- Progressive Web App (PWA) ready

## 🔍 SEO Optimization

- Dynamic meta tags
- Structured schema markup
- Sitemap generation
- Robots.txt configuration
- Blog SEO optimization
- Image alt text
- Fast page load times

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Add tests
4. Submit a pull request

See CONTRIBUTING.md for details.

## 📄 License

This project is proprietary. All rights reserved.

## 📞 Support

For support, email: support@creativeimpression.com

## 🗺️ Roadmap

- [ ] Mobile app (React Native)
- [ ] AI-powered recommendations
- [ ] Advanced analytics dashboard
- [ ] Multi-vendor marketplace
- [ ] Augmented Reality (AR) product preview
- [ ] Video product showcase
- [ ] Live chat support
- [ ] Advanced inventory management
- [ ] Automated email marketing

---

**Made with ❤️ for Creative Impression**
