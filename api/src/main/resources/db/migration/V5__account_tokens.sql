-- TAILORAE schema, part 5: one-time tokens and codes for every realm —
-- password reset links, email confirmation links, phone codes. Only hashes are
-- stored; the secret itself travels once, in the email or SMS.

create table auth_token (
    id           uuid primary key,
    realm        text        not null check (realm in ('customer', 'seller', 'admin')),
    account_id   uuid        not null,
    purpose      text        not null check (purpose in ('PASSWORD_RESET', 'EMAIL_VERIFICATION', 'PHONE_OTP')),
    token_hash   text        not null unique,
    attempts     int         not null default 0,
    expires_at   timestamptz not null,
    used_at      timestamptz,
    requested_ip text,
    created_at   timestamptz not null default now()
);
create index auth_token_account_idx on auth_token (realm, account_id, purpose, created_at desc);

revoke all on auth_token from tailorae_seller_scope;
