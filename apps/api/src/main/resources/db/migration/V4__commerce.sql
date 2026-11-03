-- TAILORAE schema, part 4: what a shopper keeps before and around an order —
-- addresses, a business profile for B2B buyers, cart, wishlist, coupons,
-- reviews and back-in-stock requests. All scoped by customer_id from the token.

create table customer_address (
    id          uuid primary key,
    customer_id uuid        not null references customer (id) on delete cascade,
    label       text        not null default 'HOME' check (label in ('HOME', 'OFFICE', 'OTHER')),
    full_name   text        not null,
    phone       text        not null,
    email       text,
    line1       text        not null,
    line2       text,
    city        text        not null,
    state       text        not null,
    postal_code text        not null,
    country     text        not null default 'IN',
    gstin       text,
    is_default  boolean     not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index customer_address_customer_idx on customer_address (customer_id);
create unique index customer_address_one_default_uq on customer_address (customer_id) where is_default;

-- A business buyer: same login, customer.type = BUSINESS (docs/ACCOUNTS.md).
create table customer_business_profile (
    customer_id            uuid primary key references customer (id) on delete cascade,
    company_name           text        not null,
    company_registration   text,
    gstin                  text unique,
    pan                    text,
    business_type          text        not null,
    business_category      text,
    monthly_budget_paise   bigint,
    employee_count         int,
    description            text,
    website                text,
    credit_limit_paise     bigint      not null default 0,
    credit_used_paise      bigint      not null default 0,
    min_order_quantity     int         not null default 100,
    discount_tier          text        not null default 'STANDARD',
    verified_at            timestamptz,
    verification_documents text[]      not null default '{}',
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now()
);

create table cart_item (
    id               uuid primary key,
    customer_id      uuid        not null references customer (id) on delete cascade,
    product_id       uuid        not null references product (id) on delete cascade,
    variant_id       uuid references product_variant (id) on delete cascade,
    quantity         int         not null check (quantity > 0),
    -- Customisation choices (text, colours, uploaded artwork keys) and their mockup.
    customization    jsonb,
    mockup_image     text,
    is_bulk_order    boolean     not null default false,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index cart_item_customer_idx on cart_item (customer_id);
-- One line per product/variant unless it carries a customisation.
create unique index cart_item_plain_uq on cart_item (customer_id, product_id, variant_id) nulls not distinct
    where customization is null;

create table wishlist_item (
    customer_id uuid        not null references customer (id) on delete cascade,
    product_id  uuid        not null references product (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (customer_id, product_id)
);

create table coupon (
    id                      uuid primary key,
    code                    text        not null,
    description             text,
    discount_type           text        not null check (discount_type in ('PERCENTAGE', 'FIXED_AMOUNT')),
    -- PERCENTAGE: basis points (1000 = 10%). FIXED_AMOUNT: paise.
    discount_value          bigint      not null check (discount_value > 0),
    min_order_paise         bigint      not null default 0,
    max_discount_paise      bigint,
    usage_limit             int,
    usage_count             int         not null default 0,
    per_customer_limit      int         not null default 1,
    starts_at               timestamptz not null,
    ends_at                 timestamptz not null,
    is_active               boolean     not null default true,
    applicable_category_ids uuid[]      not null default '{}',
    applicable_product_ids  uuid[]      not null default '{}',
    require_business        boolean     not null default false,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    check (ends_at > starts_at)
);
create unique index coupon_code_uq on coupon (upper(code));

create table coupon_redemption (
    id           uuid primary key,
    coupon_id    uuid        not null references coupon (id) on delete cascade,
    customer_id  uuid        not null references customer (id) on delete cascade,
    order_id     uuid,
    amount_paise bigint      not null,
    created_at   timestamptz not null default now()
);
create index coupon_redemption_customer_idx on coupon_redemption (coupon_id, customer_id);

create table review (
    id                uuid primary key,
    product_id        uuid        not null references product (id) on delete cascade,
    customer_id       uuid        not null references customer (id) on delete cascade,
    order_id          uuid,
    rating            int         not null check (rating between 1 and 5),
    title             text,
    comment           text,
    images            text[]      not null default '{}',
    -- The reviewer bought this product (a delivered order line).
    is_verified       boolean     not null default false,
    helpful_count     int         not null default 0,
    not_helpful_count int         not null default 0,
    is_published      boolean     not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (product_id, customer_id)
);
create index review_product_idx on review (product_id, is_published);

create table stock_notification (
    id          uuid primary key,
    product_id  uuid        not null references product (id) on delete cascade,
    variant_id  uuid references product_variant (id) on delete cascade,
    email       text        not null,
    notified_at timestamptz,
    created_at  timestamptz not null default now(),
    constraint stock_notification_uq unique nulls not distinct (product_id, variant_id, email)
);
create index stock_notification_pending_idx on stock_notification (product_id) where notified_at is null;

-- A seller never reads a shopper's addresses, cart, wishlist or business profile.
revoke all on customer_address, customer_business_profile, cart_item, wishlist_item, coupon_redemption, stock_notification
    from tailorae_seller_scope;
