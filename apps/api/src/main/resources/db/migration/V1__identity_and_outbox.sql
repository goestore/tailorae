-- TAILORAE schema, part 1: the three identity realms, seller businesses and
-- their members, sessions, and the event outbox.
--
-- Realms are separate tables on purpose (see docs/ACCOUNTS.md): the same email
-- may exist once as a customer and once as a seller account, independently.
-- Emails are unique case-insensitively within a realm via lower(email) indexes.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- customers
create table customer (
    id                uuid primary key,
    email             text        not null,
    phone             text,
    password_hash     text        not null,
    first_name        text        not null,
    last_name         text        not null default '',
    type              text        not null default 'INDIVIDUAL' check (type in ('INDIVIDUAL', 'BUSINESS')),
    status            text        not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
    email_verified_at timestamptz,
    marketing_opt_in  boolean     not null default false,
    failed_attempts   int         not null default 0,
    locked_until      timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create unique index customer_email_uq on customer (lower(email));
create unique index customer_phone_uq on customer (phone) where phone is not null;

-- ---------------------------------------------------------------- seller accounts (people)
create table seller_account (
    id                uuid primary key,
    email             text        not null,
    phone             text        not null,
    password_hash     text        not null,
    full_name         text        not null,
    status            text        not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
    email_verified_at timestamptz,
    phone_verified_at timestamptz,
    failed_attempts   int         not null default 0,
    locked_until      timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create unique index seller_account_email_uq on seller_account (lower(email));
create unique index seller_account_phone_uq on seller_account (phone);

-- ---------------------------------------------------------------- seller businesses
create table seller (
    id                 uuid primary key,
    shop_name          text        not null,
    shop_slug          text        not null unique,
    legal_name         text,
    business_type      text check (business_type in ('INDIVIDUAL', 'PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'COMPANY')),
    gstin              text,
    pan                text,
    registered_address jsonb,
    pickup_address     jsonb,
    status             text        not null default 'DRAFT'
        check (status in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'SUSPENDED')),
    status_note        text,
    -- Seller-specific commission override, basis points (1000 = 10%). Null = category/platform rate.
    commission_rate_bp int check (commission_rate_bp between 0 and 10000),
    -- The platform's own stock is a seller row too, so ownership is never null.
    is_platform        boolean     not null default false,
    submitted_at       timestamptz,
    decided_at         timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create unique index seller_one_platform_uq on seller (is_platform) where is_platform;

create table seller_member (
    seller_id  uuid        not null references seller (id) on delete cascade,
    account_id uuid        not null references seller_account (id) on delete cascade,
    role       text        not null check (role in ('OWNER', 'MANAGER', 'CATALOG', 'FULFILMENT', 'FINANCE')),
    created_at timestamptz not null default now(),
    primary key (seller_id, account_id)
);
create index seller_member_account_idx on seller_member (account_id);

-- ---------------------------------------------------------------- platform staff
create table admin_user (
    id              uuid primary key,
    email           text        not null,
    password_hash   text        not null,
    full_name       text        not null,
    status          text        not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
    failed_attempts int         not null default 0,
    locked_until    timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create unique index admin_user_email_uq on admin_user (lower(email));

create table admin_permission (
    admin_id   uuid not null references admin_user (id) on delete cascade,
    permission text not null
        check (permission in ('SUPER_ADMIN', 'MODERATOR', 'KYC_REVIEW', 'FINANCE', 'SUPPORT', 'CONTENT')),
    primary key (admin_id, permission)
);

-- ---------------------------------------------------------------- sessions
-- One row per issued refresh token. Rotation creates a new row in the same
-- family and marks the old one replaced; presenting a replaced token again
-- means it was stolen, and the whole family is revoked.
create table auth_session (
    id           uuid primary key,
    realm        text        not null check (realm in ('customer', 'seller', 'admin')),
    account_id   uuid        not null,
    family_id    uuid        not null,
    refresh_hash text        not null unique,
    expires_at   timestamptz not null,
    revoked_at   timestamptz,
    replaced_by  uuid,
    user_agent   text,
    ip           text,
    created_at   timestamptz not null default now()
);
create index auth_session_family_idx on auth_session (family_id);
create index auth_session_account_idx on auth_session (realm, account_id);

-- ---------------------------------------------------------------- events
create table outbox_event (
    id           uuid primary key,
    topic        text        not null,
    event_key    text        not null,
    payload      jsonb       not null,
    created_at   timestamptz not null default now(),
    published_at timestamptz
);
create index outbox_event_pending_idx on outbox_event (created_at) where published_at is null;

create table processed_event (
    consumer     text        not null,
    event_id     uuid        not null,
    processed_at timestamptz not null default now(),
    primary key (consumer, event_id)
);

create table audit_log (
    id         uuid primary key,
    actor_realm text       not null,
    actor_id   uuid,
    action     text        not null,
    entity     text        not null,
    entity_id  text,
    before     jsonb,
    after      jsonb,
    created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id);
