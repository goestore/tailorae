# Database Architecture - Creative Impression

Complete database schema documentation with relationships and specifications.

## Overview

The database uses PostgreSQL with Prisma ORM. Total tables: 30+

## Entity Relationship Diagram

```
User
├── AuthSession
├── Address
├── Cart → CartItem → Product
├── Wishlist → Product
├── Order → OrderItem → Product
├── Review → Product
├── B2BProfile → RFQ, BulkOrder, CreditTransaction
├── VendorProfile → Product, WithdrawalRequest
└── Notification, AuditLog
```

## Core Tables

### 1. User
Stores user account information and authentication data.

**Fields:**
- `id` (String, PK)
- `email` (String, unique)
- `phone` (String, unique, optional)
- `firstName` (String, optional)
- `lastName` (String, optional)
- `password` (String, hashed, optional for OAuth)
- `profileImage` (String, optional)
- `role` (Enum: ADMIN, VENDOR, B2B_BUYER, RETAIL_CUSTOMER)
- `status` (Enum: ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION)
- `emailVerified` (Boolean)
- `emailVerifiedAt` (DateTime, optional)
- `phoneVerified` (Boolean)
- `phoneVerifiedAt` (DateTime, optional)
- `twoFactorEnabled` (Boolean)
- `twoFactorSecret` (String, optional)
- `lastLogin` (DateTime, optional)
- `loginAttempts` (Int)
- `lockUntil` (DateTime, optional)
- `preferredLanguage` (String)
- `isDarkMode` (Boolean)
- `subscribeToNewsletter` (Boolean)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

**Indexes:**
- email (unique)
- phone (unique)
- role

### 2. Product
Main product catalog table.

**Fields:**
- `id` (String, PK)
- `name` (String)
- `slug` (String, unique)
- `description` (String, optional)
- `shortDescription` (String, optional)
- `status` (Enum: DRAFT, ACTIVE, INACTIVE, DISCONTINUED)
- `vendorId` (String, FK to VendorProfile, optional)
- `categoryId` (String, FK to Category)
- `price` (Float)
- `costPrice` (Float, optional)
- `originalPrice` (Float, optional)
- `discountPercentage` (Float)
- `sku` (String, unique)
- `barcode` (String, optional)
- `quantity` (Int)
- `minOrderQuantity` (Int)
- `maxOrderQuantity` (Int, optional)
- `isFeatured` (Boolean)
- `isCustomizable` (Boolean)
- `allowBulkOrders` (Boolean)
- `weight` (Float, optional)
- `dimensions` (String, optional)
- `material` (String, optional)
- `color` (String, optional)
- `sizeGuide` (String, optional)
- `thumbnail` (String, optional)
- `images` (String[], array)
- `videoUrl` (String, optional)
- `rating` (Float)
- `ratingCount` (Int)
- `reviewCount` (Int)
- `metaTitle` (String, optional)
- `metaDescription` (String, optional)
- `metaKeywords` (String, optional)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

**Indexes:**
- slug (unique)
- sku (unique)
- categoryId
- vendorId
- Full-text search on name, description

**Relationships:**
- One-to-Many with ProductVariant
- One-to-Many with ProductCustomization
- One-to-Many with BulkPricing
- One-to-Many with InventoryTracking
- One-to-Many with OrderItem
- One-to-Many with CartItem
- One-to-Many with Wishlist
- One-to-Many with Review
- Many-to-One with Category
- Many-to-One with VendorProfile

### 3. Order
Order management table.

**Fields:**
- `id` (String, PK)
- `orderNumber` (String, unique)
- `userId` (String, FK)
- `status` (Enum: PENDING, CONFIRMED, PROCESSING, READY_FOR_SHIPMENT, SHIPPED, DELIVERED, CANCELLED, RETURNED)
- `paymentStatus` (Enum: PENDING, PAID, FAILED, REFUNDED, CANCELLED)
- `paymentMethod` (Enum: CREDIT_CARD, DEBIT_CARD, NETBANKING, UPI, WALLET, RAZORPAY, STRIPE, PAYPAL, COD)
- `isBulkOrder` (Boolean)
- `isB2B` (Boolean)
- `shippingAddressId` (String, FK, optional)
- `billingAddressId` (String, FK, optional)
- `subtotal` (Float)
- `discount` (Float)
- `discountCode` (String, optional)
- `tax` (Float)
- `shippingCost` (Float)
- `total` (Float)
- `gstAmount` (Float)
- `gstNumber` (String, optional)
- `trackingNumber` (String, optional)
- `carrier` (String, optional)
- `estimatedDelivery` (DateTime, optional)
- `actualDelivery` (DateTime, optional)
- `notes` (String, optional)
- `adminNotes` (String, optional)
- `paymentId` (String, optional)
- `receiptUrl` (String, optional)
- `invoiceUrl` (String, optional)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

