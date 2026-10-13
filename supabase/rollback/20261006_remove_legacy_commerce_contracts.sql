-- Emergency data rollback for 20261006130000_remove_legacy_commerce_contracts.sql.
-- Run only after stopping writes and before deleting migration_archive snapshots.

begin;

alter table public.carts add column items jsonb not null default '{}'::jsonb;

alter table public.orders
  add column items jsonb not null default '[]'::jsonb,
  add column user_id text,
  add column seller_id text,
  add column order_id text,
  add column rent_fee numeric,
  add column deposit numeric,
  add column label_out_url text,
  add column label_return_url text,
  add column tracking_out text,
  add column tracking_return text,
  add column shipping_tracking_number text,
  add column shipping_tracking_url text,
  add column shipping_provider text,
  add column shipping_carrier text,
  add column shipping_service text,
  add column shipping_rate_amount numeric,
  add column shipping_rate_currency text,
  add column shipping_label_url text,
  add column shipping_transaction_id text,
  add column shipping_rate_id text;

update public.carts as target
set items = archive.items
from migration_archive.carts_legacy_20261006 as archive
where target.id = archive.id;

update public.orders as target
set items = archive.items,
    user_id = archive.user_id,
    seller_id = archive.seller_id,
    order_id = archive.order_id,
    rent_fee = archive.rent_fee,
    deposit = archive.deposit,
    label_out_url = archive.label_out_url,
    label_return_url = archive.label_return_url,
    tracking_out = archive.tracking_out,
    tracking_return = archive.tracking_return,
    shipping_tracking_number = archive.shipping_tracking_number,
    shipping_tracking_url = archive.shipping_tracking_url,
    shipping_provider = archive.shipping_provider,
    shipping_carrier = archive.shipping_carrier,
    shipping_service = archive.shipping_service,
    shipping_rate_amount = archive.shipping_rate_amount,
    shipping_rate_currency = archive.shipping_rate_currency,
    shipping_label_url = archive.shipping_label_url,
    shipping_transaction_id = archive.shipping_transaction_id,
    shipping_rate_id = archive.shipping_rate_id
from migration_archive.orders_legacy_20261006 as archive
where target.id = archive.id;

create table public.users
  (like migration_archive.users_legacy_20261006 including all);
insert into public.users overriding system value
select * from migration_archive.users_legacy_20261006;

create table public.customizations
  (like migration_archive.customizations_legacy_20261006 including all);
insert into public.customizations overriding system value
select * from migration_archive.customizations_legacy_20261006;

create table public.order_email_events
  (like migration_archive.order_email_events_legacy_20261006 including all);
insert into public.order_email_events overriding system value
select * from migration_archive.order_email_events_legacy_20261006;

-- Restore the legacy functions and RLS definitions from migrations
-- 20260908143000 through 20260915160000 before reopening application writes.

commit;
