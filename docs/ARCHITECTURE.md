# Architecture — Kotlin API

The TAILORAE backend is Spring Boot + Kotlin + Kafka (`api/`). It replaced the
original Express + Prisma API in a big-bang rewrite (November 2026); the old code
is in git history only. The database started empty, so there was no data migration.

## Stack

| Concern | Choice |
|---|---|
| Language / runtime | Kotlin 2.3, JDK 21 with virtual threads (Gradle downloads the JDK via the foojay toolchain resolver) |
| Framework | Spring Boot 4.1 — Web MVC, Security, Data JPA (Hibernate 7), Validation, Actuator |
| Module boundaries | Spring Modulith — each package below is a module; cross-module calls go through its public API or events, verified by a test |
| Database | PostgreSQL 15+, schema owned by **Flyway** (`api/src/main/resources/db/migration`), never Hibernate DDL |
| Messaging | Apache Kafka (KRaft, no ZooKeeper) via Spring Kafka |
| Cache / rate limits | Redis — Bucket4j rate limits, short-lived caches |
| Files | S3-compatible object storage (MinIO locally): `media` bucket public, `private` bucket for KYC via presigned URLs |
| Images | imgproxy sidecar for resize + WebP/AVIF (replaces `sharp`) |
| Excel | Apache POI for the Myntra listing templates |
| API docs | springdoc OpenAPI → generated TypeScript client in `web/src/lib/api/` |
| Tests | JUnit 5 + Testcontainers (Postgres, Kafka) |
| IDs / money | UUIDv7 primary keys; money as `Long` paise |

## Modules (`com.tailorae.*`)

| Module | Owns |
|---|---|
| `common` | Response envelope, error mapping, ids, money, pagination, security context |
| `identity` | The three realms (customer / seller / admin): registration, sign-in, sessions, refresh rotation, OTP, password reset, lockout |
| `customer` | Profile, addresses, business profile |
| `seller` | Business onboarding state machine, members & roles, KYC documents, bank details, admin review |
| `catalog` | Categories & category fields, listing templates, products, variants, colour families, brands & approval, moderation, Excel import/export |
| `search` | Postgres full-text + trigram search, facets, autocomplete (index fed from `catalog.product.changed`) |
| `cart`, `wishlist` | Per-customer baskets |
| `pricing` | Coupons, bulk pricing |
| `order` | Checkout transaction, seller split, stock reservation, status machine, cancel, returns |
| `payment` | Razorpay create / verify / webhook (raw-body HMAC, idempotent) / refund |
| `finance` | Commission, ledger (with `pg_advisory_xact_lock` per seller), settlement, withdrawals, payouts, statements |
| `content` | Versioned CMS values, banners, media library |
| `customwear` | Custom-wear products and quote requests |
| `b2b` | RFQs and bulk orders |
| `notification` | Email (and later SMS) — consumes events, renders templates |
| `admin` | Dashboard, reports, settings, audit log |

## Events

Domain events are written to an **outbox** table in the same transaction as the
change, then published to Kafka by a relay. Consumers are idempotent (they record
processed event ids) and failures go to a `<topic>.DLT` dead-letter topic.

| Topic | Produced when | Consumed by |
|---|---|---|
| `customer.registered` | customer signs up | notification (welcome / verify) |
| `seller.application.submitted` / `.decided` | seller submits / staff decide | notification, admin dashboard counters |
| `catalog.product.changed` | listing created/edited/moderated | search indexer, web cache revalidation |
| `inventory.stock.changed` | stock goes 0 → >0 or the reverse | back-in-stock alerts |
| `order.placed` | checkout commits | notification, finance (pending sale) |
| `payment.captured` / `.failed` / `.refunded` | gateway webhook / verify | order (status), notification, finance |
| `order.status.changed` | any status transition | notification, web revalidation |
| `seller-order.delivered` | a seller's part is delivered | finance (starts the 7-day settlement clock) |
| `return.requested` / `.decided` | customer asks / staff decide | seller console, finance (reversal) |
| `finance.ledger.posted` | ledger entry written | seller notifications, reporting |
| `notification.email.requested` | any module wants an email sent | notification |

## Scheduled jobs (ShedLock, so one instance runs each)

- Release stock held by unpaid online orders after 30 minutes.
- Nightly settlement sweep (catches anything an event missed).
- Purge expired sessions, OTPs and reset tokens.

## Compatibility with the web app

To keep the frontend change small at cutover, `api/` keeps the existing REST
paths, the `{ success, message, data }` envelope and the `X-Total-Count`
header. The deliberate breaks are authentication (per-realm endpoints and
`httpOnly` cookies instead of a Bearer token in `localStorage`) and the separate
seller sign-up/sign-in pages — see [ACCOUNTS.md](ACCOUNTS.md).

## Local services

`infra/docker-compose.yml`: Postgres (5433), Redis (6379), Kafka (9092),
Kafka UI (8085), Mailpit (1025 SMTP / 8025 UI), Adminer (8080). Object storage
is added with the media module (MinIO no longer ships Docker Hub images; the
choice between a MinIO build, SeaweedFS or RustFS is still open).
