# API Documentation - Creative Impression

Comprehensive API reference for Creative Impression platform.

## Base URL
```
https://api.creativeimpression.com/api
```

## Authentication

All protected endpoints require JWT token in Authorization header:

```
Authorization: Bearer <jwt-token>
```

## Response Format

All responses follow this format:

```json
{
  "success": true/false,
  "data": {...},
  "message": "Success or error message",
  "error": "Error details (development only)"
}
```

---

## Authentication Endpoints

### Register User
```
POST /auth/register
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "RETAIL_CUSTOMER"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {...},
    "token": "jwt-token",
    "refreshToken": "refresh-token"
  }
}
```

### Login
```
POST /auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {...},
    "token": "jwt-token"
  }
}
```

### Logout
```
POST /auth/logout
Authorization: Bearer <token>
```

### Refresh Token
```
POST /auth/refresh-token
Authorization: Bearer <token>
```

### Forgot Password
```
POST /auth/forgot-password
```

**Request:**
```json
{
  "email": "user@example.com"
}
```

### Reset Password
```
POST /auth/reset-password
```

**Request:**
```json
{
  "token": "reset-token",
  "password": "NewPassword123!"
}
```

---

## Products Endpoints

### Get Products
```
GET /products?page=1&limit=20&search=&sortBy=newest&minPrice=0&maxPrice=10000
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `search` (string): Search query
- `categoryId` (string): Filter by category
- `minPrice` (number): Minimum price
- `maxPrice` (number): Maximum price
- `sortBy` (string): newest, price-asc, price-desc, rating, trending
- `inStock` (boolean): In stock only
- `isCustomizable` (boolean): Customizable only

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [...],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 20,
      "pages": 5
    }
  }
}
```

### Get Product Details
```
GET /products/:productId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "product-id",
    "name": "Product Name",
    "description": "...",
    "price": 999,
    "rating": 4.5,
    "variants": [...],
    "customizations": [...],
    "reviews": [...]
  }
}
```

### Create Product
```
POST /products
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

**Request (Form Data):**
- `name`: Product name
- `description`: Product description
- `price`: Product price
- `categoryId`: Category ID
- `sku`: SKU
- `quantity`: Stock quantity
- `images`: Product images
- `variants`: JSON string of variants
- `customizations`: JSON string of customizations

### Update Product
```
PUT /products/:productId
Authorization: Bearer <vendor-token>
```

### Delete Product
```
DELETE /products/:productId
Authorization: Bearer <admin-token>
```

### Get Reviews
```
GET /products/:productId/reviews?page=1&limit=10
```

### Add Review
```
POST /products/:productId/reviews
Authorization: Bearer <token>
```

**Request:**
```json
{
  "rating": 5,
  "title": "Great product!",
  "comment": "Amazing quality...",
  "images": ["image-urls"]
}
```

---

## Shopping Cart Endpoints

### Get Cart
```
GET /cart
Authorization: Bearer <token>
```

### Add to Cart
```
POST /cart/items
Authorization: Bearer <token>
```

**Request:**
```json
{
  "productId": "product-id",
  "variantId": "variant-id",
  "quantity": 2,
  "customization": {
    "printLocation": "FRONT",
    "text": "Custom Text"
  }
}
```

### Update Cart Item
```
PATCH /cart/items/:itemId
Authorization: Bearer <token>
```

**Request:**
```json
{
  "quantity": 3
}
```

### Remove from Cart
```
DELETE /cart/items/:itemId
Authorization: Bearer <token>
```

### Clear Cart
```
DELETE /cart
Authorization: Bearer <token>
```

---

## Orders Endpoints

### Get Orders
```
GET /orders?page=1&limit=10&status=PENDING
Authorization: Bearer <token>
```

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `status`: Order status filter

### Get Order Details
```
GET /orders/:orderId
Authorization: Bearer <token>
```

### Create Order
```
POST /orders
Authorization: Bearer <token>
```

**Request:**
```json
{
  "items": [
    {
      "productId": "product-id",
      "variantId": "variant-id",
      "quantity": 2,
      "customization": {}
    }
  ],
  "shippingAddressId": "address-id",
  "billingAddressId": "address-id",
  "couponCode": "SAVE10",
  "paymentMethod": "RAZORPAY",
  "notes": "Special instructions"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderNumber": "CIS-20240101-001",
    "id": "order-id",
    "total": 2999,
    "paymentUrl": "razorpay-payment-url"
  }
}
```

### Cancel Order
```
PATCH /orders/:orderId/cancel
Authorization: Bearer <token>
```

### Request Return
```
PATCH /orders/:orderId/return
Authorization: Bearer <token>
```

**Request:**
```json
{
  "reason": "DAMAGED",
  "description": "Product arrived damaged",
  "images": ["image-urls"]
}
```

---

## Users Endpoints

### Get Profile
```
GET /users/profile
Authorization: Bearer <token>
```

### Update Profile
```
PUT /users/profile
Authorization: Bearer <token>
```

**Request:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "9876543210",
  "profileImage": "image-url",
  "preferredLanguage": "en",
  "isDarkMode": true,
  "subscribeToNewsletter": true
}
```

### Get Addresses
```
GET /users/addresses
Authorization: Bearer <token>
```

### Add Address
```
POST /users/addresses
Authorization: Bearer <token>
```

