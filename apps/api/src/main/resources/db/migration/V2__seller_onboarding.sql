-- TAILORAE schema, part 2: the seller-scope role for row-level security,
-- platform settings, and everything a seller business needs before it can
-- list: shop profile, KYC documents, bank account, team invites.

-- ---------------------------------------------------------------- seller-scope role
-- Seller-realm transactions run `SET LOCAL ROLE tailorae_seller_scope` (see
-- SellerScope.kt). RLS policies on seller-owned tables apply to this role, and
-- it has no access at all to customer and staff tables.
do $$
begin
    if not exists (select from pg_roles where rolname = 'tailorae_seller_scope') then
        create role tailorae_seller_scope nologin;
    end if;
end
$$;
grant tailorae_seller_scope to current_user;
grant usage on schema public to tailorae_seller_scope;
grant select, insert, update, delete on all tables in schema public to tailorae_seller_scope;
alter default privileges in schema public grant select, insert, update, delete on tables to tailorae_seller_scope;

-- A seller never reads shoppers, staff or anyone's sessions directly.
revoke all on customer, admin_user, admin_permission, auth_session from tailorae_seller_scope;

-- ---------------------------------------------------------------- settings
create table system_setting (
    key        text primary key,
    value      jsonb       not null,
    updated_at timestamptz not null default now()
);
insert into system_setting (key, value) values
    ('seller.applications_open', 'true'),
    ('commission.default_rate_bp', '1000'),
    ('settlement.hold_days', '7'),
    ('shipping.free_above_paise', '99900'),
    ('shipping.flat_paise', '7900');

-- ---------------------------------------------------------------- seller business, extended
alter table seller drop constraint seller_business_type_check;
alter table seller add constraint seller_business_type_check
    check (business_type in ('INDIVIDUAL', 'PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'OTHER'));

alter table seller
    add column shop_description    text,
    add column shop_image          text,
    add column shop_banner         text,
    add column contact_phone       text,
    add column contact_email       text,
    add column low_stock_threshold int         not null default 5,
    add column rating              numeric(3, 2) not null default 0,
    add column rating_count        int         not null default 0,
    add column created_by          uuid references seller_account (id) on delete set null;

-- The platform's own stock is a seller like any other (docs/ACCOUNTS.md, layer 1),
-- so product ownership is never null. Fixed id so code and tests can name it.
insert into seller (id, shop_name, shop_slug, legal_name, status, is_platform, commission_rate_bp, decided_at)
values ('01900000-0000-7000-8000-000000000001', 'TAILORAE Retail', 'tailorae', 'TAILORAE', 'APPROVED', true, 0, now());

-- ---------------------------------------------------------------- KYC documents (private bucket)
create table seller_kyc_document (
    id          uuid primary key,
    seller_id   uuid        not null references seller (id) on delete cascade,
    kind        text        not null check (kind in ('PAN', 'GST_CERTIFICATE', 'ADDRESS_PROOF', 'CANCELLED_CHEQUE', 'OTHER')),
    storage_key text        not null,
    filename    text        not null,
    content_type text       not null,
    bytes       bigint      not null,
    uploaded_by uuid references seller_account (id) on delete set null,
    created_at  timestamptz not null default now()
);
create index seller_kyc_document_seller_idx on seller_kyc_document (seller_id);

-- ---------------------------------------------------------------- bank account (encrypted)
create table seller_bank_account (
    seller_id          uuid primary key references seller (id) on delete cascade,
    account_name       text        not null,
    -- AES-256-GCM via FieldCrypto; only the last four digits are ever shown.
    account_number_enc text        not null,
    account_last4      text        not null,
    ifsc               text        not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    bank_name          text,
    verified_at        timestamptz,
    updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------- team invites
create table seller_invite (
    id          uuid primary key,
    seller_id   uuid        not null references seller (id) on delete cascade,
    email       text        not null,
    role        text        not null check (role in ('MANAGER', 'CATALOG', 'FULFILMENT', 'FINANCE')),
    token_hash  text        not null unique,
    invited_by  uuid references seller_account (id) on delete set null,
    expires_at  timestamptz not null,
    accepted_at timestamptz,
    created_at  timestamptz not null default now()
);
create unique index seller_invite_open_uq on seller_invite (seller_id, lower(email)) where accepted_at is null;

-- ---------------------------------------------------------------- application history
create table seller_status_event (
    id         uuid primary key,
    seller_id  uuid        not null references seller (id) on delete cascade,
    from_status text,
    to_status  text        not null,
    note       text,
    actor_realm text       not null,
    actor_id   uuid,
    created_at timestamptz not null default now()
);
create index seller_status_event_seller_idx on seller_status_event (seller_id, created_at);

-- ---------------------------------------------------------------- row-level security
-- Policies bind only the seller-scope role; storefront and staff work runs as the
-- owning role and reads across sellers, as it must.
alter table seller_kyc_document enable row level security;
create policy seller_isolation on seller_kyc_document to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table seller_bank_account enable row level security;
create policy seller_isolation on seller_bank_account to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table seller_invite enable row level security;
create policy seller_isolation on seller_invite to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table seller_status_event enable row level security;
create policy seller_isolation on seller_status_event to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table seller_member enable row level security;
create policy seller_isolation on seller_member to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

-- The scope role sees its own business row only; the shop directory is a storefront read.
alter table seller enable row level security;
create policy seller_isolation on seller to tailorae_seller_scope
    using (id = current_setting('app.seller_id')::uuid);

-- People: only the accounts that are members of the business in scope.
alter table seller_account enable row level security;
create policy seller_isolation on seller_account to tailorae_seller_scope
    using (exists (
        select 1 from seller_member m
        where m.account_id = seller_account.id
          and m.seller_id = current_setting('app.seller_id')::uuid
    ));
