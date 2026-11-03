# Accounts and data separation

How customers, sellers and platform staff get accounts on TAILORAE, and how one
seller's data is kept away from every other seller and from customers who should
not see it. This is the design the Kotlin API (`apps/api/`) implements; the original Node API
used the single-`User`-table model described at the end.

## 1. Three separate identity realms

A person who shops and a person who runs a shop are different accounts, as on
Amazon / Seller Central. The same email address can exist once in each realm,
independently — signing up as a seller never changes anything about a customer
account with the same email, and the reverse.

| Realm | Who | Tables | Auth endpoints | Web area | Session cookie |
|---|---|---|---|---|---|
| **Customer** | Shoppers, incl. business (B2B) buyers | `customer`, `customer_address`, `customer_business_profile` | `/api/auth/*` | storefront | `tl_c` |
| **Seller** | People who work in a seller business | `seller_account` (the person), `seller` (the business), `seller_member` (who works where, with which role) | `/api/seller/auth/*` | `/seller/*` | `tl_s` |
| **Platform** | TAILORAE staff | `admin_user`, `admin_permission` | `/api/admin/auth/*` | `/admin/*` | `tl_a` |

Every access token carries an `aud` claim naming its realm (`customer`,
`seller`, `admin`). A token for one realm is rejected by the others' endpoints
even when its signature is valid, so a customer token can never call a seller
route, whatever the role field says.

### Sessions

- **Access token**: JWT (HS256), 15 minutes, in an `httpOnly; Secure; SameSite=Lax`
  cookie scoped to its realm. Nothing is stored in `localStorage` (the current
  web app keeps a Bearer token there — that goes away).
- **Refresh token**: 256-bit random, 30 days, stored only as a SHA-256 hash in
  `auth_session`. Each refresh **rotates** it; reuse of an already-rotated token
  revokes the whole session family (stolen-token detection).
- Logout, password change and password reset revoke sessions server-side.
- Lockout: 5 failed sign-ins → 15-minute lock, per account.

## 2. Sign-up flows

### Customer

1. `POST /api/auth/register` — name, email **or** phone, password (≥ 10 chars,
   checked against a breached-password list), marketing consent.
2. Account is usable immediately; verification email/OTP is sent through
   Kafka (`customer.registered` → notification service).
3. Verified email is required before the first online payment and for
   password reset by email.
4. Business buyers add a `customer_business_profile` (GSTIN, PAN, company) from
   their account — same login, `customer.type = BUSINESS`, unlocks RFQ and bulk
   pricing. (Replaces the old `B2B_BUYER` role.)
5. Guest checkout (later): an order with a contact email and no account; the
   customer can claim it by registering with that email.

### Seller (a state machine on `seller.status`)

```
                ┌──────────── NEEDS_INFO ◄───────┐
                ▼                                 │
DRAFT ──► SUBMITTED ──► UNDER_REVIEW ──► APPROVED ──► SUSPENDED
                                 └──► REJECTED          ▲   │
                                                        └───┘ (reinstate)
```

1. **Register** — `POST /api/seller/auth/register`: name, email, phone,
   password. Email *and* phone are OTP-verified before step 2.
2. **Create the business** (`DRAFT`): legal name, business type
   (individual / proprietorship / partnership / LLP / company), GSTIN, PAN,
   registered address, pickup address, display shop name → unique `shop_slug`.
   The registering account becomes the `OWNER` member.
3. **KYC documents** — PAN card, GST certificate, address proof, cancelled
   cheque — uploaded to the **private** bucket; only the owning seller and
   platform staff with `KYC_REVIEW` can fetch them, via 5-minute presigned URLs.
4. **Bank account** — account number encrypted at rest (AES-256-GCM, key from
   KMS/env); penny-drop verification is a later integration.
5. **Brands** — each brand the seller lists under: own brand (trademark
   certificate) or authorised reseller (authorisation letter). Brands are
   reviewed separately and can be shared by many sellers once approved.
6. **Submit** → `SUBMITTED`. Staff review KYC, bank and business details:
   `APPROVED`, `REJECTED` (with reason) or `NEEDS_INFO` (back to the seller with
   the fields to fix).
7. **Approved** sellers can create listings. Every listing goes through
   moderation (`PENDING → APPROVED/REJECTED`) before shoppers see it; edits to
   shopper-visible fields send it back to `PENDING`, price/stock edits do not.
8. **Suspension** hides all the seller's listings immediately and blocks new
   orders; open orders still have to be fulfilled.

### Seller team members

