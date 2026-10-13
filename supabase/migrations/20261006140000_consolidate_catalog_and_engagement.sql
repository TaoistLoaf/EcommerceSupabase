-- Expand phase: add and backfill the canonical catalog and engagement contract
-- while legacy readers and writers remain available during application rollout.

begin;

create schema if not exists migration_archive;
revoke all on schema migration_archive from public, anon, authenticated;

create table if not exists migration_archive.lend_items_legacy_20261006
as table public.lend_items with data;
create table if not exists migration_archive.reviews_legacy_20261006
as table public.reviews with data;
create table if not exists migration_archive.request_counts_legacy_20261006
as select id, likes from public.requests;
create table if not exists migration_archive.order_dates_legacy_20261006
as select id, date from public.orders;

revoke all on all tables in schema migration_archive from public, anon, authenticated;

-- Preserve the timestamp customers previously saw before readers move from
-- orders.date to the canonical orders.created_at column.
update public.orders
set created_at = date
where date is not null
  and created_at is distinct from date;

alter table public.products
  add column if not exists listing_type text not null default 'sale',
  add column if not exists catalog_section text not null default 'products',
  add column if not exists replacement_value numeric(12, 2),
  add column if not exists max_rental_days integer,
  add column if not exists available_from date,
  add column if not exists available_to date;

update public.products
set listing_type = case when rentable then 'rental' else 'sale' end,
    catalog_section = 'products';

do $$
begin
  if exists (
    select 1
    from public.lend_items as legacy
    join public.products as product
      on product.id = md5('legacy-lend-item:' || legacy.id::text)::uuid
  ) then
    raise exception 'A generated rental product UUID collides with an existing product';
  end if;
end
$$;

insert into public.products (
  id, seller_id, name, description, price, category, bestseller, sizes, images,
  created_at, stock, is_customizable, listing_type, catalog_section,
  replacement_value,
  max_rental_days, available_from, available_to
)
select
  md5('legacy-lend-item:' || id::text)::uuid,
  seller_id,
  name,
  description,
  price_per_day,
  category,
  false,
  '{}'::text[],
  image_urls,
  created_at,
  stock,
  false,
  'rental',
  'services',
  estimated_value,
  max_rental_days,
  available_from,
  available_to
from public.lend_items;

create or replace function public.sync_legacy_lend_item_to_product()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  canonical_id uuid;
begin
  if tg_op = 'DELETE' then
    canonical_id := md5('legacy-lend-item:' || old.id::text)::uuid;
    delete from public.products where id = canonical_id;
    return old;
  end if;

  canonical_id := md5('legacy-lend-item:' || new.id::text)::uuid;

  insert into public.products (
    id, seller_id, name, description, price, category, bestseller, sizes, images,
    created_at, stock, is_customizable, listing_type, catalog_section,
    replacement_value,
    max_rental_days, available_from, available_to
  ) values (
    canonical_id, new.seller_id, new.name, new.description, new.price_per_day,
    new.category, false, '{}'::text[], new.image_urls, new.created_at, new.stock,
    false, 'rental', 'services', new.estimated_value, new.max_rental_days,
    new.available_from, new.available_to
  )
  on conflict (id) do update set
    seller_id = excluded.seller_id,
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    category = excluded.category,
    images = excluded.images,
    stock = excluded.stock,
    listing_type = 'rental',
    catalog_section = 'services',
    replacement_value = excluded.replacement_value,
    max_rental_days = excluded.max_rental_days,
    available_from = excluded.available_from,
    available_to = excluded.available_to;
  return new;
end
$$;

revoke all on function public.sync_legacy_lend_item_to_product() from public;
drop trigger if exists sync_legacy_lend_item_to_product on public.lend_items;
create trigger sync_legacy_lend_item_to_product
after insert or update or delete on public.lend_items
for each row execute function public.sync_legacy_lend_item_to_product();

update public.reviews as review
set product_uuid = product.id
from public.products as product
where review.product_uuid is null
  and review.product_id = product.id::text;

