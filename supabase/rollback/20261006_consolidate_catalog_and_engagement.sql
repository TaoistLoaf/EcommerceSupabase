-- Compatibility rollback for migration 20261006140000.
-- This restores legacy read/write surfaces from restricted archive snapshots.
-- It intentionally preserves canonical products created after the cutover.

begin;

alter table public.products
  add column if not exists rentable boolean not null default false;
update public.products
set rentable = listing_type = 'rental';

create table if not exists public.lend_items (
  id bigint generated always as identity primary key,
  seller_id uuid references auth.users (id) on delete set null,
  name text not null,
  description text,
  category text,
  image_urls text[] not null default '{}',
  estimated_value numeric(12, 2),
  price_per_day numeric(12, 2) not null,
  max_rental_days integer not null default 30,
  stock integer not null default 1,
  available_from date,
  available_to date,
  created_at timestamptz not null default now()
);
insert into public.lend_items
overriding system value
select * from migration_archive.lend_items_legacy_20261006
on conflict (id) do nothing;

select setval(
  pg_get_serial_sequence('public.lend_items', 'id'),
  coalesce((select max(id) from public.lend_items), 1),
  exists (select 1 from public.lend_items)
);

alter table public.lend_items enable row level security;
create policy "Lend items are public"
  on public.lend_items for select to anon, authenticated using (true);
create policy "Sellers can create their own lend items"
  on public.lend_items for insert to authenticated
  with check (seller_id = auth.uid());
create policy "Sellers can update their own lend items"
  on public.lend_items for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy "Sellers can delete their own lend items"
  on public.lend_items for delete to authenticated
  using (seller_id = auth.uid());

alter table public.reviews add column if not exists product_id text;
update public.reviews set product_id = product_uuid::text where product_id is null;
alter table public.reviews alter column product_id set not null;

alter table public.requests add column if not exists likes bigint not null default 0;
update public.requests as request
set likes = archived.likes
from migration_archive.request_counts_legacy_20261006 as archived
where archived.id = request.id;

alter table public.orders add column if not exists date timestamptz;
update public.orders as orders
set date = coalesce(archived.date, orders.created_at)
from migration_archive.order_dates_legacy_20261006 as archived
where archived.id = orders.id;
update public.orders set date = created_at where date is null;
alter table public.orders alter column date set not null;

commit;
