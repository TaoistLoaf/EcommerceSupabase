begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

select hasnt_table('public', 'lend_items', 'rental listings no longer use a duplicate table');
select has_column('public', 'products', 'listing_type', 'products identify sale and rental listings');
select has_column('public', 'products', 'catalog_section', 'products retain their existing storefront section');
select has_column('public', 'products', 'replacement_value', 'rental replacement value is stored on products');
select has_column('public', 'products', 'max_rental_days', 'rental duration is stored on products');
select hasnt_column('public', 'products', 'rentable', 'the duplicate rental flag is removed');
select col_not_null('public', 'products', 'listing_type', 'every listing has a type');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_listing_type_valid'
      and contype = 'c'
  ),
  'listing types are constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_catalog_section_valid'
      and contype = 'c'
  ),
  'catalog sections are constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_service_listing_valid'
      and contype = 'c'
  ),
  'service-section rows must remain rental listings'
);

select has_column('public', 'reviews', 'product_uuid', 'reviews use the UUID product key');
select col_not_null('public', 'reviews', 'product_uuid', 'review product ownership is required');
select hasnt_column('public', 'reviews', 'product_id', 'the text product identifier is removed');

select has_column('public', 'requests', 'like_count', 'requests expose a database-managed count');
select hasnt_column('public', 'requests', 'likes', 'the client-maintained count is removed');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.request_likes'::regclass
      and conname = 'request_likes_request_id_user_id_key'
      and contype = 'u'
  ),
  'one user can like a request once'
);
select has_trigger('public', 'request_likes', 'sync_request_like_count', 'like rows maintain the projected count');

select has_column('public', 'banner', 'scope', 'banners identify platform or seller ownership');
select has_column('public', 'banner', 'seller_id', 'seller banners have an explicit owner');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.banner'::regclass
      and conname = 'banner_scope_owner_valid'
      and contype = 'c'
  ),
  'banner scope and owner stay consistent'
);

select hasnt_column('public', 'orders', 'date', 'orders use created_at as the single creation timestamp');
select has_table('migration_archive', 'lend_items_legacy_20261006', 'legacy rentals are archived for rollback');
select has_table('migration_archive', 'reviews_legacy_20261006', 'legacy review identifiers are archived');
select has_table('migration_archive', 'request_counts_legacy_20261006', 'legacy like counters are archived');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  'ee000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'catalog-test@example.test', '', now(), now(),
  '{}'::jsonb, '{}'::jsonb
);

insert into public.requests (id, item_name)
values ('ee000000-0000-4000-8000-000000000002', 'Test request');

insert into public.request_likes (request_id, user_id)
values (
  'ee000000-0000-4000-8000-000000000002',
  'ee000000-0000-4000-8000-000000000001'
);

select is(
  (select like_count from public.requests where id = 'ee000000-0000-4000-8000-000000000002'),
  1::bigint,
  'inserting a like increments the database-owned count'
);

select throws_ok(
  $$
    insert into public.request_likes (request_id, user_id)
    values (
      'ee000000-0000-4000-8000-000000000002',
      'ee000000-0000-4000-8000-000000000001'
    )
  $$,
  '23505',
  null,
  'the same user cannot like one request twice'
);

delete from public.request_likes
where request_id = 'ee000000-0000-4000-8000-000000000002'
  and user_id = 'ee000000-0000-4000-8000-000000000001';

select is(
  (select like_count from public.requests where id = 'ee000000-0000-4000-8000-000000000002'),
  0::bigint,
  'deleting a like decrements the database-owned count'
);

select throws_ok(
  $$insert into public.products (name, listing_type) values ('Invalid', 'service')$$,
  '23514',
  null,
  'unknown listing types are rejected'
);

select throws_ok(
  $$insert into public.products (name, catalog_section) values ('Invalid', 'other')$$,
  '23514',
  null,
  'unknown catalog sections are rejected'
);

select * from finish();
rollback;
