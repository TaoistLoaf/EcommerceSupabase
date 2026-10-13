-- Contract phase: run only after the canonical application release is live and
-- the 20261006140000 verification report returns zero rows.

begin;

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
    select 1 from public.lend_items as legacy
    where legacy.id::text = review.product_id
  );

do $$
begin
  if exists (
    select 1
    from public.lend_items as legacy
    left join public.products as product
      on product.id = md5('legacy-lend-item:' || legacy.id::text)::uuid
    where product.id is null
  ) then
    raise exception 'Legacy rental listings are not fully migrated';
  end if;

  if exists (select 1 from public.reviews where product_uuid is null) then
    raise exception 'Reviews still contain unresolved legacy product identifiers';
  end if;

  if exists (
    select 1
    from public.requests as request
    left join (
      select request_id, count(*)::bigint as total
      from public.request_likes
      group by request_id
    ) as counts on counts.request_id = request.id
    where request.like_count <> coalesce(counts.total, 0)
  ) then
    raise exception 'Request like counts are not reconciled';
  end if;
end
$$;

alter table public.reviews alter column product_uuid set not null;

create or replace function public.sync_request_like_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    update public.requests
    set like_count = like_count + 1
    where id = new.request_id;
    return new;
  end if;

  update public.requests
  set like_count = greatest(like_count - 1, 0)
  where id = old.request_id;
  return old;
end
$$;

drop policy if exists "Authenticated users can maintain request like counts" on public.requests;

drop table public.lend_items;
drop function public.sync_legacy_lend_item_to_product();
alter table public.products drop column rentable;
alter table public.reviews drop column product_id;
alter table public.requests drop column likes;
alter table public.orders drop column date;

create or replace function public.set_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.order_number is not null
    and new.order_number is distinct from old.order_number then
    raise exception 'Order number is immutable' using errcode = '22023';
  end if;

  if new.order_number is null or trim(new.order_number) = '' then
    new.order_number := public.format_order_number(
      coalesce(new.created_at, now()),
      new.id
    );
  end if;
  return new;
end;
$$;

commit;
