# TAILORAE

**TAILORAE is an online fashion marketplace.** Many independent sellers open shops on one
website; customers browse, buy and pay; the platform takes a commission and pays each seller
their share. Think of a small Myntra or Amazon, built for fashion and custom clothing.

This guide assumes you know nothing about the project. Read it top to bottom once and you
will have it running on your own computer, know where everything lives, and know how to
change it.

---

## Contents

1. [What the project does](#1-what-the-project-does)
2. [How it works, in one picture](#2-how-it-works-in-one-picture)
3. [Technology used](#3-technology-used)
4. [What to install on your computer](#4-what-to-install-on-your-computer)
5. [Get the code](#5-get-the-code)
6. [First-time setup (step by step)](#6-first-time-setup-step-by-step)
7. [Running it every day](#7-running-it-every-day)
8. [Addresses to open in the browser](#8-addresses-to-open-in-the-browser)
9. [Your first tour of the app](#9-your-first-tour-of-the-app)
10. [Where everything lives (folder structure)](#10-where-everything-lives-folder-structure)
11. [Important ideas to understand](#11-important-ideas-to-understand)
12. [All commands](#12-all-commands)
13. [Settings reference](#13-settings-reference)
14. [Tests and checks](#14-tests-and-checks)
15. [Running everything inside Docker](#15-running-everything-inside-docker)
16. [Putting it on a real server (production)](#16-putting-it-on-a-real-server-production)
17. [Troubleshooting](#17-troubleshooting)
18. [How to contribute changes](#18-how-to-contribute-changes)
19. [More documentation](#19-more-documentation)

---

## 1. What the project does

There are **three kinds of people** who use TAILORAE, and each has their own area of the website
and their own separate login:

| Who | What they do | Where |
|---|---|---|
| **Customer** (shopper) | Browses products, adds to bag, pays (online or cash on delivery), tracks orders, returns items, writes reviews, asks for custom-wear quotes | The main shop — `/` |
| **Seller** (a shop owner and their team) | Signs up, proves their business (KYC documents, bank account), lists products, ships orders, sees earnings, withdraws money | Seller Central — `/seller` |
| **Staff** (TAILORAE team) | Approves sellers and products, manages orders, refunds, payouts, coupons, website content, other staff | Staff console — `/admin` |

The same email address can be a customer account **and** a seller account at the same time —
they are completely separate logins, like Amazon and Amazon Seller Central.

**Main features**

- Product catalogue with categories, brands, sizes/colours, search, filters, reviews and wishlists
- Bag, coupons, delivery estimate by PIN code, checkout with Razorpay or cash on delivery
- One order can contain products from several sellers — it is split automatically per seller
- Seller onboarding: email + phone confirmation, business details, PAN/GSTIN, documents, bank account, staff approval
- Seller teams with roles (owner, manager, catalogue, fulfilment, finance)
- Product moderation (staff approve listings before shoppers see them)
- Commission per seller or per category, seller earnings, 7-day return window, payouts, statements
- Custom wear (personalised clothing) quotes, B2B / bulk buying, newsletter, contact forms
- Editable website content (home page banners, texts) without changing code
- Emails for sign-up, password reset, orders, seller decisions

## 2. How it works, in one picture

```
   Customer / Seller / Staff
        (web browser)
              │
              ▼
   ┌──────────────────────┐        ┌───────────────────────────┐
   │  apps/web            │  HTTP  │  apps/api                 │
   │  Next.js website     │───────▶│  Spring Boot + Kotlin     │
   │  localhost:3000      │  JSON  │  localhost:8081           │
   └──────────────────────┘        └────┬──────────┬──────────┬┘
                                        │          │          │
                                        ▼          ▼          ▼
                                  PostgreSQL     Kafka     Mailpit (dev)
                                  (the data)    (events)    / SMTP (emails)
```

- The **website** (`apps/web`) shows pages. It never touches the database directly; it asks the API.
- The **API** (`apps/api`) holds all the rules (prices, stock, who may see what) and stores everything in **PostgreSQL**.
- When something important happens (an order is placed, a seller is approved) the API writes an
  **event** that goes through **Kafka**; other parts of the API react to it (for example by sending an email).
- In development, emails are not really sent — they are caught by **Mailpit**, which shows them in your browser.

## 3. Technology used

| Part | Technology | Why |
|---|---|---|
| Website | [Next.js 16](https://nextjs.org/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/) | Fast pages, good for search engines, one code base for shop + seller + staff areas |
| API | [Spring Boot 4](https://spring.io/projects/spring-boot), [Kotlin 2](https://kotlinlang.org/), Java 21 | Reliable, typed, well-known for business systems |
| Database | [PostgreSQL 15](https://www.postgresql.org/) with [Flyway](https://flywaydb.org/) migrations | Stores all data; Flyway creates/updates tables automatically |
| Events | [Apache Kafka](https://kafka.apache.org/) | Sends events between parts of the system (emails, refunds, cache refresh) |
| Payments | [Razorpay](https://razorpay.com/) | Indian online payments (cards, UPI, net banking) |
| Files | Local disk (dev) or any S3-compatible storage (production) | Product photos, KYC documents |
| Local services | [Docker](https://www.docker.com/) + Docker Compose | Runs Postgres, Kafka, Redis and Mailpit with one command |
| Tests | JUnit, [Testcontainers](https://testcontainers.com/), [Vitest](https://vitest.dev/) | Real database and Kafka in API tests |
| CI | GitHub Actions | Runs all tests on every push / pull request |

## 4. What to install on your computer

You need **four programs**. Install them in this order.

| # | Program | Version | Why you need it | Download |
|---|---|---|---|---|
| 1 | **Git** | any recent | To download (clone) the code and save changes | https://git-scm.com/downloads |
| 2 | **Node.js** | **22 LTS** (24 also works) | Runs the website and the helper scripts; includes `npm` | https://nodejs.org/ (pick "LTS") |
| 3 | **Docker Desktop** | 4.x or newer | Runs PostgreSQL, Kafka, Redis and Mailpit for you | https://www.docker.com/products/docker-desktop/ |
| 4 | **Java JDK** | **21** recommended (17 or newer works) | Runs the API's build tool (Gradle) | https://adoptium.net/ (Temurin 21) |

> Java note: Gradle needs any JDK 17+ to start. The API itself needs Java 21 — if you only have 17,
> Gradle **downloads Java 21 automatically** the first time (into `~/.gradle/jdks`). Installing 21 yourself avoids that download.

**Recommended (optional)**

- **Visual Studio Code** (https://code.visualstudio.com/) for the website, with extensions:
  *ESLint*, *Prettier*, *Tailwind CSS IntelliSense*.
- **IntelliJ IDEA Community** (https://www.jetbrains.com/idea/) for the Kotlin API.

**Computer requirements:** 16 GB RAM recommended (8 GB minimum), at least **10 GB free disk** (Docker images, Gradle and npm caches).

### Installing on Windows

1. Install Git (keep the default options; it also gives you **Git Bash**).
2. Install Node.js LTS.
3. Install Docker Desktop. When asked, **enable WSL 2**. Restart the computer. Open Docker Desktop once and wait until it says *Engine running*.
4. Install Temurin JDK 21 (tick **"Set JAVA_HOME"** in the installer).

### Installing on macOS (with [Homebrew](https://brew.sh/))

```bash
brew install git node@22
brew install --cask docker temurin@21
open -a Docker          # start Docker Desktop once
```

### Installing on Linux (Ubuntu/Debian)

```bash
sudo apt install git
# Node 22: https://github.com/nodesource/distributions  (or use nvm)
# Docker Engine + Compose plugin: https://docs.docker.com/engine/install/ubuntu/
sudo apt install openjdk-21-jdk
```

### Check everything is installed

Open a **new** terminal (Git Bash, PowerShell, Terminal) and run:

```bash
git --version          # git version 2.x
node -v                # v22.x  (or v24.x)
npm -v                 # 10.x or newer
docker --version       # Docker version 2x.x
docker compose version # Docker Compose version v2.x
java -version          # openjdk version "21..." (or "17...")
```

If any command says *not recognized / command not found*, that program is not installed or the
terminal was opened before installing it — close and reopen the terminal.

## 5. Get the code

```bash
git clone https://github.com/goestore/tailorae.git
cd tailorae
```

All commands in this guide are run **from this `tailorae` folder** unless it says otherwise.

## 6. First-time setup (step by step)

Do this once on a new computer.

### Step 1 — Start Docker Desktop

Open Docker Desktop and wait until it is running (whale icon steady, *Engine running*).

### Step 2 — Start the local services (database, Kafka, email catcher)

```bash
npm run db:up
```

This downloads and starts these containers (first time takes a few minutes):

| Container | What it is | Port on your computer |
|---|---|---|
| `tailorae-db` | PostgreSQL database | `5433` |
| `tailorae-kafka` | Kafka (events) | `9092` |
| `tailorae-mailpit` | Catches all emails | `1025` (SMTP), `8025` (web inbox) |
| `tailorae-redis` | Redis cache | `6379` |
| `tailorae-kafka-ui` | See Kafka events in the browser | `8085` |
| `tailorae-adminer` | Look inside the database in the browser | `8080` |

Check they are up: `docker ps` should list them.

> The API's database `tailorae_api` is created automatically the first time the database starts.
> If you ever see *database "tailorae_api" does not exist*, create it once:
> `docker exec tailorae-db psql -U postgres -c "create database tailorae_api"`

### Step 3 — Create your settings files

The project ships **example** settings files. Copy them:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

(On Windows PowerShell use `copy` instead of `cp`.)

These copies are **never committed to Git** — they hold your passwords and secret keys.

### Step 4 — Fill in the API secrets

Open `apps/api/.env` in an editor. Three values must be filled in. Generate random values with Node
(works on every system):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # → JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # → FIELD_ENCRYPTION_KEY
```

| Setting | What to put |
|---|---|
| `JWT_SECRET` | The first long random value (signs login sessions) |
| `FIELD_ENCRYPTION_KEY` | The second value — must be exactly what the command printed (encrypts sellers' bank account numbers) |
| `BOOTSTRAP_ADMIN_PASSWORD` | A password of **at least 10 characters** for the first staff account |

`BOOTSTRAP_ADMIN_EMAIL` is already `admin@tailorae.com` — change it if you like. This first staff
account is created automatically when the API starts the first time.

> Keep `FIELD_ENCRYPTION_KEY` safe and never change it after real sellers save bank details —
> data encrypted with the old key cannot be read with a new one.

### Step 5 — Install the website's packages

```bash
npm run install:all
```

This installs the root helper (`concurrently`) and the website's packages. It uses
`--legacy-peer-deps` on purpose — one library still declares an older React version.

The API needs no install step; Gradle downloads what it needs on the first run.

### Step 6 — Start the project

```bash
npm run dev
```

This starts **both** programs in one terminal:

- `[api]` lines: the Spring Boot API. The first start takes a few minutes (downloading Gradle, Java 21 and libraries). It is ready when you see **`Started TailoraeApplicationKt`**.
- `[web]` lines: the Next.js website. Ready when you see **`Ready in …`**.

The database tables are created automatically by Flyway on the API's first start.

### Step 7 — Open the website

Go to **http://localhost:3000**. The shop is **empty** at first — no products, categories or
sellers. That is expected; see [section 9](#9-your-first-tour-of-the-app) to fill it.

## 7. Running it every day

```bash
# 1. Make sure Docker Desktop is running, then:
npm run db:up        # start database, Kafka, Mailpit (safe to run if already running)
npm run dev          # start API + website
```

- **Stop the API and website:** press `Ctrl + C` in that terminal.
- **Stop the database and other services:** `npm run db:down` (your data is kept).
- **Run only one part:** `npm run dev:web` (website) or `npm run dev:api` (API).

Code changes in the website appear in the browser immediately. Changes in the API need the API
restarted (`Ctrl + C`, then `npm run dev` again).

### Fast mode (production build)

`npm run dev` is for **editing code**: it compiles each page the first time you open it and sends
unminified JavaScript, so it feels slow. To **use** the site at full speed:

```bash
npm run build          # once after each code change (API package + optimised website)
npm run start:prod     # API and website in production mode on the same ports (8081, 3000)
```

Measured on this project: pages answer in 5–40 ms instead of 100–200 ms (plus no multi-second
first-visit compile), the browser downloads about 260 KB of JavaScript instead of over 1 MB, and
API responses are gzip-compressed (a 166 KB JSON answer is sent as 14 KB).

## 8. Addresses to open in the browser

| What | Address |
|---|---|
| Shop (customers) | http://localhost:3000 |
| Customer sign-in / sign-up | http://localhost:3000/auth/login , http://localhost:3000/auth/register |
| Seller Central sign-in / sign-up | http://localhost:3000/seller/login , http://localhost:3000/seller/register |
| Staff console sign-in | http://localhost:3000/admin/login |
| Emails (Mailpit inbox) | http://localhost:8025 |
| API | http://localhost:8081 (health check: http://localhost:8081/actuator/health) |
| API description (all endpoints, OpenAPI JSON) | http://localhost:8081/v3/api-docs |
| Kafka UI (events) | http://localhost:8085 |
| Adminer (database browser) | http://localhost:8080 — System *PostgreSQL*, Server `postgres`, User `postgres`, Password `postgres`, Database `tailorae_api` |

## 9. Your first tour of the app

Follow these steps once to see every part working.

**1. Sign in as staff.** Open http://localhost:3000/admin/login and use `BOOTSTRAP_ADMIN_EMAIL` /
`BOOTSTRAP_ADMIN_PASSWORD` from `apps/api/.env`. You see the staff dashboard.

**2. Create a category.** *Catalogue → Categories* → add e.g. "Men" and "Kurtas" (a commission
percentage on a category is optional).

**3. Become a seller.** In a **private / incognito window** (so you stay signed in as staff in the
other), open http://localhost:3000/seller/register and sign up.
- **Email confirmation:** open http://localhost:8025, click the link in the email.
- **Phone code:** there is no SMS provider in development. The 6-digit code is printed in the
  `npm run dev` terminal (look for a line with `is your TAILORAE code`). This needs
  `TAILORAE_SMS_LOG_CODES=true` in `apps/api/.env` (it is in the example file).
- Fill in the business details (use a test PAN like `AAPFU0939F`), upload any PDF as the PAN document,
  add a bank account (IFSC like `HDFC0001234`), then **Submit**.

**4. Approve the seller.** Back in the staff console: *Marketplace → Sellers* → open the shop → **Approve**.

**5. List a product.** As the seller: *Catalogue → Add a product*, add a photo, price and a size,
publish it. It waits for moderation.

**6. Approve the listing.** As staff: *Catalogue → Moderation* → **Approve**.

**7. Buy it.** In another window, sign up as a customer at http://localhost:3000/auth/register,
find the product, add it to the bag, check out with **Cash on delivery**.

**8. Ship it.** As the seller: *Orders* → move the order forward; *Shipped* asks for a tracking number.
Mark it *Delivered*. The order confirmation and status emails appear in Mailpit.

**9. Money.** The seller's *Earnings* page shows the amount **held** for the 7-day return window,
then it becomes payable, and staff pay it out from *Marketplace → Payouts*.

> The same whole flow runs automatically with the smoke test — see [section 14](#14-tests-and-checks).

## 10. Where everything lives (folder structure)

```
tailorae/
├── apps/
│   ├── web/                      The website (Next.js)
│   │   ├── src/app/              Pages — each folder is a URL (app/cart → /cart)
│   │   │   ├── admin/            Staff console pages        (/admin/...)
│   │   │   ├── seller/           Seller Central pages       (/seller/...)
│   │   │   ├── auth/             Customer sign-in/up/reset  (/auth/...)
│   │   │   └── ...               Shop pages: products, cart, checkout, orders, dashboard...
│   │   ├── src/components/       Reusable UI pieces (header, product card, forms...)
│   │   ├── src/lib/              Code that talks to the API (one file per area) and helpers
│   │   │   ├── api-client.ts     The one HTTP client: cookies, session refresh
│   │   │   └── api/schema.d.ts   TypeScript types generated from the API (npm run api:types)
│   │   ├── src/content/          Editable site content (home page texts, banners) definitions
│   │   ├── src/store/            Redux state (signed-in user, bag)
│   │   ├── src/styles/           Global styles and design tokens (colours, fonts)
│   │   ├── public/               Static files: logos (public/brand), icons, images
│   │   ├── .env.example          Website settings template
│   │   └── Dockerfile            Builds the website image
│   │
│   └── api/                      The API (Spring Boot + Kotlin)
│       ├── src/main/kotlin/com/tailorae/
│       │   ├── common/           Shared basics: responses, errors, ids, money, storage, events
│       │   ├── identity/         Sign-up, sign-in, sessions, passwords, staff accounts
│       │   ├── seller/           Seller businesses, KYC, bank, team, approval
│       │   ├── catalog/          Categories, brands, products, sizes, moderation, search, import/export
│       │   ├── media/            Image uploads
│       │   ├── commerce/         Bag, wishlist, addresses, coupons, reviews, delivery estimates
│       │   ├── order/            Checkout, order status, cancellations, returns
│       │   ├── payment/          Razorpay payments, webhooks, refunds
│       │   ├── finance/          Commission, seller ledger, payouts, withdrawals
│       │   ├── content/          Editable website content, banners
│       │   ├── customwear/       Custom clothing products and quotes
│       │   ├── b2b/              Business buyers, quotes (RFQ), bulk orders
│       │   ├── engagement/       Contact form, newsletter, back-in-stock alerts
│       │   ├── notification/     All emails (and SMS hook)
│       │   └── admin/            Staff dashboard, reports, settings, audit log
│       ├── src/main/resources/
│       │   ├── application.yml   API settings (most read from environment / .env)
│       │   └── db/migration/     Database tables, created by Flyway (V1__..., V2__...)
│       ├── src/test/             API tests
│       ├── CONVENTIONS.md        How API code is written here — read before changing the API
│       ├── .env.example          API settings template
│       ├── build.gradle.kts      API dependencies and build
│       └── Dockerfile            Builds the API image
│
├── infra/docker/                 Docker Compose for local services (+ full stack)
├── tools/                        gradle.mjs (runs Gradle from the root), e2e-smoke.mjs (end-to-end test)
├── docs/                         Design documents (see section 19)
├── .github/workflows/ci.yml      Automatic checks on GitHub
└── package.json                  The commands in section 12
```

## 11. Important ideas to understand

**Three separate account types.** Customer, seller and staff accounts live in different database
tables and use different login cookies (`tl_c`, `tl_s`, `tl_a`). A customer login can never open
a seller or staff page. Details: [docs/ACCOUNTS.md](docs/ACCOUNTS.md).

**Sessions are cookies.** After sign-in the API sets an *httpOnly* cookie (JavaScript cannot read
it — safer). It lasts 15 minutes and is renewed automatically; you stay signed in for up to 30 days.

**Money is stored in paise.** ₹1,299.50 is stored as `129950`. Every money field in the API ends
in `Paise` (`pricePaise`, `totalPaise`). The website converts for display (`formatPaise`).
Percentages are *basis points*: 10% = `1000`.

**Sellers must be approved.** A seller's shop moves through: `DRAFT → SUBMITTED → UNDER_REVIEW →
APPROVED` (or `NEEDS_INFO` / `REJECTED`; staff can `SUSPEND`). Only approved shops can sell, and
each new product is checked by staff (moderation) before shoppers see it.

**One order, many sellers.** If a customer buys from three shops, there is one customer order and
three *seller orders*. Discounts and shipping are shared out exactly to the paisa. Commission is
charged on each seller's part. The customer's order shows "Shipped" only when every shop has shipped.

**Seller money.** After delivery, a seller's payout is **held for 7 days** (return window). Then a
nightly job credits it to the seller's ledger, and staff pay it out. Every movement is a ledger line;
sellers can download a statement.

**Sellers cannot see each other's data.** Besides the code checks, the database itself has
*row-level security* rules: even a buggy query cannot read another seller's rows. Sellers never
see a customer's email or phone — only the shipping label.

**Events.** Important changes write an event to an *outbox* table in the same database
transaction; a background job sends it to Kafka; listeners react (emails, refunds, cache refresh).
This guarantees an email is sent only if the change really happened.

**Database changes.** Never change tables by hand. Add a new file in
`apps/api/src/main/resources/db/migration/` (next free number in your module's range — see
`apps/api/CONVENTIONS.md`); Flyway applies it on the next start.

## 12. All commands

Run from the `tailorae` folder.

| Command | What it does |
|---|---|
| `npm run db:up` | Start Postgres, Kafka, Redis, Mailpit, Kafka UI, Adminer (Docker) |
| `npm run db:down` | Stop them (data is kept) |
| `npm run install:all` | Install the root helper and the website's packages |
| `npm run dev` | Start the API (port 8081) and website (port 3000) together |
| `npm run dev:web` / `npm run dev:api` | Start only one of them |
| `npm test` | All tests: API (needs Docker running) and website |
| `npm run test:api` / `npm run test:web` | Only one side's tests |
| `npm run lint` | Check the website code style |
| `npm run type-check` | Check the website's TypeScript types |
| `npm run build` | Production builds of the API (jar) and the website |
| `npm run start:prod` | Run both in fast production mode (after `npm run build`) |
| `npm run api:types` | Regenerate the website's API types from the running API |
| `npm run stack:up` | Run *everything* (incl. API and website) in Docker — see section 15 |
| `npm run format` | Auto-format the website code |

Inside `apps/api` you can also use Gradle directly: `./gradlew test`, `./gradlew bootRun`
(Windows: `gradlew.bat ...`).

## 13. Settings reference

### API — `apps/api/.env`

| Setting | Required | Default | Meaning |
|---|---|---|---|
| `JWT_SECRET` | **yes** | — | Long random string that signs login sessions |
| `FIELD_ENCRYPTION_KEY` | **yes** | — | 32 random bytes, base64. Encrypts bank account numbers |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | first run | — | The first staff account (super admin) |
| `SECURE_COOKIES` | | `true` | `false` for local http; `true` on https in production |
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | | local Docker DB | PostgreSQL connection |
| `KAFKA_BOOTSTRAP_SERVERS` | | `localhost:9092` | Kafka address |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | | Mailpit | Email server |
| `MAIL_FROM` | | `TAILORAE <no-reply@tailorae.com>` | Sender of emails |
| `ADMIN_EMAIL` | | `admin@tailorae.com` | Where staff alerts (new seller applications…) go |
| `WEB_ORIGINS` | | `http://localhost:3000` | Website addresses allowed to call the API (comma-separated) |
| `WEB_URL` | | `http://localhost:3000` | Website address used in email links |
| `API_PUBLIC_URL` | | `http://localhost:8081` | API address used in file links |
| `PORT` | | `8081` | API port |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | for online payment | — | Razorpay keys; empty = cash on delivery only |
| `STORAGE_TYPE` | | `local` | `local` (files on disk) or `s3` |
| `STORAGE_ROOT` | | `./data/storage` | Folder for files when `local` |
| `STORAGE_SIGNING_KEY` | production | dev value | Signs private file links |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_BASE_URL` | when `s3` | — | Any S3-compatible storage (AWS, Cloudflare R2, SeaweedFS, RustFS) |
| `TAILORAE_SMS_LOG_CODES` | dev | `false` | `true` prints seller phone codes in the API log |
| `WEB_REVALIDATE_URL`, `CONTENT_REVALIDATE_SECRET` | optional | — | Lets the API tell the website to refresh cached pages after content changes |

### Website — `apps/web/.env.local`

| Setting | Required | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes** | API address, e.g. `http://localhost:8081/api` |
| `NEXT_PUBLIC_APP_URL` | **yes in production** | The website's public address (used for links, SEO, sitemap) |
| `API_URL_INTERNAL` | optional | API address as seen from the website server (if different) |
| `CONTENT_REVALIDATE_SECRET` | optional | Must match the API's value |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_PHONE`, `NEXT_PUBLIC_SUPPORT_ADDRESS` | optional | Shown on the contact page |

## 14. Tests and checks

```bash
npm test                     # everything (Docker must be running for the API tests)
npm run lint                 # website code style
npm run type-check           # website types
```

- **API tests** (≈330) start a real PostgreSQL and Kafka in Docker automatically (Testcontainers).
  They cover sign-in, seller isolation, checkout, payments, payouts, and more. First run is slow (downloads images).
- **Website tests** (≈120) run with Vitest.
- **End-to-end smoke test** — runs the whole marketplace (seller sign-up → approval → product →
  order → delivery → payout) against your running stack:

  ```bash
  # bash / Git Bash, with npm run dev running and TAILORAE_SMS_LOG_CODES=true:
  ADMIN_PASSWORD='<your BOOTSTRAP_ADMIN_PASSWORD>' API_LOG=<file the API logs to> node tools/e2e-smoke.mjs
  ```
  (`API_LOG` must be a file containing the API's output, e.g. `npm run dev:api > api.log` in another terminal.)

GitHub runs the API tests, website checks and both Docker builds automatically on every push and
pull request (`.github/workflows/ci.yml`).

## 15. Running everything inside Docker

To run the whole system (database, Kafka, API **and** website) without installing Java or Node
locally:

```bash
npm run stack:up             # builds and starts everything
```

Then open http://localhost:3000. Set `BOOTSTRAP_ADMIN_PASSWORD` (and optionally `JWT_SECRET`,
Razorpay keys) as environment variables before running, or in a `.env` file next to
`infra/docker/docker-compose.yml`. Stop with `npm run db:down`.

## 16. Putting it on a real server (production)

The two apps are built as Docker images (`apps/api/Dockerfile`, `apps/web/Dockerfile`). Checklist:

1. **Managed PostgreSQL 15+** and **Kafka** (or a hosted Kafka), set `DATABASE_URL`, `KAFKA_BOOTSTRAP_SERVERS`.
2. **New secrets** — never reuse development values: `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `STORAGE_SIGNING_KEY`, `BOOTSTRAP_ADMIN_PASSWORD`.
3. **HTTPS** in front of both apps, and `SECURE_COOKIES=true`.
4. `WEB_ORIGINS`, `WEB_URL`, `API_PUBLIC_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` set to the real domains.
   (`NEXT_PUBLIC_*` values are baked in when the website image is **built** — pass them as build arguments.)
5. **Files:** `STORAGE_TYPE=s3` and the `S3_*` settings (a public bucket for images, a private one for KYC documents).
6. **Email:** real SMTP settings (`SMTP_*`, `MAIL_FROM`).
7. **Payments:** Razorpay live keys and the webhook URL `https://<api-domain>/api/payments/razorpay/webhook` with `RAZORPAY_WEBHOOK_SECRET`.
8. **SMS:** connect an SMS provider for seller phone codes (the code has an `SmsSender` interface ready).

## 17. Troubleshooting

| Problem | Fix |
|---|---|
| `docker: command not found` or *Cannot connect to the Docker daemon* | Start Docker Desktop and wait until it is running |
| `port is already allocated` / *address already in use* (3000, 8081, 5433…) | Another program uses that port. Close it (or an old `npm run dev` window). On Windows, `netstat -ano` lists the process id using each port |
| API stops with *JWT secret must be at least 32 bytes* or *Could not resolve placeholder 'JWT_SECRET'* | `apps/api/.env` is missing or `JWT_SECRET` is empty — see step 4 |
| *database "tailorae_api" does not exist* | `docker exec tailorae-db psql -U postgres -c "create database tailorae_api"` |
| *field-key must be 32 bytes* | Regenerate `FIELD_ENCRYPTION_KEY` with the command in step 4 |
| `npm install` fails with *ERESOLVE could not resolve* | Use `npm run install:all` (it adds `--legacy-peer-deps`) |
| The website shows no products / "fetch failed" | The API is not running or `NEXT_PUBLIC_API_URL` is wrong. Check http://localhost:8081/actuator/health |
| Signed in but immediately signed out, or login does nothing | On http, `SECURE_COOKIES` must be `false`; the website address must be listed in `WEB_ORIGINS` |
| No email arrives | Emails go to Mailpit: http://localhost:8025 |
| Seller phone code never arrives | There is no SMS in development; set `TAILORAE_SMS_LOG_CODES=true` and read the code in the API output |
| Online payment option is disabled | Razorpay keys are not set (cash on delivery still works) |
| API tests fail with *Could not find a valid Docker environment* | Start Docker Desktop |
| First API start is very slow | Normal — Gradle downloads itself, Java 21 and libraries once |
| `UnsupportedClassVersionError … class file version 65` when running a jar | You ran it with Java 17. Use Java 21 (`java -version`) |
| Running out of disk space | Docker images and caches are large: `docker system prune` removes unused images (not your data volumes) |

## 18. How to contribute changes

1. Get the latest code: `git checkout master && git pull`.
2. Create a branch for your change: `git checkout -b feat/short-description`.
3. Make the change. Read `apps/api/CONVENTIONS.md` before touching the API.
4. Check it: `npm test`, `npm run lint`, `npm run type-check`.
5. Commit with a clear message (`feat: …`, `fix: …`, `docs: …`, `chore: …`) and push:
   `git push -u origin feat/short-description`.
6. Open a Pull Request on GitHub. The automatic checks must pass before merging.

Rules of thumb:
- Never commit `.env` files, passwords or keys.
- Database changes = a new migration file, never editing an old one.
- Money in paise, never decimals.
- Keep the design tokens (colours, fonts) in `apps/web/src/styles/globals.css`; the brand gold is `#FECC00`.

## 19. More documentation

| Document | What it explains |
|---|---|
| [docs/ACCOUNTS.md](docs/ACCOUNTS.md) | The three account types, seller sign-up and approval, team roles, staff permissions, how seller data is kept separate |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | API modules, events and Kafka topics, scheduled jobs, local services |
| [docs/API_MIGRATION.md](docs/API_MIGRATION.md) | Every API endpoint area and what changed when the website moved to this API |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What has been built and what is left |
| [apps/api/CONVENTIONS.md](apps/api/CONVENTIONS.md) | How API modules, database tables, security and tests are written |

**Brand assets:** logos are in `apps/web/public/brand/` (wordmark, monogram, round mark, each with
a light version for dark backgrounds) and are shown through `apps/web/src/components/common/Logo.tsx`.
Favicons and social-share images are in `apps/web/src/app/`. They are generated from the master
artwork — regenerate rather than edit by hand.
