# TAILORAE

A multi-seller fashion marketplace: customers shop from independent sellers and brands,
sellers run their own shops, and the platform handles checkout, payments, commission and payouts.

## Layout

| Folder | What it is |
|---|---|
| `web/` | Storefront, seller console (`/seller`) and staff console (`/admin`) — Next.js 16, React 19, Tailwind |
| `api/` | API — Spring Boot 4, Kotlin, JDK 21, PostgreSQL (Flyway), Kafka. Conventions in `api/CONVENTIONS.md` |
| `infra/` | Docker Compose: Postgres, Redis, Kafka (+ UI), Mailpit, Adminer; `app` profile adds the API and web |
| `scripts/` | Cross-platform Gradle runner and the end-to-end smoke test |
| `docs/` | [`ACCOUNTS.md`](docs/ACCOUNTS.md) (three account realms, onboarding, data separation), [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`API_MIGRATION.md`](docs/API_MIGRATION.md), [`ROADMAP.md`](docs/ROADMAP.md) |

## First run

Needs Docker, Node 22 and any JDK 17+ (Gradle downloads JDK 21 for the API by itself).

```bash
# 1. Services: Postgres on localhost:5433, Kafka 9092, Mailpit 1025 (inbox at http://localhost:8025)
npm run db:up

# 2. Settings
cp api/.env.example api/.env            # set JWT_SECRET, FIELD_ENCRYPTION_KEY, BOOTSTRAP_ADMIN_PASSWORD
cp web/.env.example web/.env.local

# 3. Install and run both (API on :8081, web on :3000)
npm run install:all
npm run dev
```

The store starts **empty** — no categories, products, brands or sellers. Three separate sign-ins:

- **Staff:** `/admin/login` with `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`; build the catalogue and invite staff from `/admin`.
- **Sellers:** `/seller/register` — confirm email and phone (until an SMS provider is set up, the code is printed in the API log), create the business, upload KYC, add the bank account, submit for review.
- **Customers:** `/auth/register`.

Online payment needs Razorpay test keys in `api/.env`; without them checkout offers cash on delivery.

## Checks

```bash
npm test                                 # API tests (needs Docker) + web unit tests
npm run lint && npm run type-check       # web
ADMIN_PASSWORD=… API_LOG=… node scripts/e2e-smoke.mjs   # whole marketplace flow against a running stack
```

CI (`.github/workflows/ci.yml`) runs the API tests, the web lint/types/tests/build and both Docker builds.

## Running it all in containers

```bash
npm run stack:up                         # Postgres, Kafka, Mailpit, API (:8081) and web (:3000)
```

For production the API reads its settings from the environment (see `api/src/main/resources/application.yml`);
set `STORAGE_TYPE=s3` and the `S3_*` variables to keep files in an S3-compatible bucket.

## API types for the web app

```bash
npm run api:types                        # regenerates web/src/lib/api/schema.d.ts from the running API's OpenAPI
```

## Brand assets

Logos live in `web/public/brand/` (wordmark, monogram, ringed mark — each with a `-light`
variant for dark surfaces) and are rendered through `web/src/components/common/Logo.tsx`.
Favicons and social images are files in `web/src/app/` (`favicon.ico`, `icon.png`,
`apple-icon.png`, `opengraph-image.png`, `twitter-image.png`); PWA icons are in
`web/public/icons/`. All are generated from the master artwork — regenerate rather than edit.
