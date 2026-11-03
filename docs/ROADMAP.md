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
- [x] Product page: inline styles moved into `pdp-*` classes, standard container
- [x] Seller console shell with its own sidebar and top bar, outside the storefront chrome; `/seller/login` and `/seller/register` pages
- [x] Type scale (`text-micro/caption/small/meta`) replaces hard-coded 10–13px sizes
- [x] Admin image pickers use `MediaPlaceholder` for empty tiles
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
- [x] 324 tests incl. Testcontainers end-to-end

Remaining
- [x] identity: email confirmation, seller phone codes, password reset/change, session list & revoke, staff management, live permission checks
- [x] seller: onboarding state machine, members & invites, KYC to private storage, encrypted bank details, staff review; RLS via `SellerScope`
- [x] media library on `ObjectStorage` (local disk, public + private buckets, signed links)
- [x] S3-compatible storage for production (`STORAGE_TYPE=s3`; tested against SeaweedFS). Resizing/WebP is done by the web app's Next.js image optimizer, so no imgproxy
- [x] catalog: categories & fields, Myntra templates, products, variants, colour families, brands & approval, moderation, Excel import/export
- [x] search: weighted full-text + trigram, facets, typeahead
- [x] cart, wishlist, addresses, coupons, bulk pricing, reviews, pincode / delivery estimate
- [x] order: checkout, seller split, guarded stock, status machine, cancel, returns
- [x] payment: Razorpay create / verify / webhook / refund
- [x] finance: commission, ledger with advisory lock, settlement, withdrawals, payouts, CSV statements
- [x] content/CMS, banners, custom-wear products & quotes, B2B RFQ, contact, newsletter, stock alerts, emails
- [x] admin: dashboard, queues, reports, customers, staff, orders, returns, reviews, settings, audit
- [x] scheduled jobs: unpaid-order stock release, settlement sweep, session cleanup (advisory-lock single runner)
- [x] cross-seller isolation tests (404 on another shop's ids, RLS proven against Postgres)
- [x] OpenAPI at `/v3/api-docs`; contract changes in [`API_MIGRATION.md`](API_MIGRATION.md)
- [x] Web switched to the Kotlin API: storefront + auth, seller console (new onboarding, team, earnings), staff console (permissions, staff, audit)
- [x] Dockerfiles (api, web), compose `app` profile, GitHub Actions CI
- [x] JDK 21 + virtual threads
- [x] Cutover: full E2E (`scripts/e2e-smoke.mjs`: seller sign-up → approval → listing → moderation → checkout → delivery → payout; Razorpay webhooks covered by API tests), web on `api/`, `legacy-api/` and Prisma deleted