update public.reviews as review
set product_uuid = md5('legacy-lend-item:' || review.product_id)::uuid
where review.product_uuid is null
  and review.product_id ~ '^[0-9]+$'
  and exists (
    select 1
    from migration_archive.lend_items_legacy_20261006 as legacy
    where legacy.id::text = review.product_id
  );

alter table public.reviews
  validate constraint reviews_product_uuid_fkey;

delete from public.request_likes as duplicate
using public.request_likes as keeper
where duplicate.request_id = keeper.request_id
  and duplicate.user_id = keeper.user_id
  and (
    duplicate.created_at > keeper.created_at
    or (duplicate.created_at = keeper.created_at and duplicate.id > keeper.id)
  );

alter table public.request_likes
  add constraint request_likes_request_id_user_id_key unique (request_id, user_id);
drop index if exists public.idx_request_likes_request_user;

alter table public.requests
  add column if not exists like_count bigint not null default 0;

update public.requests as request
set like_count = counts.total
from (
  select request_id, count(*)::bigint as total
  from public.request_likes
  group by request_id
) as counts
where counts.request_id = request.id;

create or replace function public.sync_request_like_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    update public.requests
    set like_count = like_count + 1,
        likes = likes + 1
    where id = new.request_id;
    return new;
  end if;

  update public.requests
  set like_count = greatest(like_count - 1, 0),
      likes = greatest(likes - 1, 0)
  where id = old.request_id;
  return old;
end
$$;

revoke all on function public.sync_request_like_count() from public;

drop trigger if exists sync_request_like_count on public.request_likes;
create trigger sync_request_like_count
after insert or delete on public.request_likes
for each row execute function public.sync_request_like_count();

alter table public.banner
  add column if not exists scope text not null default 'platform',
  add column if not exists seller_id uuid references auth.users (id) on delete cascade;

update public.banner set scope = 'platform', seller_id = null;

alter table public.banner
  add constraint banner_scope_valid
    check (scope in ('platform', 'seller')),
  add constraint banner_scope_owner_valid
    check (
      (scope = 'platform' and seller_id is null)
      or (scope = 'seller' and seller_id is not null)
    );

create index if not exists idx_banner_scope_seller_active_updated
  on public.banner (scope, seller_id, active, updated_at desc);

drop policy if exists "Sellers can create their own banners" on public.banner;
create policy "Sellers can create their own banners"
  on public.banner for insert to authenticated
  with check (
    scope = 'seller'
    and seller_id = auth.uid()
    and created_by = auth.uid()
  );

drop policy if exists "Sellers can update their own banners" on public.banner;
create policy "Sellers can update their own banners"
  on public.banner for update to authenticated
  using (scope = 'seller' and seller_id = auth.uid())
  with check (scope = 'seller' and seller_id = auth.uid());

drop policy if exists "Sellers can delete their own banners" on public.banner;
create policy "Sellers can delete their own banners"
  on public.banner for delete to authenticated
  using (scope = 'seller' and seller_id = auth.uid());

alter table public.products
  add constraint products_listing_type_valid
    check (listing_type in ('sale', 'rental')),
  add constraint products_catalog_section_valid
    check (catalog_section in ('products', 'services')),
  add constraint products_service_listing_valid
    check (catalog_section <> 'services' or listing_type = 'rental'),
  add constraint products_rental_fields_valid
    check (
      replacement_value is null or replacement_value >= 0
    ),
  add constraint products_rental_window_valid
    check (
      (max_rental_days is null or max_rental_days > 0)
      and (available_to is null or available_from is null or available_to >= available_from)
    );

create index if not exists idx_products_seller_listing_created
  on public.products (seller_id, catalog_section, listing_type, created_at desc);

comment on column public.products.listing_type is
  'Canonical listing kind. Rental terms live on the same product row.';
comment on column public.products.catalog_section is
  'Presentation grouping retained during lend_items consolidation.';
comment on column public.requests.like_count is
  'Database-maintained projection of request_likes; clients cannot update it directly.';
comment on column public.banner.scope is
  'Platform banners have no seller_id; seller banners belong to exactly one seller.';

commit;
