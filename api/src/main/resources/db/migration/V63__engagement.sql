-- TAILORAE schema, engagement: storefront contact requests and newsletter
-- sign-ups. (Back-in-stock requests are stock_notification, V4.)

create table contact_request (
    id          uuid primary key,
    name        text        not null,
    email       text        not null,
    subject     text        not null,
    message     text        not null,
    status      text        not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    notes       text,
    customer_id uuid references customer (id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index contact_request_status_idx on contact_request (status, created_at desc);

create table newsletter_subscriber (
    id                uuid primary key,
    email             text        not null,
    source            text        not null default 'footer',
    is_subscribed     boolean     not null default true,
    unsubscribed_at   timestamptz,
    -- Goes in every newsletter's unsubscribe link; knowing an address is not enough.
    unsubscribe_token text        not null unique,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create unique index newsletter_subscriber_email_uq on newsletter_subscriber (lower(email));
create index newsletter_subscriber_subscribed_idx on newsletter_subscriber (is_subscribed, created_at desc);

revoke all on contact_request, newsletter_subscriber from tailorae_seller_scope;
