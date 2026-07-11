# Creative Impression - Frontend Structure Guide

## 🎯 Page Organization with Meaningful Names

### 1️⃣ **Navigation & Layout**
- **NavigationBar** - Main header with logo, menu, search, cart, user profile
- **AnnouncementBar** - Top promotional banner
- **Footer** - Company information, links, newsletter signup
- **Sidebar** - Collapsible menu for mobile

---

### 2️⃣ **Home Page** (`/`)
- **HeroBanner** - Large hero section with call-to-action
- **CategoryShowcase** - Product categories (Business Cards, T-Shirts, Posters, etc.)
- **FeaturedProducts** - Highlighted products section
- **NewsletterSignup** - Email subscription section

---

### 3️⃣ **Products** (`/products`)

#### Products Catalog Page (`/products`)
- **ProductGrid** - Display products in grid layout
- **ProductCard** - Individual product with image, price, rating
- **ProductFilters** - Filter by category, price range, rating

#### Product Detail Page (`/products/[id]`)
- Large product image
- Product specs and customization options
- Price and inventory status
- Add to cart / Wishlist buttons

---

### 4️⃣ **Shopping Cart** (`/cart`)
- **CartSummary** - Order total, tax, shipping
- Cart item list with quantity controls
- Proceed to checkout button
- Continue shopping option

---

### 5️⃣ **Checkout** (`/checkout`)
- **CheckoutSteps** - Visual step indicator (Shipping → Payment → Review)
- **Step 1: Shipping** - Address form
- **Step 2: Payment** - Payment method selection
- **Step 3: Review** - Order confirmation before placing

---

### 6️⃣ **Custom Printing** (`/customization`)
- **CustomizationPreview** - Live product preview
- Design upload area
- Size, color, quantity options
- Add to cart button

---

### 7️⃣ **B2B Bulk Orders** (`/b2b`)
- **QuantityDiscounts** - Pricing tiers by quantity
- Bulk order form
- Volume-based discounts display
- Request for quote option

---

### 8️⃣ **Authentication**

#### Login (`/auth/login`)
- Email/password fields
- Sign up link
- Forgot password link

#### Register (`/auth/register`)
- Full name, email, phone, password fields
- Terms acceptance
- Sign in link

#### Forgot Password (`/auth/forgot-password`)
- Email verification
- Password reset form

---

### 9️⃣ **User Dashboard** (`/dashboard`)
- **DashboardMenu** - Sidebar navigation
- **OrderHistory** - Past orders with status

#### Dashboard Sections:
- **Overview** - Total orders, total spent, loyalty points
- **Orders** - Order history with status tracking
- **Profile** - Personal information editing
- **Addresses** - Saved shipping addresses
- **Designs** - Saved custom designs
- **Settings** - Account preferences, notifications

---

### 🔟 **Information Pages** (`/info`)

#### About (`/info/about`)
- Company story
- Mission statement
- Why choose us benefits

#### Contact (`/info/contact`)
- Contact form
- Business address
- Phone/email
- Business hours

#### FAQ (`/info/faq`)
- Frequently asked questions
- Searchable Q&A

---

## 📁 Complete Directory Structure

