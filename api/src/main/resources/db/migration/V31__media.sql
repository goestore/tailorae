-- Media: product photos and other storefront images, in the PUBLIC bucket.
--
-- Staff uploads form the shared library (seller_id null); a seller's uploads
-- belong to that seller and are only visible to it. The same bytes uploaded
-- twice by the same owner reuse one row and one stored file.

create table media_asset (
    id           uuid primary key,
    seller_id    uuid references seller (id) on delete cascade,
    hash         text        not null,
    storage_key  text        not null,
    url          text        not null,
    filename     text        not null,
    alt          text        not null default '',
    content_type text        not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
    width        int         not null check (width > 0),
    height       int         not null check (height > 0),
    bytes        bigint      not null,
    uploaded_by  uuid,
    created_at   timestamptz not null default now(),
    constraint media_asset_owner_hash_uq unique nulls not distinct (seller_id, hash)
);
create index media_asset_created_idx on media_asset (created_at desc);

alter table media_asset enable row level security;
create policy seller_isolation on media_asset to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);
