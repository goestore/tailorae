-- TAILORAE schema, content: versioned storefront copy (namespace + JSON
-- pointer), the admin image library and homepage banners.

-- One editable storefront value. Drafts sit at version 0, so each path has a
-- single draft slot (a save is an upsert); publishing moves every draft of a
-- namespace up to the next version. Older published rows are never rewritten,
-- which makes the table its own history.
create table content_value (
    id           uuid primary key,
    namespace    text        not null check (namespace ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    path         text        not null,
    -- A JSON null is stored as the jsonb literal 'null', never SQL NULL.
    value        jsonb       not null,
    status       text        not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
    version      int         not null default 0 check (version >= 0),
    -- From the web registry's `field.private`: never sent to the storefront.
    is_private   boolean     not null default false,
    updated_by   uuid references admin_user (id) on delete set null,
    published_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (namespace, path, version),
    check ((status = 'DRAFT') = (version = 0))
);
create index content_value_namespace_idx on content_value (namespace, status);

-- An uploaded image, deduplicated by the hash of its bytes.
create table media_asset (
    id           uuid primary key,
    hash         text        not null unique,
    storage_key  text        not null,
    url          text        not null,
    filename     text        not null,
    alt          text        not null default '',
    content_type text        not null,
    width        int         not null,
    height       int         not null,
    bytes        bigint      not null,
    uploaded_by  uuid references admin_user (id) on delete set null,
    created_at   timestamptz not null default now()
);
create index media_asset_created_idx on media_asset (created_at desc);

create table banner (
    id            uuid primary key,
    title         text        not null,
    subtitle      text,
    image         text        not null,
    image_alt     text,
    link          text,
    position      text        not null default 'HOMEPAGE',
    type          text        not null default 'HERO',
    display_order int         not null default 0,
    starts_at     timestamptz,
    ends_at       timestamptz,
    is_active     boolean     not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index banner_position_idx on banner (position, display_order);

revoke all on content_value, media_asset, banner from tailorae_seller_scope;