The owner invites people by email into their business with a role. An invite
creates (or links) a `seller_account` and a `seller_member` row. One person can
belong to several businesses and switches between them in the seller console;
the active business is in the token (`sid` claim).

| Permission | OWNER | MANAGER | CATALOG | FULFILMENT | FINANCE |
|---|:-:|:-:|:-:|:-:|:-:|
| Edit business profile, KYC, bank | ✓ | | | | |
| Invite / remove members | ✓ | ✓ | | | |
| Create & edit listings, stock | ✓ | ✓ | ✓ | | |
| See & update orders, print labels | ✓ | ✓ | | ✓ | |
| Returns | ✓ | ✓ | | ✓ | |
| Earnings, statements, withdrawals | ✓ | | | | ✓ |

### Platform staff

Created only by a `SUPER_ADMIN` (the first one by the seed). Permissions are
granted individually; the usual bundles are:

| Bundle | Grants |
|---|---|
| SUPER_ADMIN | everything, incl. staff management and settings |
| MODERATOR | listing moderation, brand review, reviews/Q&A moderation |
| KYC_REVIEW | seller applications, KYC documents, bank details (masked) |
| FINANCE | commission, settlements, payouts, refunds, statements |
| SUPPORT | read customers and orders, cancellations and returns |
| CONTENT | CMS, banners, home page curation |

Every staff action that changes data writes an `audit_log` row (who, what,
before/after).

## 3. How data is kept separate

Five layers, from the database outwards. Any one of them failing still leaves
the others.

1. **Ownership is a column, never inferred.** Every seller-owned table has
   `seller_id NOT NULL`: product, variant, inventory, brand authorisation,
   seller order, ledger entry, withdrawal, return-for-seller, KYC document,
   bank account, member, invite. The platform's own stock is a seller row
   (`TAILORAE Retail`) — there is no "null means house stock" special case.
2. **The seller comes from the token, never the request.** Seller endpoints
   read `SellerContext` (built from the `sid` claim and re-checked against
   `seller_member`); repositories for seller-owned tables only expose methods
   that take that `sellerId`. A request body or path can name a product id,
   never a seller id. Someone else's row answers **404, not 403**, so ids can't
   be probed.
3. **Postgres row-level security** as a second line. Seller-owned tables have
   `ENABLE ROW LEVEL SECURITY` with a policy
   `seller_id = current_setting('app.seller_id')::uuid`; the API runs
   `SET LOCAL app.seller_id` at the start of each seller-realm transaction.
   Customer and admin requests run as a role with a policy that bypasses it,
   because they legitimately read across sellers (e.g. the storefront).
4. **Sellers see only what fulfilment needs.** Order data reaches the seller
   through `seller_order_view`: items, quantities, the shipping name and address
   for the label, and status — never the customer's email, phone, other
   sellers' items or payment details. The customer's phone is exposed to the
   courier integration, not to the seller.
5. **Customer data is scoped by `customer_id`** from the token (cart, wishlist,
   addresses, orders, reviews). Staff reads of customer data are permission-
   checked and audited.

Uniqueness follows ownership: SKU is unique **per seller**
(`unique (seller_id, sku)`); product and shop slugs stay globally unique (they
are URLs), with an automatic suffix on collision.

### Automated proof

Cross-tenant tests are part of the build: for every seller endpoint, seller A
calling with seller B's resource id must get 404, and a customer or wrong-realm
token must get 401/403. These run against a real Postgres (Testcontainers) so
the RLS policies are exercised too.

## 4. Money between customers, sellers and the platform

Unchanged business rules, ported from the original Node API's `src/utils`:

- **Commission** per line: the seller's own rate, else the nearest category up
  the tree that sets one, else the platform default (10%). Platform stock pays 0.
- **Order split**: one customer order → one `seller_order` per seller. Coupon
  discount and shipping are apportioned in paise so the parts always sum to the
  whole. Commission is on the discounted item value, never on shipping.
- **Settlement**: a seller order becomes payable once delivered, 7 days have
  passed, and no return is open. Each money movement is a ledger row
  (`SALE`, `PAYOUT`, `RETURN_REVERSAL`, `ADJUSTMENT`); the balance is the sum.
- All amounts are integer **paise** (`bigint`), never floating point.

## 5. Difference from the original Node API (removed)

`legacy-api` has one `User` table with a single `role` column (`ADMIN`,
`VENDOR`, `B2B_BUYER`, `RETAIL_CUSTOMER`). Becoming a seller *converts* a
customer account into a vendor one, a person can't be both, sellers can't have
staff, and seller isolation is enforced only in route code. The realms above
replace that; because the database starts empty there is no data to migrate.
