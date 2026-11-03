-- Catalog, part 2: storefront search and the indexes the storefront reads by.
--
-- Search is Postgres full text (a weighted tsvector kept on the product row by
-- a trigger) ranked together with pg_trgm similarity on the name, so a typo
-- ("polp") still finds the polo when nothing matches literally.

-- ---------------------------------------------------------------- search document
alter table product add column search_vector tsvector not null default ''::tsvector;

-- The words a shopper describes a product with, most telling first:
-- A name and article number, B brand and category, C listing attributes,
-- D the descriptions every garment shares words with.
create or replace function product_search_document(p product) returns tsvector
    language sql stable
as $$
    select
        setweight(to_tsvector('english', coalesce(p.name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(p.sku, '')), 'A') ||
        setweight(to_tsvector('english', coalesce((select b.name from brand b where b.id = p.brand_id), '')), 'B') ||
        setweight(to_tsvector('english', coalesce((select c.name from category c where c.id = p.category_id), '')), 'B') ||
        setweight(to_tsvector('english', concat_ws(' ', p.display_name, p.article_type, p.color, p.primary_colour,
            p.brand_colour, p.material, p.age_group, array_to_string(p.tags, ' '))), 'C') ||
        setweight(to_tsvector('english', concat_ws(' ', p.short_description, p.description)), 'D')
$$;

create or replace function product_search_refresh() returns trigger
    language plpgsql
as $$
begin
    new.search_vector := product_search_document(new);
    return new;
end
$$;

-- Only the columns the document reads: a stock or price change does not re-index.
create trigger product_search_refresh
    before insert or update of name, sku, brand_id, category_id, display_name, article_type, color, primary_colour,
        brand_colour, material, age_group, tags, short_description, description
    on product
    for each row execute function product_search_refresh();

-- A renamed brand or category re-indexes the products filed under it.
create or replace function product_search_follow_name() returns trigger
    language plpgsql
as $$
begin
    if new.name is distinct from old.name then
        if tg_table_name = 'brand' then
            update product p set search_vector = product_search_document(p) where p.brand_id = new.id;
        else
            update product p set search_vector = product_search_document(p) where p.category_id = new.id;
        end if;
    end if;
    return new;
end
$$;

create trigger brand_search_follow_name after update of name on brand
    for each row execute function product_search_follow_name();
create trigger category_search_follow_name after update of name on category
    for each row execute function product_search_follow_name();

create index product_search_idx on product using gin (search_vector);
create index product_sku_trgm_idx on product using gin (lower(sku) gin_trgm_ops);
create index product_variant_sku_lower_idx on product_variant (lower(sku));

-- What a shopper can see, newest first: the default listing order.
create index product_storefront_idx on product (created_at desc)
    where status = 'ACTIVE' and moderation_status = 'APPROVED';
create index product_variant_size_idx on product_variant (lower(size));

-- ---------------------------------------------------------------- slugs across sellers
-- Product slugs are global URLs, but a seller-scope transaction only sees its
-- own products, so it cannot tell whether another shop already uses a slug.
-- This answers that one yes/no question without exposing anything else.
create or replace function product_slug_taken(candidate text) returns boolean
    language sql stable security definer
    set search_path = public
as $$
    select exists (select 1 from product where slug = candidate)
$$;
revoke all on function product_slug_taken(text) from public;
grant execute on function product_slug_taken(text) to tailorae_seller_scope;
