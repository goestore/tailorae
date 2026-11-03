# TAILORAE

A multi-seller fashion marketplace: customers shop from independent sellers and brands,
sellers run their own shops, and the platform handles checkout, payments, commission and payouts.

## Layout

| Folder | What it is |
|---|---|
| `web/` | Storefront, seller console and admin console — Next.js 16, React 19, Tailwind |
| `legacy-api/` | Current API — Express + Prisma + PostgreSQL. Being replaced by `api/` |
| `api/` | Spring Boot + Kotlin + Kafka API (in progress — see `docs/ARCHITECTURE.md`) |
| `infra/` | Docker Compose for local services (Postgres, Redis, Kafka, Mailpit, Adminer) |
| `docs/` | `ACCOUNTS.md` (realms, onboarding, data separation), `ARCHITECTURE.md`, `ROADMAP.md` |

## First run

```bash
# 1. Services (Postgres on localhost:5433, Redis on 6379)
npm run db:up

# 2. API
cd legacy-api
cp .env.example .env          # then set JWT_SECRET, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
npm install
npm run setup:db              # creates the schema and the one admin account
npm run dev                   # http://localhost:5000

# 3. Web
cd ../web
cp .env.example .env.local
npm ci
npm run dev                   # http://localhost:3000
```

The store starts **empty** — no categories, products, brands or sellers. Sign in at `/auth/login`
with the seed admin and build the catalogue from `/admin`.

### Kotlin API (`api/`, in progress)

Uses its own database (`tailorae_api`) until cutover — Flyway owns that schema.

```bash
docker exec tailorae-db psql -U postgres -c "create database tailorae_api"   # once
cd api
JWT_SECRET=<48+ random chars> SECURE_COOKIES=false \
BOOTSTRAP_ADMIN_EMAIL=admin@tailorae.com BOOTSTRAP_ADMIN_PASSWORD=<10+ chars> \
./gradlew bootRun             # http://localhost:8081, emails appear in Mailpit at :8025
./gradlew test                # unit + module-boundary + Testcontainers tests (needs Docker)
```

## Checks

```bash
cd web && npm run lint && npx tsc --noEmit && npx vitest run
cd legacy-api && npx tsc --noEmit && npx jest
```

## Brand assets

Logos live in `web/public/brand/` (wordmark, monogram, ringed mark — each with a `-light`
variant for dark surfaces) and are rendered through `web/src/components/common/Logo.tsx`.
Favicons and social images are files in `web/src/app/` (`favicon.ico`, `icon.png`,
`apple-icon.png`, `opengraph-image.png`, `twitter-image.png`); PWA icons are in
`web/public/icons/`. All are generated from the master artwork — regenerate rather than edit.