```
frontend/src/
│
├── app/
│   ├── layout.tsx                 (Main layout with NavigationBar & Footer)
│   ├── page.tsx                   (Home page)
│   ├── home-page.tsx              (Alternative home)
│   │
│   ├── products/
│   │   ├── page.tsx               📍 Products Catalog
│   │   └── [id]/
│   │       └── page.tsx           📍 Product Detail
│   │
│   ├── customization/
│   │   └── page.tsx               📍 Custom Printing Design
│   │
│   ├── b2b/
│   │   └── page.tsx               📍 B2B Bulk Orders
│   │
│   ├── cart/
│   │   └── page.tsx               📍 Shopping Cart
│   │
│   ├── checkout/
│   │   ├── page.tsx               📍 Checkout Process
│   │   ├── shipping/page.tsx      📍 Shipping Info
│   │   ├── payment/page.tsx       📍 Payment Method
│   │   └── confirmation/page.tsx  📍 Order Confirmation
│   │
│   ├── auth/
│   │   ├── login/page.tsx         📍 Login
│   │   ├── register/page.tsx      📍 Registration
│   │   └── forgot-password/page.tsx 📍 Password Reset
│   │
│   ├── dashboard/
│   │   ├── page.tsx               📍 Dashboard Overview
│   │   ├── profile/page.tsx       📍 User Profile
│   │   ├── orders/page.tsx        📍 Order History
│   │   └── settings/page.tsx      📍 Account Settings
│   │
│   └── info/
│       ├── about/page.tsx         📍 About Us
│       ├── contact/page.tsx       📍 Contact Us
│       └── faq/page.tsx           📍 FAQ
│
└── components/
    ├── layout/
    │   ├── NavigationBar.tsx       🎛️  Main Navigation
    │   ├── AnnouncementBar.tsx     📢 Announcement Banner
    │   ├── Footer.tsx              👣 Footer
    │   ├── Sidebar.tsx             📊 Sidebar
    │   └── index.ts
    │
    ├── home/
    │   ├── HeroBanner.tsx          🎬 Hero Section
    │   ├── CategoryShowcase.tsx    🏷️  Categories Grid
    │   ├── FeaturedProducts.tsx    ⭐ Featured Items
    │   ├── NewsletterSignup.tsx    📧 Newsletter
    │   └── index.ts
    │
    ├── product/
    │   ├── ProductCard.tsx         🛍️  Product Card
    │   ├── ProductGrid.tsx         📋 Products Grid
    │   ├── ProductFilters.tsx      🔍 Filters Sidebar
    │   └── index.ts
    │
    ├── cart/
    │   ├── CartSummary.tsx         💳 Cart Summary
    │   └── index.ts
    │
    ├── checkout/
    │   ├── CheckoutSteps.tsx       ✅ Step Indicator
    │   └── index.ts
    │
    ├── auth/
    │   ├── AuthForm.tsx            🔐 Auth Form
    │   └── index.ts
    │
    ├── b2b/
    │   ├── QuantityDiscounts.tsx   📊 Pricing Tiers
    │   └── index.ts
    │
    ├── customization/
    │   ├── CustomizationPreview.tsx 🎨 Design Preview
    │   └── index.ts
    │
    ├── dashboard/
    │   ├── DashboardMenu.tsx       📑 Menu Navigation
    │   ├── OrderHistory.tsx        📦 Orders List
    │   └── index.ts
    │
    └── common/
        ├── Button.tsx             (Existing)
        ├── Card.tsx               (Existing)
        ├── Input.tsx              (Existing)
        └── ... (other shared components)
```

---

## 🎨 Naming Convention Reference

### By Page/Feature
| Feature | Component Naming | Page Route |
|---------|-----------------|-----------|
| Navigation | NavigationBar, AnnouncementBar | (Shared) |
| Home | HeroBanner, FeaturedProducts, CategoryShowcase, NewsletterSignup | `/` |
| Products | ProductCard, ProductGrid, ProductFilters | `/products`, `/products/[id]` |
| Custom Printing | CustomizationPreview, DesignEditor | `/customization` |
| B2B | QuantityDiscounts, BulkOrderForm | `/b2b` |
| Cart | CartSummary, CartItems | `/cart` |
| Checkout | CheckoutSteps, ShippingForm, PaymentForm | `/checkout/*` |
| Auth | AuthForm, LoginForm, RegisterForm | `/auth/*` |
| Dashboard | DashboardMenu, OrderHistory | `/dashboard/*` |
| Info | (Pages only) | `/info/*` |

---

## 🚀 Quick Reference

### To use NavigationBar in layout:
```tsx
import { NavigationBar, AnnouncementBar, Footer } from '@/components/layout';
```

### To use ProductGrid in products page:
```tsx
import { ProductGrid, ProductFilters } from '@/components/product';
```

### To use Dashboard components:
```tsx
import { DashboardMenu, OrderHistory } from '@/components/dashboard';
```

---

## ✨ Key Features by Page

| Page | Key Components | Features |
|------|---------------|----------|
| Home | HeroBanner, CategoryShowcase, FeaturedProducts | Visual appeal, category browsing, featured items |
| Products | ProductGrid, ProductCard, ProductFilters | Browse, filter by category/price/rating |
| Cart | CartSummary, Item list | Review items, modify quantities, proceed |
| Checkout | CheckoutSteps, Forms | Multi-step checkout, address, payment |
| Dashboard | DashboardMenu, OrderHistory | User profile, order tracking, settings |
| B2B | QuantityDiscounts, BulkForm | Volume pricing, bulk order requests |

---

## 📝 Notes for Development

1. **All components are templated** - Replace mock data with real API calls
2. **Responsive design** - All components support mobile, tablet, desktop
3. **Consistent styling** - Uses Tailwind CSS throughout
4. **Redux ready** - Can be integrated with store for state management
5. **Type-safe** - All components have proper TypeScript interfaces

