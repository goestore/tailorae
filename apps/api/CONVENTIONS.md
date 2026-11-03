# apps/api/ conventions

How a module in the Kotlin API is built. `seller/` is the reference module —
read it before writing a new one.

## Layout

- One package per module under `com.tailorae.<module>` (Spring Modulith; `ModularityTest`
  fails the build on cycles or reaching into another module's internals).
  Put types other modules may use in the module's base package; helpers in
  sub-packages (`internal`, …) are private to it.
- `common` is the shared kernel (open module): envelope, errors, ids, money, outbox,
  storage, settings, audit, paging, slugs, `SellerScope`. It depends on nothing.
- Cross-module calls go through the other module's base-package service. Reading
  another module's tables with SQL is fine for queries; **writes go through its
  service or an event**.

## Database

- Flyway owns the schema (`src/main/resources/db/migration`), Hibernate only validates.
  Reserved version ranges so parallel work never collides:
  V1–V4 core (identity, seller, catalog, commerce), **V30–V39 catalog/search/media**,
  **V50–V59 orders/payments/finance**, **V60–V69 content/custom-wear/B2B/notifications**,
  **V70–V79 admin**. `out-of-order` is on.
- Ids are UUIDv7 (`Ids.newId()`), money is `bigint` paise (`Long`), times `timestamptz`.
- Every seller-owned table has `seller_id not null`, `enable row level security` and
  `create policy seller_isolation on <t> to tailorae_seller_scope using (seller_id = current_setting('app.seller_id')::uuid)`.
  Tables a seller must never read: `revoke all on <t> from tailorae_seller_scope`.
- Data access: `JdbcClient` with explicit SQL (as in `SellerService`) is the default.
  JPA entities are fine where they help (identity uses them). Query single columns with
  boxed types: `query(Long::class.javaObjectType)`.

## Realms and authorisation

- Customer routes `/api/**`, seller routes `/api/seller/**`, staff routes `/api/admin/**`;
  each is a separate security chain with its own cookie (`tl_c`, `tl_s`, `tl_a`).
- Anonymous routes are declared by the module as a `PublicEndpoints` bean
  (`PublicEndpoints.get("/api/products", "/api/products/*")`). Everything else needs a session.
- The caller: `@AuthenticationPrincipal jwt: Jwt` → `jwt.accountId()`.
- **Seller routes**: `sellerContext.require(jwt, request, SellerPermission.X)` gives a
  `CurrentSeller`; the service method is `@Transactional` and calls
  `sellerScope.enter(current.sellerId)` first. Never take a seller id from the body or
  path. Someone else's row is **404, never 403**. Listing requires `current.canSell`.
- **Staff routes**: `adminAccess.require(jwt, AdminPermission.X)` returns the admin id;
  record changes with `audit.record("admin", adminId, …)`.
- **Customer data** is always filtered by `jwt.accountId()`.

## HTTP

- Responses use the envelope: `ApiResponse.ok(data, "message")`. Lists return
  `Page<T>` via `.toResponse()` (sets `X-Total-Count`); query params `page` (1-based), `limit`.
- Errors: throw `NotFoundException`, `BadRequestException`, `ConflictException`,
  `ApiException(HttpStatus.X, msg)`. Messages are shown to users verbatim — plain
  English, no internals.
- Validate request bodies with Jakarta annotations on Kotlin data classes
  (`@field:NotBlank` …) and `@Valid`.
- Keep the legacy Node API's paths and response field names where the web app relies
  on them (see `apps/web/src/lib/*-api.ts`), so switching the web app over stays small.
  Money fields in responses are paise and named `…Paise`.

## Events

- Record events with `outbox.record(topic, key, payload)` inside the same transaction
  as the change. Declare the module's topics as a `TopicSet` bean.
- Consumers (`@KafkaListener`) dedupe with `processedEvents.firstTime(consumer, eventId)`
  inside a transaction. Failures retry, then go to `<topic>.DLT`.

## Files

- `ObjectStorage` with `Bucket.PUBLIC` (images; `publicUrl(key)`) or `Bucket.PRIVATE`
  (documents; only via `signedUrl(key)`). Identify uploads by their bytes
  (`DocumentTypes.sniff` / an image sniffer), never by the client's content type.

## Tests

- Unit tests for pure rules (port the matching `legacy-api/src/utils/*.test.ts` cases).
- Integration tests extend `support.IntegrationTest` (shared Postgres + Kafka, one Spring
  context) and drive the API with `TestClient` (`customer()`, `sellerAccount()`, `admin()`).
  The database is shared across test classes: use `unique("name")` for emails, slugs, SKUs.
- Every seller endpoint gets an isolation check: seller B using seller A's id → 404.
- Run: `./gradlew test` (Docker must be running).
