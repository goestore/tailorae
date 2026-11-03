-- TAILORAE schema, B2B: quote requests, bulk orders and the trade-credit
-- ledger of a business buyer (customer_business_profile, V4).

create table rfq (
    id                   uuid primary key,
    rfq_number           text        not null unique,
    customer_id          uuid        not null references customer_business_profile (customer_id) on delete cascade,
    product_id           uuid references product (id) on delete set null,
    quantity             int         not null check (quantity between 1 and 1000000),
    desired_price_paise  bigint check (desired_price_paise > 0),
    delivery_date        timestamptz,
    special_requirements text,
    status               text        not null default 'PENDING'
        check (status in ('PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
    quoted_price_paise   bigint check (quoted_price_paise > 0),
    quoted_at            timestamptz,
    quoted_by            uuid references admin_user (id) on delete set null,
    notes                text,
    documents            text[]      not null default '{}',
    expires_at           timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
create index rfq_customer_idx on rfq (customer_id, created_at desc);
create index rfq_status_idx on rfq (status, created_at);

create table bulk_order (
    id                   uuid primary key,
    order_number         text        not null unique,
    customer_id          uuid        not null references customer_business_profile (customer_id) on delete cascade,
    product_id           uuid references product (id) on delete set null,
    rfq_id               uuid references rfq (id) on delete set null,
    quantity             int         not null check (quantity >= 1),
    unit_price_paise     bigint      not null check (unit_price_paise >= 0),
    total_price_paise    bigint      not null check (total_price_paise >= 0),
    status               text        not null default 'PENDING'
        check (status in ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    expected_delivery    timestamptz,
    special_requirements text,
    payment_terms        text,
    custom_invoice       text,
    purchase_order       text,
    documents            text[]      not null default '{}',
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
create index bulk_order_customer_idx on bulk_order (customer_id, created_at desc);
create index bulk_order_status_idx on bulk_order (status);

-- Every change to a buyer's outstanding trade credit. `amount_paise` is the
-- signed change to credit used; `balance_paise` is credit used afterwards.
create table credit_transaction (
    id            uuid primary key,
    customer_id   uuid        not null references customer_business_profile (customer_id) on delete cascade,
    order_id      uuid,
    type          text        not null check (type in ('CREDIT_ISSUED', 'PAYMENT_RECEIVED', 'ADJUSTMENT')),
    amount_paise  bigint      not null,
    balance_paise bigint      not null check (balance_paise >= 0),
    description   text,
    reference     text,
    created_by    uuid references admin_user (id) on delete set null,
    created_at    timestamptz not null default now()
);
create index credit_transaction_customer_idx on credit_transaction (customer_id, created_at desc);

revoke all on rfq, bulk_order, credit_transaction from tailorae_seller_scope;
