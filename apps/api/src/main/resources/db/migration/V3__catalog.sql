-- TAILORAE schema, part 3: the catalog. Categories and their listing fields,
-- brands and which sellers may sell them, products and variants, stock
-- movements, bulk pricing and customisation options.
--
-- Every product and variant belongs to a seller (the platform's own stock is
-- the 'TAILORAE Retail' seller row), and SKUs are unique per seller.
-- Money is integer paise.

-- ---------------------------------------------------------------- categories
create table category (
    id                 uuid primary key,
    parent_id          uuid references category (id) on delete set null,
    name               text        not null,
    slug               text        not null unique,
    description        text,
    icon               text,
    image              text,
    is_active          boolean     not null default true,
    display_order      int         not null default 0,
    -- Myntra-style listing template key (see catalog import/export).
    listing_template   text,
    -- Overrides the platform default for products in this subtree; nearest ancestor wins.
    commission_rate_bp int check (commission_rate_bp between 0 and 10000),
    -- The option a shopper picks on this category's products (e.g. "Size") and its allowed values.
    option_label       text,
    option_values      text[]      not null default '{}',
    show_on_home       boolean     not null default false,
    home_order         int         not null default 0,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    constraint category_sibling_name_uq unique nulls not distinct (parent_id, name)
);
create index category_parent_idx on category (parent_id);
create index category_home_idx on category (show_on_home, home_order);

create table category_field (
    id            uuid primary key,
    category_id   uuid        not null references category (id) on delete cascade,
    key           text        not null,
    label         text        not null,
    type          text        not null default 'TEXT' check (type in ('TEXT', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'BOOLEAN')),
    options       text[]      not null default '{}',
    unit          text,
    help_text     text,
    required      boolean     not null default false,
    filterable    boolean     not null default false,
    display_order int         not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (category_id, key)
);

-- ---------------------------------------------------------------- brands
create table brand (
    id               uuid primary key,
    name             text        not null,
    slug             text        not null unique,
    description      text,
    logo             text,
    banner           text,
    is_featured      boolean     not null default false,
    is_active        boolean     not null default true,
    display_order    int         not null default 0,
    -- The seller that registered the brand, if any. Platform-created brands have none.
    owner_seller_id  uuid references seller (id) on delete set null,
    status           text        not null default 'APPROVED' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
    rejection_reason text,
    meta_title       text,
    meta_description text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create unique index brand_name_uq on brand (lower(name));

-- Which sellers may list under which brand: the owner (trademark) or an
-- authorised reseller (authorisation letter). Reviewed by MODERATOR staff.
create table seller_brand (
    seller_id          uuid        not null references seller (id) on delete cascade,
    brand_id           uuid        not null references brand (id) on delete cascade,
    authorization_type text        not null check (authorization_type in ('OWNER', 'AUTHORISED_RESELLER')),
    document_key       text,
    status             text        not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
    rejection_reason   text,
    created_at         timestamptz not null default now(),
    decided_at         timestamptz,
    primary key (seller_id, brand_id)
);

-- ---------------------------------------------------------------- products
create table product (
    id                  uuid primary key,
    seller_id           uuid        not null references seller (id),
    category_id         uuid        not null references category (id),
    brand_id            uuid references brand (id) on delete set null,
    name                text        not null,
    slug                text        not null unique,
    description         text,
    short_description   text,
    status              text        not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'INACTIVE', 'DISCONTINUED')),
    -- Shoppers see a product only when ACTIVE and APPROVED and its seller is APPROVED.
    moderation_status   text        not null default 'PENDING' check (moderation_status in ('PENDING', 'APPROVED', 'REJECTED')),
    moderation_note     text,
    moderated_at        timestamptz,
    sku                 text        not null,
    barcode             text,
    price_paise         bigint      not null check (price_paise >= 0),
    mrp_paise           bigint check (mrp_paise >= 0),
    cost_paise          bigint check (cost_paise >= 0),
    quantity            int         not null default 0 check (quantity >= 0),
    min_order_quantity  int         not null default 1 check (min_order_quantity >= 1),
    max_order_quantity  int check (max_order_quantity >= 1),
    is_featured         boolean     not null default false,
    is_customizable     boolean     not null default false,
    allow_bulk_orders   boolean     not null default true,
    weight_grams        int check (weight_grams >= 0),
    dimensions          text,
    material            text,
    color               text,
    -- One of the fixed colour families (catalog/ColourFamilies.kt), derived on write.
    color_family        text,
    size_guide          text,
    thumbnail           text,
    images              text[]      not null default '{}',
    video_url           text,
    -- Catalogue (Myntra template) attributes.
    article_type        text,
    style_group_id      text,
    colour_group_id     text,
    display_name        text,
    list_view_name      text,
    brand_colour        text,
    colour_hexes        jsonb,
    primary_colour      text,
    secondary_colour    text,
    tertiary_colour     text,
    age_group           text,
    fashion_type        text,
    usage               text,
    season              text,
    year                int,
    hsn                 text,
    countries_of_origin text[]      not null default '{}',
    manufacturer_details text,
    packer_details      text,
    importer_details    text,
    style_note          text,
    material_care       text,
    size_and_fit        text,
    tags                text[]      not null default '{}',
    measurement_basis   text,
    net_quantity        int,
    net_quantity_unit   text,
    number_of_items     text,
    multipack_set       text,
    package_contains    text,
    bis_certificate     jsonb,
    image_angles        jsonb,
    -- Category-field values, keyed by category_field.key.
    attributes          jsonb       not null default '{}',
    rating              numeric(3, 2) not null default 0,
    rating_count        int         not null default 0,
    review_count        int         not null default 0,
    meta_title          text,
    meta_description    text,
    meta_keywords       text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (seller_id, sku)
);
create index product_seller_idx on product (seller_id);
create index product_category_idx on product (category_id);
create index product_brand_idx on product (brand_id);
create index product_listing_idx on product (status, moderation_status);
create index product_article_type_idx on product (article_type);
create index product_colour_group_idx on product (colour_group_id);
create index product_style_group_idx on product (style_group_id);
create index product_color_family_idx on product (color_family);
create index product_name_trgm_idx on product using gin (name gin_trgm_ops);