**Indexes:**
- userId
- orderNumber (unique)
- status
- paymentStatus

**Relationships:**
- Many-to-One with User
- One-to-Many with OrderItem
- One-to-One with ReturnRequest
- One-to-Many with OrderTimeline

### 4. Cart & CartItem

**Cart Fields:**
- `id` (String, PK)
- `userId` (String, unique, FK)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

**CartItem Fields:**
- `id` (String, PK)
- `cartId` (String, FK)
- `productId` (String, FK)
- `variantId` (String, FK, optional)
- `quantity` (Int)
- `price` (Float)
- `customization` (Json, optional)
- `mockupImage` (String, optional)
- `isBulkOrder` (Boolean)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

**Indexes:**
- cartId
- productId

### 5. B2B Features

#### B2BProfile
**Fields:**
- `id` (String, PK)
- `userId` (String, unique, FK)
- `companyName` (String)
- `companyRegistration` (String, optional)
- `gstNumber` (String, unique, optional)
- `panNumber` (String, unique, optional)
- `businessType` (String)
- `businessCategory` (String, optional)
- `monthlyBudget` (Float, optional)
- `employeeCount` (Int, optional)
- `businessDescription` (String, optional)
- `website` (String, optional)
- `dealerRegistration` (Boolean)
- `creditLimit` (Float)
- `creditUsed` (Float)
- `minOrderQuantity` (Int)
- `discountTier` (String)
- `isVerified` (Boolean)
- `verificationDocuments` (String[])
- `referralCode` (String, unique, optional)
- `referralCount` (Int)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

#### RFQ (Request for Quote)
**Fields:**
- `id` (String, PK)
- `rfqNumber` (String, unique)
- `b2bProfileId` (String, FK)
- `productId` (String)
- `quantity` (Int)
- `desiredPrice` (Float, optional)
- `deliveryDate` (DateTime, optional)
- `specialRequirements` (String, optional)
- `status` (String: PENDING, QUOTED, ACCEPTED, REJECTED, EXPIRED)
- `quotedPrice` (Float, optional)
- `quotedDate` (DateTime, optional)
- `quotedBy` (String, optional)
- `notes` (String, optional)
- `documents` (String[])
- `expiryDate` (DateTime, optional)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

#### BulkOrder
**Fields:**
- `id` (String, PK)
- `orderNumber` (String, unique)
- `b2bProfileId` (String, FK)
- `productId` (String)
- `quantity` (Int)
- `unitPrice` (Float)
- `totalPrice` (Float)
- `status` (String)
- `expectedDelivery` (DateTime, optional)
- `specialRequirements` (String, optional)
- `paymentTerms` (String, optional)
- `customInvoice` (String, optional)
- `purchaseOrder` (String, optional)
- `documents` (String[])
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### 6. Inventory Management

#### InventoryTracking
**Fields:**
- `id` (String, PK)
- `productId` (String, FK)
- `quantity` (Int)
- `type` (String: stock_in, stock_out, adjustment, return)
- `reference` (String, optional)
- `notes` (String, optional)
- `createdAt` (DateTime)

**Indexes:**
- productId
- type

#### BulkPricing
**Fields:**
- `id` (String, PK)
- `productId` (String, FK)
- `minQty` (Int)
- `maxQty` (Int, optional)
- `discount` (Float)
- `price` (Float)
- `createdAt` (DateTime)

### 7. Reviews & Ratings

**Fields:**
- `id` (String, PK)
- `userId` (String, FK)
- `productId` (String, FK)
- `orderId` (String, optional)
- `rating` (Int, 1-5)
- `title` (String, optional)
- `comment` (String, optional)
- `images` (String[])
- `isVerified` (Boolean)
- `helpful` (Int)
- `notHelpful` (Int)
- `isPublished` (Boolean)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

**Unique Constraint:**
- (productId, userId)

### 8. Wishlist

