-- TAILORAE schema, custom wear: the made-to-order catalogue (staff-managed),
-- uploaded print artwork (private bucket) and quote requests.

create table custom_wear_product (
    id                      uuid primary key,
    slug                    text        not null unique,
    sku                     text        not null,
    name                    text        not null,
    short_description       text        not null default '',
    description             text        not null default '',
    gender                  text        not null check (gender in ('men', 'women', 'kids', 'unisex')),
    -- Taxonomy category id from the web app, e.g. 'mens-polo'.
    category                text        not null,
    product_type            text        not null check (product_type in ('polo', 'round-neck', 'hoodie', 'sweatshirt', 'sportswear')),
    fabric                  text,
    gsm                     int check (gsm > 0),
    fit                     text,
    base_price_paise        bigint      not null check (base_price_paise >= 0),
    max_price_paise         bigint check (max_price_paise >= 0),
    currency                text        not null default 'INR',
    min_order_quantity      int         not null default 1 check (min_order_quantity >= 1),
    default_quantity        int check (default_quantity >= 1),
    rating                  numeric(3, 2) not null default 0,
    review_count            int         not null default 0,
    popularity              int         not null default 0,
    is_active               boolean     not null default true,
    -- Structured option lists, shaped as the web's CustomWearProduct (money in paise).
    colors                  jsonb       not null default '[]',
    sizes                   jsonb       not null default '[]',
    price_tiers             jsonb       not null default '[]',
    customization_methods   jsonb       not null default '[]',
    customization_locations jsonb       not null default '[]',
    images                  jsonb       not null default '[]',
    accordions              jsonb       not null default '[]',
    description_block       jsonb,
    size_chart              jsonb,
    badges                  text[]      not null default '{}',
    highlights              text[]      not null default '{}',
    related_product_ids     uuid[]      not null default '{}',
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);
create unique index custom_wear_product_sku_uq on custom_wear_product (upper(sku));
create index custom_wear_product_listing_idx on custom_wear_product (is_active, gender, product_type);

-- Print artwork a customer uploaded with a quote. Private: staff open it via a
-- signed link. Deduplicated by content hash.
create table custom_wear_artwork (
    id            uuid primary key,
    hash          text        not null unique,
    storage_key   text        not null,
    format        text        not null check (format in ('png', 'jpg', 'webp', 'pdf')),
    content_type  text        not null,
    bytes         bigint      not null,
    width         int,
    height        int,
    original_name text        not null,
    created_at    timestamptz not null default now()
);

create table custom_wear_quote (
    id                 uuid primary key,
    -- CWQ-<year>-<6 digits>
    reference          text        not null unique check (reference ~ '^CWQ-[0-9]{4}-[0-9]{6}$'),
    customer_id        uuid references customer (id) on delete set null,
    product_id         uuid references custom_wear_product (id) on delete set null,
    -- Copied from the product at request time, so a later edit never rewrites a quote.
    product_slug       text        not null,
    product_name       text        not null,
    sku                text        not null,
    color_name         text,
    sizes              text[]      not null default '{}',
    quantity           int         not null check (quantity between 1 and 1000000),
    method             text,
    locations          text[]      not null default '{}',
    -- Artwork references ('artwork/<id>.<ext>'), see custom_wear_artwork.
    design_files       text[]      not null default '{}',
    notes              text,
    customer_name      text        not null,
    company            text,
    email              text        not null,
    phone              text,
    country            text        not null,
    postcode           text,
    required_by        text,
    status             text        not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST')),
    quoted_price_paise bigint check (quoted_price_paise >= 0),
    admin_notes        text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create index custom_wear_quote_status_idx on custom_wear_quote (status, created_at desc);
create index custom_wear_quote_email_idx on custom_wear_quote (lower(email));
create index custom_wear_quote_customer_idx on custom_wear_quote (customer_id);

revoke all on custom_wear_product, custom_wear_artwork, custom_wear_quote from tailorae_seller_scope;