create table product_variant (
    id            uuid primary key,
    product_id    uuid        not null references product (id) on delete cascade,
    -- Denormalised from product so row-level security needs no join.
    seller_id     uuid        not null references seller (id),
    name          text        not null,
    sku           text        not null,
    size          text,
    color         text,
    material      text,
    -- Overrides the product price when set.
    price_paise   bigint check (price_paise >= 0),
    quantity      int         not null default 0 check (quantity >= 0),
    standard_size text,
    size_on_label boolean,
    gtin          text,
    measurements  jsonb,
    options       jsonb,
    color_family  text,
    weight_grams  int check (weight_grams >= 0),
    images        text[]      not null default '{}',
    is_default    boolean     not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (seller_id, sku)
);
create index product_variant_product_idx on product_variant (product_id);
create index product_variant_color_family_idx on product_variant (color_family);

create table product_customization (
    id                 uuid primary key,
    product_id         uuid        not null references product (id) on delete cascade,
    name               text        not null,
    type               text        not null check (type in ('TEXT', 'COLOR', 'IMAGE', 'EMBROIDERY', 'PRINT')),
    is_required        boolean     not null default false,
    options            jsonb,
    additional_paise   bigint      not null default 0 check (additional_paise >= 0),
    max_characters     int,
    allowed_file_types text,
    max_file_kb        int,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create index product_customization_product_idx on product_customization (product_id);

-- Quantity breaks: from min_qty units the unit price is price_paise.
create table bulk_pricing (
    id          uuid primary key,
    product_id  uuid        not null references product (id) on delete cascade,
    min_qty     int         not null check (min_qty >= 2),
    max_qty     int check (max_qty >= min_qty),
    discount_bp int         not null default 0 check (discount_bp between 0 and 10000),
    price_paise bigint      not null check (price_paise >= 0),
    created_at  timestamptz not null default now(),
    unique (product_id, min_qty)
);

-- Every stock change, with why. Positive adds stock, negative removes it.
create table inventory_movement (
    id         uuid primary key,
    seller_id  uuid        not null references seller (id),
    product_id uuid        not null references product (id) on delete cascade,
    variant_id uuid references product_variant (id) on delete cascade,
    delta      int         not null,
    reason     text        not null check (reason in ('STOCK_IN', 'SALE', 'CANCEL', 'RETURN', 'ADJUSTMENT', 'RESERVE', 'RELEASE')),
    reference  text,
    note       text,
    created_by uuid,
    created_at timestamptz not null default now()
);
create index inventory_movement_product_idx on inventory_movement (product_id, created_at);

-- ---------------------------------------------------------------- row-level security
alter table product enable row level security;
create policy seller_isolation on product to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table product_variant enable row level security;
create policy seller_isolation on product_variant to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table inventory_movement enable row level security;
create policy seller_isolation on inventory_movement to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

alter table seller_brand enable row level security;
create policy seller_isolation on seller_brand to tailorae_seller_scope
    using (seller_id = current_setting('app.seller_id')::uuid);

-- Child tables without their own seller_id follow their product.
alter table bulk_pricing enable row level security;
create policy seller_isolation on bulk_pricing to tailorae_seller_scope
    using (exists (select 1 from product p where p.id = bulk_pricing.product_id));

alter table product_customization enable row level security;
create policy seller_isolation on product_customization to tailorae_seller_scope
    using (exists (select 1 from product p where p.id = product_customization.product_id));