**Request:**
```json
{
  "type": "home",
  "fullName": "John Doe",
  "phoneNumber": "9876543210",
  "email": "john@example.com",
  "addressLine1": "123 Street",
  "addressLine2": "Apt 4",
  "city": "Mumbai",
  "state": "Maharashtra",
  "postalCode": "400001",
  "country": "India",
  "isDefault": true,
  "gstNumber": "27AAAAA1234A1Z5"
}
```

### Delete Address
```
DELETE /users/addresses/:addressId
Authorization: Bearer <token>
```

### Get Wishlist
```
GET /users/wishlist
Authorization: Bearer <token>
```

### Add to Wishlist
```
POST /users/wishlist
Authorization: Bearer <token>
```

**Request:**
```json
{
  "productId": "product-id"
}
```

### Remove from Wishlist
```
DELETE /users/wishlist/:productId
Authorization: Bearer <token>
```

---

## B2B Endpoints

### Get B2B Profile
```
GET /b2b/profile
Authorization: Bearer <b2b-token>
```

### Create RFQ
```
POST /b2b/rfq
Authorization: Bearer <b2b-token>
```

**Request:**
```json
{
  "productId": "product-id",
  "quantity": 1000,
  "desiredPrice": 45,
  "deliveryDate": "2024-02-01",
  "specialRequirements": "Custom packaging",
  "documents": ["document-urls"]
}
```

### Get RFQs
```
GET /b2b/rfq?status=PENDING
Authorization: Bearer <b2b-token>
```

### Create Bulk Order
```
POST /b2b/bulk-orders
Authorization: Bearer <b2b-token>
```

**Request:**
```json
{
  "productId": "product-id",
  "quantity": 5000,
  "unitPrice": 45,
  "specialRequirements": "Custom branding",
  "paymentTerms": "Net 30"
}
```

### Get Bulk Orders
```
GET /b2b/bulk-orders
Authorization: Bearer <b2b-token>
```

---

## Payment Endpoints

### Create Razorpay Order
```
POST /payments/razorpay/create-order
Authorization: Bearer <token>
```

**Request:**
```json
{
  "orderId": "order-id",
  "amount": 9999,
  "description": "Purchase from Creative Impression"
}
```

### Verify Razorpay Payment
```
POST /payments/razorpay/verify
Authorization: Bearer <token>
```

**Request:**
```json
{
  "razorpay_payment_id": "pay_xxx",
  "razorpay_order_id": "order_xxx",
  "razorpay_signature": "signature_xxx"
}
```

### Create Stripe Payment Intent
```
POST /payments/stripe/create-payment-intent
Authorization: Bearer <token>
```

**Request:**
```json
{
  "orderId": "order-id",
  "amount": 9999
}
```

---

## Admin Endpoints

### Get Dashboard Analytics
```
GET /admin/dashboard?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <admin-token>
```

### Get All Users
```
GET /admin/users?page=1&limit=50&role=RETAIL_CUSTOMER&status=ACTIVE
Authorization: Bearer <admin-token>
```

### Get All Orders
```
GET /admin/orders?page=1&limit=50&status=PENDING&sortBy=newest
Authorization: Bearer <admin-token>
```

### Update Order Status
```
PATCH /admin/orders/:orderId
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "status": "SHIPPED",
  "trackingNumber": "TRK123456",
  "carrier": "Delhivery"
}
```

### Get All Products
```
GET /admin/products?page=1&limit=50
Authorization: Bearer <admin-token>
```

### Create Coupon
```
POST /admin/coupons
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "code": "SAVE10",
  "discountType": "PERCENTAGE",
  "discountValue": 10,
  "minOrderAmount": 500,
  "maxDiscount": 100,
  "usageLimit": 100,
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "applicableCategories": ["cat-id-1"]
}
```

### Create Banner
```
POST /admin/banners
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "title": "New Collection",
  "subtitle": "Discover our latest designs",
  "image": "image-url",
  "link": "/products?category=new",
  "position": "HOMEPAGE",
  "type": "HERO",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

---

## Error Codes

| Code | Status | Message |
|------|--------|---------|
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Duplicate entry |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |

---

## Rate Limiting

- **Default**: 100 requests per 15 minutes
- **Endpoints**: `/auth/login` - 5 requests per 15 minutes
- **Status**: X-RateLimit-* headers included in response

---

## Pagination

Standard pagination format:

```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

---

## Webhooks

### Payment Events
- `payment.completed`
- `payment.failed`
- `payment.refunded`

### Order Events
- `order.created`
- `order.confirmed`
- `order.shipped`
- `order.delivered`
- `order.cancelled`

Register webhooks in admin dashboard.

---

## Code Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://api.creativeimpression.com/api',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Get products
const products = await api.get('/products?page=1&limit=20');

// Create order
const order = await api.post('/orders', {
  items: [...],
  shippingAddressId: 'address-id',
  paymentMethod: 'RAZORPAY'
});
```

### Python
```python
import requests

API_URL = "https://api.creativeimpression.com/api"
TOKEN = "your-jwt-token"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# Get products
response = requests.get(f"{API_URL}/products", headers=headers)
products = response.json()

# Create order
order_data = {
    "items": [...],
    "shippingAddressId": "address-id",
    "paymentMethod": "RAZORPAY"
}
response = requests.post(f"{API_URL}/orders", json=order_data, headers=headers)
order = response.json()
```

---

For more help, visit: https://docs.creativeimpression.com
