# Frontend Structure Reorganization Plan

## Component Organization

### Layout Components (`src/components/layout/`)
- **NavigationBar.tsx** (renamed from Header.tsx) - Top navigation with logo, menu, search
- **AnnouncementBar.tsx** - Top promotional/announcement banner
- **Navbar.tsx** - Main navigation menu
- **Sidebar.tsx** - Collapsible sidebar (keep as is)
- **Footer.tsx** - Footer with links and info (keep as is)
- **LayoutWrapper.tsx** - Main layout container

### Common/Reusable Components (`src/components/common/`)
- Alert.tsx
- Badge.tsx
- Button.tsx
- Card.tsx
- Input.tsx
- Loading.tsx
- Modal.tsx
- **Breadcrumb.tsx** - Navigation breadcrumb
- **Pagination.tsx** - Page navigation
- **Rating.tsx** - Product rating display

### Home Page Components (`src/components/home/`)
- **HeroBanner.tsx** - Large hero section
- **FeaturedProducts.tsx** - Featured product carousel
- **PromoSection.tsx** - Promotional section
- **CategoryShowcase.tsx** - Category grid/display
- **TestimonialsSection.tsx** - Customer testimonials
- **NewsletterSignup.tsx** - Newsletter subscription

### Product Components (`src/components/product/`)
- **ProductGrid.tsx** - Product list display
- **ProductCard.tsx** - Individual product card
- **ProductFilters.tsx** - Filter sidebar (category, price, etc.)
- **ProductSearch.tsx** - Product search functionality
- **ProductDetails.tsx** - Product detail view

### Cart Components (`src/components/cart/`)
- **CartSummary.tsx** - Cart summary display
- **CartItems.tsx** - Cart items list
- **CartActions.tsx** - Cart action buttons
- **MiniCart.tsx** - Dropdown cart preview

### Checkout Components (`src/components/checkout/`)
- **CheckoutSteps.tsx** - Step indicator (address → payment → review)
- **ShippingForm.tsx** - Shipping information form
- **PaymentForm.tsx** - Payment method selection
- **OrderReview.tsx** - Order review before purchase
- **OrderConfirmation.tsx** - Success page

### Authentication Components (`src/components/auth/`)
- **LoginForm.tsx** - User login form
- **RegisterForm.tsx** - User registration form
- **PasswordReset.tsx** - Password reset form
- **OTPVerification.tsx** - OTP verification form

### B2B Components (`src/components/b2b/`)
- **BulkOrderForm.tsx** - Bulk order submission
- **PricingCalculator.tsx** - Price calculation for bulk orders
- **QuantityDiscounts.tsx** - Discount tier display

### Customization Components (`src/components/customization/`)
- **DesignEditor.tsx** - Design/customization editor
- **CustomizationPreview.tsx** - Product preview
- **UploadDesign.tsx** - Design file upload
- **CustomizationOptions.tsx** - Customization options selector

### User Dashboard Components (`src/components/dashboard/`)
- **ProfileSection.tsx** - User profile information
- **OrderHistory.tsx** - Past orders display
- **AddressList.tsx** - Saved addresses
- **SavedDesigns.tsx** - Saved custom designs
- **AccountSettings.tsx** - Account preferences

---

## Page Routes (App Directory)

```
src/app/
├── layout.tsx (main layout with NavigationBar, Footer)
├── page.tsx (home page)
├── 
├── products/
│   ├── page.tsx (products catalog)
│   ├── [id]/
│   │   └── page.tsx (product detail)
│   └── [category]/
│       └── page.tsx (category page)
│
├── customization/
│   └── page.tsx (custom printing/design)
│
├── b2b/
│   ├── page.tsx (B2B landing)
│   └── bulk-order/
│       └── page.tsx (bulk order form)
│
├── cart/
│   └── page.tsx (shopping cart)
│
├── checkout/
│   ├── page.tsx (checkout process)
│   ├── shipping/
│   │   └── page.tsx
│   ├── payment/
│   │   └── page.tsx
│   └── confirmation/
│       └── page.tsx
│
├── auth/
│   ├── login/
│   │   └── page.tsx
│   ├── register/
│   │   └── page.tsx
│   └── forgot-password/
│       └── page.tsx
│
├── dashboard/
│   ├── page.tsx (dashboard home)
│   ├── profile/
│   │   └── page.tsx
│   ├── orders/
│   │   └── page.tsx
│   └── settings/
│       └── page.tsx
│
└── info/
    ├── about/
    │   └── page.tsx
    ├── contact/
    │   └── page.tsx
    └── faq/
        └── page.tsx
```

---

## Naming Conventions

1. **Components**: PascalCase with descriptive names (NavigationBar, HeroBanner)
2. **Pages**: kebab-case folder names (products, checkout, bulk-order)
3. **Utilities**: camelCase (formatCurrency, parseDate)
4. **Stores/Redux**: camelCase slices (authSlice, productSlice)