**Fields:**
- `id` (String, PK)
- `userId` (String, FK)
- `productId` (String, FK)
- `createdAt` (DateTime)

**Unique Constraint:**
- (userId, productId)

### 9. Promotions

#### Coupon
**Fields:**
- `id` (String, PK)
- `code` (String, unique)
- `description` (String, optional)
- `discountType` (String: PERCENTAGE, FIXED_AMOUNT)
- `discountValue` (Float)
- `minOrderAmount` (Float)
- `maxDiscount` (Float, optional)
- `usageLimit` (Int, optional)
- `usageCount` (Int)
- `perUserLimit` (Int)
- `startDate` (DateTime)
- `endDate` (DateTime)
- `isActive` (Boolean)
- `applicableCategories` (String[])
- `applicableProducts` (String[])
- `requireB2B` (Boolean)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

**Indexes:**
- code (unique)

#### Banner
**Fields:**
- `id` (String, PK)
- `title` (String)
- `subtitle` (String, optional)
- `image` (String)
- `imageAlt` (String, optional)
- `link` (String, optional)
- `position` (String)
- `type` (String: HERO, CATEGORY, PROMOTIONAL)
- `displayOrder` (Int)
- `startDate` (DateTime, optional)
- `endDate` (DateTime, optional)
- `isActive` (Boolean)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

## Data Types Reference

### Enums
- **UserRole**: ADMIN, VENDOR, B2B_BUYER, RETAIL_CUSTOMER
- **UserStatus**: ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION
- **ProductStatus**: DRAFT, ACTIVE, INACTIVE, DISCONTINUED
- **OrderStatus**: PENDING, CONFIRMED, PROCESSING, READY_FOR_SHIPMENT, SHIPPED, DELIVERED, CANCELLED, RETURNED
- **PaymentStatus**: PENDING, PAID, FAILED, REFUNDED, CANCELLED
- **PaymentMethod**: CREDIT_CARD, DEBIT_CARD, NETBANKING, UPI, WALLET, RAZORPAY, STRIPE, PAYPAL, COD

### Special Data Types
- **Json**: Custom serialized data (customization options, etc.)
- **String[]**: Array of strings (images, tags, documents)

## Indexes Strategy

### Performance Indexes
1. **Foreign Keys**: Automatically indexed
2. **Search**: Full-text index on Product (name, description)
3. **Filtering**: Indexes on status, role, categoryId
4. **Pagination**: Composite index on (createdAt, id)

### Query Optimization
- Use prepared statements
- Connection pooling (Prisma manages this)
- Query result caching (Redis layer)

## Constraints

### Unique Constraints
- User.email
- User.phone
- Product.slug
- Product.sku
- Order.orderNumber
- Coupon.code
- B2BProfile.gstNumber
- B2BProfile.panNumber
- B2BProfile.referralCode
- VendorProfile.shopSlug
- (ProductComparison.userId, ProductComparison.productId)
- (Review.productId, Review.userId)

### Foreign Key Constraints
- On Delete: CASCADE for Cart, CartItem, Order, OrderItem
- On Delete: SET NULL for Product.vendorId, Category.parentId

## Backup & Recovery

### Backup Strategy
```sql
-- Full backup
pg_dump creative_impression > full_backup.sql

-- Differential backup
pg_dump --data-only creative_impression > data_backup.sql
```

### Recovery Procedure
```sql
-- Restore from backup
psql creative_impression < full_backup.sql

-- Point-in-time recovery
pg_restore -d creative_impression < backup.sql
```

## Performance Metrics

### Expected Scale
- 100K+ users
- 10K+ products
- 1M+ orders
- 10M+ order items
- Sub-second query response

### Optimization Tips
1. Regular VACUUM and ANALYZE
2. Index maintenance
3. Query optimization
4. Connection pooling
5. Read replicas for reporting

## Migration Management

### Using Prisma
```bash
# Create migration
npx prisma migrate dev --name add_new_field

# Deploy migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

## Disaster Recovery

### RTO: 4 hours
### RPO: 1 hour

**Backup Schedule:**
- Hourly incremental backups
- Daily full backups
- Weekly offsite backups
- Monthly archive

**Monitoring:**
- Backup completion checks
- Replication lag monitoring
- Data integrity validation

---

For schema modifications, ensure:
1. Create migration
2. Test in development
3. Backup production database
4. Deploy migration
5. Monitor performance
