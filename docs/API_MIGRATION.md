# Moving the web app from the original Node API to `api`

> Done (November 2026). Kept as the record of what changed for the web app.

What changes for `web/` when it talks to the Kotlin API instead of the Express
one. The full machine-readable contract is `GET /v3/api-docs` on the running API;
generate TypeScript types from it (`npm run api:types` in `web/`). This file lists
the decisions and differences that the types alone do not explain.

## 1. Base URL, cookies and sessions

- `NEXT_PUBLIC_API_URL=http://localhost:8081/api` (Kotlin API) instead of the old `:5000/api`.
- **No tokens in `localStorage`.** Sign-in sets httpOnly cookies per realm; axios needs
  `withCredentials: true`. Remove every `localStorage` token read/write and the
  `Authorization: Bearer` header.
- Three realms, three sets of endpoints and cookies:

  | Who | Auth endpoints | Cookie | Web area |
  |---|---|---|---|
  | Customer | `/api/auth/*` | `tl_c` | storefront, `/dashboard` |
  | Seller | `/api/seller/auth/*` | `tl_s` | `/seller/*` |
  | Staff | `/api/admin/auth/*` | `tl_a` | `/admin/*` |

- Each realm has `register` (not staff), `login`, `logout`, `refresh`, `me`,
  `forgot-password`, `reset-password`, `change-password`, `verify-email` (+`/resend`),
  `verification`, `sessions` (+ `DELETE /sessions/{id}`, `POST /sessions/revoke-others`).
  Sellers also have `phone/send-code` and `phone/verify`.
- Access tokens last 15 minutes. On a 401, call `POST {realm}/auth/refresh` once and
  retry; if refresh also answers 401, the session is over → that realm's sign-in page.
  The realm follows the request path: `/seller/...` → seller, `/admin/...` → staff,
  everything else → customer.
- `login`/`register` return the account summary `{id, realm, email, name, emailVerified}`
  in `data` — not `{user, token}`.
- Customer profile stays at `GET/PUT /api/users/profile` → `data.user`.
- Sellers are a separate account from shoppers: the seller sign-up and sign-in pages
  must call the seller endpoints (`web/src/components/auth/AuthPage.tsx` `ENDPOINTS`).

## 2. Money and ids

- Every amount is **integer paise** with a `…Paise` suffix (`pricePaise`, `mrpPaise`,
  `totalPaise`, `discountPaise`, …). Divide by 100 to display; send paise in bodies.
  The storefront listing URL keeps `minPrice`/`maxPrice` in rupees (or use
  `minPricePaise`/`maxPricePaise`).
- Rates are basis points (`commissionRateBp` 1000 = 10%; coupon `PERCENTAGE` values
  likewise). Weights are grams (`weightGrams`).
- Ids are UUIDs (not cuid strings).
- Lists return `Page { items, total, page, limit, pages }` in `data` plus an
  `X-Total-Count` header — except where a legacy wrapper is kept (below).

## 3. Seller onboarding (new flow)

Legacy converted a shopper into a vendor with `POST /seller/apply`. Now:

1. `POST /api/seller/auth/register` `{email, password, fullName, phone}`.
2. Confirm email (link) and phone (`phone/send-code` → `phone/verify {code}`).
3. `POST /api/seller/business` — legal name, type, PAN/GSTIN, addresses, shop name.
4. KYC: `POST /api/seller/kyc/documents` (multipart `kind` + `file`; kinds `PAN`,
   `GST_CERTIFICATE`, `ADDRESS_PROOF`, `CANCELLED_CHEQUE`, `OTHER`),
   `GET /api/seller/kyc/documents`, `GET …/{id}/url` (5-minute link), `DELETE …/{id}`.
5. Bank: `PUT /api/seller/bank`, `GET /api/seller/bank` (masked).
6. `POST /api/seller/business/submit` once `GET /api/seller/me` → `checklist` is empty.
7. Staff decide: `POST /api/admin/sellers/{id}/decision {action: START_REVIEW|APPROVE|REJECT|REQUEST_INFO|SUSPEND|REINSTATE, note}`.

