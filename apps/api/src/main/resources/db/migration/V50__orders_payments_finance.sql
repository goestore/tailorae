-- TAILORAE schema: orders, payments and seller money.
--
-- One customer order splits into one seller_order per seller (legacy
-- order-split rules, in paise). Sellers see their part through RLS on
-- seller_order / order_item and the seller_order_shipment view — never the
-- customer's email, phone, other sellers' lines or payment details.

create table customer_order (
    id                 uuid primary key,
    order_number       text        not null unique,
    customer_id        uuid        not null references customer (id),
    status             text        not null default 'PENDING'
        check (status in ('PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED')),
    payment_status     text        not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED')),
    payment_method     text        not null check (payment_method in ('COD', 'RAZORPAY')),
    is_bulk_order      boolean     not null default false,
    is_b2b             boolean     not null default false,
    -- Snapshots: editing an address book entry later never rewrites an order.
    shipping_address   jsonb       not null,
    billing_address    jsonb       not null,
    contact_email      text        not null,
    contact_phone      text,
    subtotal_paise     bigint      not null,
    discount_paise     bigint      not null default 0,
    coupon_id          uuid references coupon (id) on delete set null,
    coupon_code        text,
    tax_paise          bigint      not null default 0,
    shipping_paise     bigint      not null default 0,
    total_paise        bigint      not null check (total_paise >= 0),
    refunded_paise     bigint      not null default 0,
    gstin              text,
    tracking_number    text,
    carrier            text,
    estimated_delivery date,
    delivered_at       timestamptz,
    notes              text,
    admin_notes        text,
    gateway_order_id   text unique,
    payment_id         text,
    -- Unpaid online orders release their stock after this (see OrderJobs).
    payment_due_by     timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create index customer_order_customer_idx on customer_order (customer_id, created_at desc);
create index customer_order_status_idx on customer_order (status, payment_status);
create index customer_order_unpaid_idx on customer_order (payment_due_by) where payment_status = 'PENDING' and payment_method = 'RAZORPAY';

create table seller_order (
    id               uuid primary key,
    order_number     text        not null unique,
    order_id         uuid        not null references customer_order (id) on delete cascade,
    seller_id        uuid        not null references seller (id),
    status           text        not null default 'PENDING'
        check (status in ('PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED')),
    subtotal_paise   bigint      not null,
    discount_paise   bigint      not null default 0,
    shipping_paise   bigint      not null default 0,
    total_paise      bigint      not null,
    -- Blended rate over the lines, basis points; the exact money is commission_paise.
    commission_bp    int         not null default 0,
    commission_paise bigint      not null default 0,
    payout_paise     bigint      not null default 0,
    settled_at       timestamptz,
    tracking_number  text,
    carrier          text,
    shipped_at       timestamptz,
    delivered_at     timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index seller_order_seller_idx on seller_order (seller_id, created_at desc);
create index seller_order_order_idx on seller_order (order_id);
create index seller_order_payable_idx on seller_order (seller_id, delivered_at) where status = 'DELIVERED' and settled_at is null;

create table order_item (
    id               uuid primary key,
    order_id         uuid        not null references customer_order (id) on delete cascade,
    seller_order_id  uuid        not null references seller_order (id) on delete cascade,
    seller_id        uuid        not null references seller (id),
    product_id       uuid        not null references product (id),
    variant_id       uuid references product_variant (id) on delete set null,
    name             text        not null,
    sku              text        not null,
    size             text,
    color            text,
    thumbnail        text,
    quantity         int         not null check (quantity > 0),
    unit_paise       bigint      not null,
    discount_paise   bigint      not null default 0,
    commission_bp    int         not null default 0,
    commission_paise bigint      not null default 0,
    customization    jsonb,
    mockup_image     text,
    created_at       timestamptz not null default now()
);
create index order_item_order_idx on order_item (order_id);
create index order_item_seller_order_idx on order_item (seller_order_id);
create index order_item_product_idx on order_item (product_id);

create table order_timeline (
    id          uuid primary key,
    order_id    uuid        not null references customer_order (id) on delete cascade,
    status      text        not null,
    message     text,
    actor_realm text        not null,
    actor_id    uuid,
    created_at  timestamptz not null default now()
);
create index order_timeline_order_idx on order_timeline (order_id, created_at);

create table return_request (
    id           uuid primary key,
    order_id     uuid        not null unique references customer_order (id) on delete cascade,
    customer_id  uuid        not null references customer (id),
    request_type text        not null default 'RETURN' check (request_type in ('RETURN', 'EXCHANGE')),
    reason       text        not null,
    description  text,
    images       text[]      not null default '{}',
    status       text        not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
    refund_paise bigint,
    refunded_at  timestamptz,
    notes        text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- Every gateway event, once. The unique key is what makes webhooks idempotent.
create table payment_event (
    id           uuid primary key,
    order_id     uuid references customer_order (id) on delete set null,
    gateway      text        not null default 'RAZORPAY',
    kind         text        not null check (kind in ('CAPTURED', 'FAILED', 'REFUNDED', 'ANOMALY')),
    gateway_ref  text        not null,
    amount_paise bigint      not null default 0,
    message      text,
    raw          jsonb,
    created_at   timestamptz not null default now(),
    unique (gateway, kind, gateway_ref)
);
create index payment_event_order_idx on payment_event (order_id);

-- ---------------------------------------------------------------- seller money
create table seller_ledger_entry (
    id              uuid primary key,
    seller_id       uuid        not null references seller (id),
    seller_order_id uuid references seller_order (id) on delete set null,
    type            text        not null check (type in ('SALE', 'PAYOUT', 'RETURN_REVERSAL', 'ADJUSTMENT')),
    -- Signed: SALE positive; PAYOUT and RETURN_REVERSAL negative; ADJUSTMENT either.
    amount_paise    bigint      not null,
    reference       text,
    note            text,
    created_by      uuid,
    created_at      timestamptz not null default now()
);
create index seller_ledger_seller_idx on seller_ledger_entry (seller_id, created_at);
-- A seller order is credited at most once, and reversed at most once.
create unique index seller_ledger_once_uq on seller_ledger_entry (seller_order_id, type)
    where type in ('SALE', 'RETURN_REVERSAL');

create table withdrawal_request (
    id               uuid primary key,
    seller_id        uuid        not null references seller (id),
    amount_paise     bigint      not null check (amount_paise > 0),
    status           text        not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
    bank_snapshot    jsonb,
    transaction_ref  text,
    rejection_reason text,
    requested_by     uuid,
    decided_by       uuid,
    decided_at       timestamptz,
    completed_at     timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index withdrawal_request_seller_idx on withdrawal_request (seller_id, created_at desc);
create unique index withdrawal_one_open_uq on withdrawal_request (seller_id) where status in ('PENDING', 'APPROVED');

-- ---------------------------------------------------------------- what a seller may see
-- The shipping label, and nothing else about the customer.
create view seller_order_shipment as
select so.id as seller_order_id,
       so.seller_id,
       o.order_number as parent_order_number,
       o.shipping_address ->> 'fullName'   as ship_name,
       o.shipping_address ->> 'line1'      as ship_line1,
       o.shipping_address ->> 'line2'      as ship_line2,
       o.shipping_address ->> 'city'       as ship_city,
       o.shipping_address ->> 'state'      as ship_state,
       o.shipping_address ->> 'postalCode' as ship_postal_code,
       o.payment_method,
       o.notes
from seller_order so
join customer_order o on o.id = so.order_id
where so.seller_id = nullif(current_setting('app.seller_id', true), '')::uuid;

-- Whether the customer has a return open — all a seller's earnings page needs from returns.
create view seller_order_return as
select so.id as seller_order_id, so.seller_id, r.status as return_status
from seller_order so
join return_request r on r.order_id = so.order_id
where so.seller_id = nullif(current_setting('app.seller_id', true), '')::uuid;

revoke all on customer_order, order_timeline, return_request, payment_event from tailorae_seller_scope;
grant select on seller_order_shipment, seller_order_return to tailorae_seller_scope;

alter table seller_order enable row level security;
create policy seller_isolation on seller_order to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table order_item enable row level security;
create policy seller_isolation on order_item to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table seller_ledger_entry enable row level security;
create policy seller_isolation on seller_ledger_entry to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table withdrawal_request enable row level security;
create policy seller_isolation on withdrawal_request to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);
