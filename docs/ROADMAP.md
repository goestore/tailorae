# Roadmap

The tracked TODO for the TAILORAE rebuild. Tick items as they land; keep this
file the single list.

## Phase 1 — Clean slate and rebrand ✅

- [x] Remove every reference to the previous brand (code, metadata, emails, docs, Docker, DB name)
- [x] Repo layout: `web/`, `legacy-api/`, `api/`, `infra/`, `docs/`
- [x] Delete stray files, stale docs, dead components, unused images and PNG originals
- [x] Seed reduced to one env-driven admin; demo catalogue, users, coupon and data scripts removed
- [x] Custom-wear sample catalogue moved to a test fixture; home category tiles come only from the DB
- [x] `config/site.ts` + `%s | TAILORAE` title template; contact details from env
- [x] Order prefix `TL-`, storage keys `tl:*`
- [x] Fresh empty `tailorae` database; uploads emptied

## Phase 2 — Brand assets ✅

- [x] Transparent PNG + WebP: wordmark, monogram, ringed mark, each with a light variant
- [x] favicon.ico (16/32/48), icon.png, apple-icon.png, PWA icons incl. maskable, Open Graph / Twitter image
- [x] `Logo` component in header, mobile drawer, footer, auth, sell page, admin, invoice, 404/error
- [x] Brand yellow is the logo gold `#FECC00` (`--brand`, Tailwind `primary`, gradients, manifest)

## Phase 3 — Placeholder and frontend polish

- [x] `MediaPlaceholder` (product, category, brand, seller, banner, avatar) wired into every image slot
- [x] Failed remote images fall back to it even before hydration
- [x] Best Selling and Featured share one `ProductRail` using the catalogue card
- [x] Brand storefront hero; seller cards with shop imagery
- [x] Account status pills on tokens; cart rows on the card system
- [x] Inter via `next/font`
- [ ] Product page: move the ~70 inline styles into classes, drop the 1240px cap
- [x] Seller console shell with its own sidebar and top bar, outside the storefront chrome; `/seller/login` and `/seller/register` pages
- [ ] Replace remaining hard-coded 10–13px sizes with the type scale
- [ ] Admin image pickers: use `MediaPlaceholder` for empty tiles
- [x] Hero banner layout per page: one full-width banner or two side by side (`heroBannerFields` + `HeroBanner`)
- [ ] Replace the home hero banner images (current artwork shows "Customize polo t-shirts / Your logo") — upload new ones in the admin

## Phase 4 — Accounts and data separation ✅ (design)

- [x] [`ACCOUNTS.md`](ACCOUNTS.md): three realms, sign-up flows, seller state machine, team roles, staff permissions, five isolation layers
- [x] [`ARCHITECTURE.md`](ARCHITECTURE.md): modules, Kafka topics, outbox, scheduled jobs

## Phase 5 — Kotlin API (`api/`)

Foundation ✅
- [x] Gradle KTS, Spring Boot 4.1, Kotlin 2.3, Spring Modulith with a boundary test
- [x] Envelope, error mapping, UUIDv7 ids, paise money
- [x] Flyway V1: customer, seller_account, seller, seller_member, admin_user, admin_permission, auth_session, outbox, processed_event, audit_log
- [x] Transactional outbox → Kafka relay (`SKIP LOCKED`), idempotent consumers, dead-letter topics
- [x] Identity: register/login/refresh/logout/me for customer and seller realms, login/refresh/logout/me for admin; httpOnly cookies per realm; audience-checked JWTs; refresh rotation with reuse detection; lockout; bootstrap SUPER_ADMIN
- [x] Welcome emails via Kafka → Mailpit
- [x] Infra: Kafka (KRaft), Kafka UI, Mailpit in compose
- [x] 14 tests incl. Testcontainers end-to-end

Remaining
- [ ] identity: email/phone OTP verification, password reset, session list & revoke, staff management, permission checks
- [ ] seller: business onboarding state machine, members & invites, KYC to private storage, encrypted bank details, admin review; RLS + `SET LOCAL app.seller_id`
- [ ] object storage choice (MinIO build / SeaweedFS / RustFS) + imgproxy; media library
- [ ] catalog: categories & fields, Myntra templates, products, variants, colour families, brands & approval, moderation, Excel import/export (port `legacy-api/src/utils/*` specs)
- [ ] search: FTS + trigram, facets, autocomplete, indexer on `catalog.product.changed`
- [ ] cart, wishlist, coupons, bulk pricing, pincode / delivery estimate
- [ ] order: checkout, seller split (port `order-split`), stock reservation, status machine, cancel, returns
- [ ] payment: Razorpay create / verify / webhook / refund (port `payment-*` specs)
- [ ] finance: commission, ledger with advisory lock, settlement, withdrawals, payouts, CSV statements (port specs)
- [ ] content/CMS, banners, custom-wear products & quotes, B2B RFQ, contact, newsletter, stock alerts
- [ ] admin: dashboard, reports, users, orders, returns, reviews, settings, audit views
- [ ] scheduled jobs: unpaid-order stock release, settlement sweep, token cleanup (ShedLock)
- [ ] cross-seller isolation tests for every seller endpoint
- [ ] OpenAPI → generated TS client; web auth switched to per-realm cookies (seller pages exist; repoint `ENDPOINTS.seller` in `AuthPage.tsx` to `/seller/auth/*`)
- [ ] Dockerfiles (api, web) and GitHub Actions CI
- [x] JDK 21 + virtual threads
- [ ] Cutover: full E2E (seller sign-up → approval → listing → moderation → checkout → Razorpay test webhook → delivery → payout), point web at `api/`, delete `legacy-api/` and Prisma