Statuses replace `applicationStatus` + `kycStatus`: `DRAFT, SUBMITTED, UNDER_REVIEW,
NEEDS_INFO, APPROVED, REJECTED, SUSPENDED` (`shop.status`, `shop.statusNote`).
`GET /api/seller/me` → `{shop, role, memberships, checklist, applicationsOpen}`.
Team: `GET /api/seller/members`, `POST /members/invites`, `DELETE /members/{accountId}`,
`DELETE /members/invites/{id}`, `POST /api/seller/invites/accept {token}`.
A person in several shops picks one with the `X-Seller-Id` header.

## 4. Catalog

- Public: `GET /api/products` → `{products, pagination}`; `GET /api/products/{idOrSlug}`;
  `/products/categories/list?tree=1`, `/categories/home`, `/sellers/list`, `/sellers/{slug}`,
  `/brands/list`, `/brands/{slug}`, `/colors/families`, `/facets/list`, `/search/q`.
  Hidden products are no longer returned here to owners or staff.
- Product fields: `price` → `pricePaise`, `originalPrice` → `mrpPaise`, `costPrice` →
  `costPaise`, variant `price` → `pricePaise`, `weight` → `weightGrams`, `vendorId` →
  `sellerId`, `vendor` → `seller {id, shopName, shopSlug, shopImage, …}`,
  customization `additionalCost` → `additionalPaise` and `type` upper-case,
  bulk tiers `{discountBp, pricePaise}`, category `commissionRate` → `commissionRateBp`.
- Seller writes moved: `POST/GET /api/seller/products`, `GET/PUT/DELETE /api/seller/products/{id}`,
  variants and customizations under it, `/api/seller/brands` (multipart with
  `authorizationType` + `document`), `/api/seller/catalogue/brands`, `/api/seller/media`.
- Staff writes: `/api/admin/products…`, `/api/admin/categories…`, `/api/admin/brands…`
  (`GET /authorizations`, `PATCH /{id}/review` with `sellerId`), `/api/admin/moderation/products`,
  `/api/admin/inventory`, `/api/admin/catalog-import/{review,commit}`, `/api/admin/media`.
- The go-live 409 puts `missing` under `data.missing`. Document links return `{url}`.
- Search matches word prefixes ("shirt" no longer matches "Sweatshirt").

## 5. Bag, wishlist, addresses, coupons, reviews, delivery

- `GET/DELETE /api/cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/{id}` keep
  the `{cart}` wrapper. Cart: `{id, items[], subtotalPaise, itemCount, problems[]}`;
  item `{id, productId, variantId, quantity, unitPaise, lineTotalPaise, available, product, variant}`.
  Lines are repriced on every read; a product with sizes needs `variantId`.
- Addresses `/api/users/addresses` → `{addresses}` / `{address}`; fields `label
  (HOME|OFFICE|OTHER), fullName, phone, email, line1, line2, city, state, postalCode,
  country, gstin, isDefault`.
- Wishlist `/api/users/wishlist` → `{items}`; `POST {productId}`; `DELETE /{productId}`.
- `POST /api/coupons/apply {code}` prices the shopper's own bag → `{code, discountPaise, …}`.
  Staff: `/api/admin/coupons`.
- Reviews: `GET /api/products/{id}/reviews` → `{reviews, summary, total}`;
  `POST` (one per shopper, posting again edits); `POST /api/reviews/{id}/vote`;
  staff `GET /api/admin/reviews`, `PATCH /{id} {isPublished}`, `DELETE /{id}`.
- Delivery: `GET /api/delivery/pincode/{pin}`, `POST /api/delivery/eta {pincode}` (unchanged shape).

## 6. Orders, payments, money

- Checkout `POST /api/orders {addressId | shippingAddress, billingAddress?, paymentMethod: COD|RAZORPAY, couponCode?, notes?, saveAddress?}`
  → `{order, payment: {required, method}}`. Order number prefix `TL-`.
- `GET /api/orders` (Page), `GET /api/orders/{id|orderNumber}` → `{order}`,
  `PATCH /{id}/cancel`, `PATCH /{id}/return {requestType, reason, description, images}`.
  Order: `items[]`, `sellerOrders[]` (one per shop, each with tracking), `timeline[]`, `returnRequest`.
- `GET /api/track-order?orderNumber=&email=`.
- Razorpay: `GET /api/payments/config`, `POST /payments/razorpay/create-order {orderId}`
  → `{keyId, gatewayOrderId, amountPaise, currency, orderId, orderNumber, email}`,
  `POST /payments/razorpay/verify` (Razorpay's three fields) → 200 confirmed / 202 pending.
  Unpaid online orders are cancelled after 30 minutes.
- Seller: `GET /api/seller/summary`, `GET /api/seller/orders` (Page of seller orders with
  `shipTo`, no customer contact details), `PATCH /api/seller/orders/{id} {status, trackingNumber, carrier}`
  (tracking required for SHIPPED), `GET /api/seller/earnings` (`balancePaise`, `held[]` with reasons),
  `GET /api/seller/earnings/statement?format=csv`, `GET/POST /api/seller/withdrawals`.
- Staff: `/api/admin/orders` (filters `status`, `paymentStatus`, `paymentMethod`, `q`),
  `PATCH /orders/{id}/status`, `POST /orders/{id}/cancel {reason}`, `POST /orders/{id}/refund`,
  `PATCH /orders/{id}/notes`, `/api/admin/returns`, `PATCH /returns/{id} {status: APPROVED|REJECTED|COMPLETED}`,
  `/api/admin/payouts`, `/payouts/{sellerId}`, `POST /payouts/{sellerId}/settle {reference}`,
  `POST /payouts/{sellerId}/adjustments`, `GET /payouts/{sellerId}/statement`,
  `/api/admin/withdrawals`, `PATCH /withdrawals/{id}`.

## 7. Content, custom wear, B2B, engagement

- Content: `GET /api/content/{ns}` (public), `/api/admin/content/{ns}` (+ `publish`,
  `DELETE …/draft`, `history`). Media library `/api/admin/media` → `{assets}` / `{asset}`
  with absolute `url`. Banners `/api/admin/banners`, public `GET /api/banners?position=`.
- Custom wear: `GET /api/custom-wear/products` (filters `minPricePaise`/`maxPricePaise`,
  `priceBounds {minPaise, maxPaise}`), `…/products/{slug}` → `{product}`, related →
  `{products}`; quotes `POST /api/custom-wear/quotes` (validation errors are 422 with
  `errors[]`); artwork upload returns a reference `artwork/<uuid>.<ext>`; staff quote
  views carry 5-minute signed `designFiles` and `artwork[].format`. Price fields gain `Paise`.
- B2B (customer): `/api/b2b/profile`, `/rfq` (`targetPricePaise`), `/bulk-orders`, `/credit`;
  staff `/api/admin/b2b/...`. Profile id = customer id; `role` → `type`.
- Contact `POST /api/contact`; newsletter `POST /api/newsletter`, `/unsubscribe`;
  `POST /api/stock-notify`. Staff: `/api/admin/contact-requests`,
  `/api/admin/newsletter-subscribers` (+ `/export` CSV), `/api/admin/stock-notifications`.

## 8. Staff console extras

- `GET /api/admin/dashboard` → `{stats, week, lowStock, topProducts, codPending, queues}`,
  `GET /api/admin/queues` (badges; includes legacy `sellersAwaitingKyc`).
- `GET /api/admin/reports?from&to[&format=csv]`, `GET/PATCH /api/admin/settings`
  (known keys only), `GET /api/admin/audit`, `/api/admin/customers` (+ `/{id}`, `PATCH /{id}/status`),
  `/api/admin/staff` (SUPER_ADMIN), `GET /api/admin/staff/me` (own permissions, to hide menu items).
- Staff permissions: `SUPER_ADMIN, MODERATOR, KYC_REVIEW, FINANCE, SUPPORT, CONTENT`;
  a route the caller lacks answers 403.

## 9. Not carried over

- WebP re-encoding of uploads (stored as the verified original).
- Per-IP rate limits on public forms (to add at the edge / gateway).
- In-app notifications and blog posts (no legacy routes used them).
- Legacy `X-Export-*` headers are not readable cross-origin (only `X-Total-Count` is exposed).
