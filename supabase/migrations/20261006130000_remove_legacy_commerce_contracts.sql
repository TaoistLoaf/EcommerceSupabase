-- Finalize the relational commerce cutover. This migration intentionally fails
-- closed if production data has not been reconciled into the canonical tables.

do $$
begin
  if exists (select 1 from public.orders where buyer_id is null) then
    raise exception 'Cutover blocked: orders.buyer_id still contains null values';
  end if;

  if exists (
    select 1
    from public.orders as orders
    where jsonb_typeof(orders.items) = 'array'
      and jsonb_array_length(orders.items) > 0
      and (
        select count(*) from public.order_items where order_id = orders.id
      ) <> jsonb_array_length(orders.items)
  ) then
    raise exception 'Cutover blocked: legacy order lines are not fully reconciled';
  end if;

  if exists (
    select 1
    from public.carts as carts
    where carts.items <> '{}'::jsonb
      and (select count(*) from public.cart_items where cart_id = carts.id) <>
        case jsonb_typeof(carts.items)
          when 'array' then jsonb_array_length(carts.items)
          when 'object' then (
            select count(*)
            from jsonb_each(carts.items) as product_entry
            cross join lateral jsonb_each(
              case when jsonb_typeof(product_entry.value) = 'object'
                then product_entry.value else '{}'::jsonb end
            )
          )
          else 0
        end
  ) then
    raise exception 'Cutover blocked: legacy cart lines are not fully reconciled';
  end if;

  if exists (select 1 from public.order_items where seller_id is null) then
    raise exception 'Cutover blocked: order items still have no canonical seller';
  end if;

  if exists (
    select 1
    from public.order_items as order_items
    where not exists (
      select 1
      from public.seller_fulfillments
      where order_id = order_items.order_id
        and seller_id = order_items.seller_id
    )
  ) then
    raise exception 'Cutover blocked: seller fulfillment rows are incomplete';
  end if;

  if exists (
    select 1
    from public.orders as orders
    where coalesce(
      orders.shipping_tracking_number,
      orders.shipping_tracking_url,
      orders.shipping_provider,
      orders.shipping_carrier,
      orders.shipping_service,
      orders.shipping_label_url,
      orders.shipping_transaction_id,
      orders.shipping_rate_id,
      orders.tracking_out,
      orders.tracking_return,
      orders.label_out_url,
      orders.label_return_url
    ) is not null
      and not exists (
        select 1
        from public.seller_fulfillments
        where order_id = orders.id
      )
  ) then
    raise exception 'Cutover blocked: legacy shipping data is not fully reconciled';
  end if;
end;
$$;

create schema if not exists migration_archive;
revoke all on schema migration_archive from public, anon, authenticated;
grant usage on schema migration_archive to service_role;

create table migration_archive.orders_legacy_20261006
  (like public.orders including all);
insert into migration_archive.orders_legacy_20261006 overriding system value
select * from public.orders;

create table migration_archive.carts_legacy_20261006
  (like public.carts including all);
insert into migration_archive.carts_legacy_20261006 overriding system value
select * from public.carts;

create table migration_archive.users_legacy_20261006
  (like public.users including all);
insert into migration_archive.users_legacy_20261006 overriding system value
select * from public.users;

create table migration_archive.customizations_legacy_20261006
  (like public.customizations including all);
insert into migration_archive.customizations_legacy_20261006 overriding system value
select * from public.customizations;

create table migration_archive.order_email_events_legacy_20261006
  (like public.order_email_events including all);
insert into migration_archive.order_email_events_legacy_20261006 overriding system value
select * from public.order_email_events;

revoke all on all tables in schema migration_archive from public, anon, authenticated;
grant select on all tables in schema migration_archive to service_role;

create or replace function public.sync_auth_user_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )), '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role, source)
  values (new.id, 'buyer', 'auth_trigger')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create or replace function public.seller_can_access_order(
  p_order_id bigint,
  p_seller_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_items
    where order_id = p_order_id
      and seller_id = p_seller_id
  );
$$;

create or replace function public.update_seller_fulfillment(
  p_order_id bigint,
  p_status text,
  p_tracking_number text default null,
  p_tracking_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_status text := lower(trim(coalesce(p_status, '')));
  aggregate_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if normalized_status not in (
    'pending', 'packing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'
  ) then
    raise exception 'Unsupported fulfillment status' using errcode = '22023';
  end if;
  if not public.seller_can_access_order(p_order_id, current_user_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  insert into public.seller_fulfillments (order_id, seller_id)
  select distinct order_id, seller_id
  from public.order_items
  where order_id = p_order_id and seller_id is not null
  on conflict (order_id, seller_id) do nothing;

  insert into public.seller_fulfillments (
    order_id, seller_id, status, tracking_number, tracking_url
  )
  values (
    p_order_id,
    current_user_id,
    normalized_status,
    nullif(trim(p_tracking_number), ''),
    nullif(trim(p_tracking_url), '')
  )
  on conflict (order_id, seller_id) do update
  set status = excluded.status,
      tracking_number = excluded.tracking_number,
      tracking_url = excluded.tracking_url,
      updated_at = now();

  select case
    when bool_and(status = 'cancelled') then 'Cancelled'
    when bool_and(status in ('delivered', 'cancelled')) then 'Delivered'
    when bool_or(status = 'out_for_delivery') then 'Out for delivery'
    when bool_or(status in ('shipped', 'delivered')) then 'Shipped'
    when bool_or(status = 'packing') then 'Packing'
    else 'Order Placed'
  end
  into aggregate_status
  from public.seller_fulfillments
  where order_id = p_order_id;

  update public.orders set status = aggregate_status where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'seller_id', current_user_id,
    'fulfillment_status', normalized_status,
    'order_status', aggregate_status
  );
end;
$$;

create or replace function public.record_seller_shippo_label(
  p_order_id bigint,
  p_purchase_token uuid,
  p_rate_id text,
  p_transaction_id text,
  p_carrier text default null,
  p_service text default null,
  p_rate_amount numeric default null,
  p_rate_currency text default 'USD',
  p_label_url text default null,
  p_tracking_number text default null,
  p_tracking_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_rate_id text := nullif(trim(p_rate_id), '');
  normalized_transaction_id text := nullif(trim(p_transaction_id), '');
  normalized_currency text := upper(nullif(trim(p_rate_currency), ''));
  aggregate_status text;
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_purchase_token is null then
    raise exception 'Purchase token is required' using errcode = '22023';
  end if;
  if normalized_rate_id is null or normalized_transaction_id is null then
    raise exception 'Shippo rate and transaction ids are required' using errcode = '22023';
  end if;
  if normalized_currency is null or normalized_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid shipping currency' using errcode = '22023';
  end if;
  if p_rate_amount is not null
    and (p_rate_amount < 0 or p_rate_amount = 'NaN'::numeric) then
    raise exception 'Invalid shipping rate amount' using errcode = '22023';
  end if;

  update public.seller_fulfillments
  set status = 'shipped',
      shipping_provider = 'shippo',
      shipping_carrier = nullif(trim(p_carrier), ''),
      shipping_service = nullif(trim(p_service), ''),
      shipping_rate_amount = p_rate_amount,
      shipping_rate_currency = normalized_currency,
      shipping_rate_id = normalized_rate_id,
      shipping_transaction_id = normalized_transaction_id,
      shipping_label_url = nullif(trim(p_label_url), ''),
      tracking_number = nullif(trim(p_tracking_number), ''),
      tracking_url = nullif(trim(p_tracking_url), ''),
      shipping_purchase_token = null,
      shipping_purchase_started_at = null,
      updated_at = now()
  where order_id = p_order_id
    and seller_id = current_user_id
    and shipping_purchase_token = p_purchase_token
    and shipping_transaction_id is null;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Shippo purchase reservation not found' using errcode = 'P0002';
  end if;

  select case
    when bool_and(status = 'cancelled') then 'Cancelled'
    when bool_and(status in ('delivered', 'cancelled')) then 'Delivered'
    when bool_or(status = 'out_for_delivery') then 'Out for delivery'
    when bool_or(status in ('shipped', 'delivered')) then 'Shipped'
    when bool_or(status = 'packing') then 'Packing'
    else 'Order Placed'
  end
  into aggregate_status
  from public.seller_fulfillments
  where order_id = p_order_id;

  update public.orders set status = aggregate_status where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'seller_id', current_user_id,
    'fulfillment_status', 'shipped',
    'order_status', aggregate_status,
    'transaction_id', normalized_transaction_id
  );
end;
$$;

create or replace function public.create_order_with_items(p_order jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  request_id uuid;
  existing_order_id bigint;
  created_order_id bigint;
  order_items_json jsonb := p_order -> 'items';
  order_address jsonb := p_order -> 'address';
  payment_method text := lower(trim(coalesce(p_order ->> 'paymentmethod', '')));
  currency text := lower(trim(coalesce(p_order ->> 'charge_currency', 'usd')));
  order_line record;
  line_product_id uuid;
  line_seller_id uuid;
  catalog_product_name text;
  line_quantity integer;
  line_unit_amount numeric(12, 2);
  line_item_type text;
  line_start_date date;
  line_end_date date;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  begin
    request_id := nullif(trim(p_order ->> 'checkout_request_id'), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'A valid checkout request id is required' using errcode = '22023';
  end;
  if request_id is null then
    raise exception 'A valid checkout request id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(order_items_json) <> 'array'
    or jsonb_array_length(order_items_json) = 0 then
    raise exception 'Order items must be a non-empty JSON array' using errcode = '22023';
  end if;
  if jsonb_typeof(order_address) <> 'object' then
    raise exception 'Order address must be a JSON object' using errcode = '22023';
  end if;
  if payment_method not in ('cod', 'stripe', 'googlepay', 'razorpay') then
    raise exception 'Unsupported payment method' using errcode = '22023';
  end if;
  if currency !~ '^[a-z]{3}$' then
    raise exception 'Order currency must be a three-letter code' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(request_id::text, 0)
  );
  select id into existing_order_id
  from public.orders
  where checkout_request_id = request_id and buyer_id = current_user_id;
  if existing_order_id is not null then return existing_order_id; end if;

  insert into public.orders (
    address, paymentmethod, payment, amount, status, buyer_id,
    rent_subtotal, purchase_subtotal, shipping_fee, deposit_total,
    deposit_currency, charge_currency, rent_breakdown, deposit_metadata,
    checkout_request_id
  ) values (
    order_address,
    payment_method,
    false,
    coalesce(nullif(trim(p_order ->> 'amount'), '')::numeric, 0),
    'Order Placed',
    current_user_id,
    coalesce(nullif(trim(p_order ->> 'rent_subtotal'), '')::numeric, 0),
    coalesce(nullif(trim(p_order ->> 'purchase_subtotal'), '')::numeric, 0),
    coalesce(nullif(trim(p_order ->> 'shipping_fee'), '')::numeric, 0),
    coalesce(nullif(trim(p_order ->> 'deposit_total'), '')::numeric, 0),
    lower(trim(coalesce(p_order ->> 'deposit_currency', 'usd'))),
    currency,
    case when jsonb_typeof(p_order -> 'rent_breakdown') = 'array'
      then p_order -> 'rent_breakdown' else '[]'::jsonb end,
    case when jsonb_typeof(p_order -> 'deposit_metadata') = 'object'
      then p_order -> 'deposit_metadata' else '{}'::jsonb end,
    request_id
  ) returning id into created_order_id;

  for order_line in
    select value as item, ordinality::integer as line_number
    from jsonb_array_elements(order_items_json) with ordinality
  loop
    begin
      line_product_id := nullif(trim(order_line.item ->> 'id'), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Order line % has an invalid product id', order_line.line_number
        using errcode = '22023';
    end;

    select name, seller_id into catalog_product_name, line_seller_id
    from public.products where id = line_product_id;
    if not found then
      raise exception 'Order line % references a missing product', order_line.line_number
        using errcode = '23503';
    end if;
    if exists (
      select 1 from public.seller_accounts
      where user_id = line_seller_id and status = 'suspended'
    ) then
      raise exception 'Order line % belongs to a suspended seller', order_line.line_number
        using errcode = '42501';
    end if;

    begin
      line_quantity := coalesce(nullif(trim(order_line.item ->> 'quantity'), ''), '1')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Order line % has an invalid quantity', order_line.line_number
        using errcode = '22023';
    end;
    if line_quantity < 1 then
      raise exception 'Order line % has an invalid quantity', order_line.line_number
        using errcode = '22023';
    end if;

    line_item_type := case
      when jsonb_typeof(order_line.item -> 'rentInfo') = 'object' then 'rental'
      else 'purchase'
    end;
    begin
      line_unit_amount := case when line_item_type = 'rental'
        then nullif(trim(order_line.item #>> '{rentInfo,totalPrice}'), '')::numeric
        else nullif(trim(order_line.item ->> 'price'), '')::numeric end;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Order line % has an invalid amount', order_line.line_number
        using errcode = '22023';
    end;
    if line_unit_amount is null or line_unit_amount < 0
      or line_unit_amount * line_quantity > 9999999999.99 then
      raise exception 'Order line % has an invalid amount', order_line.line_number
        using errcode = '22023';
    end if;

    begin
      line_start_date := left(order_line.item #>> '{rentInfo,startDate}', 10)::date;
      line_end_date := left(order_line.item #>> '{rentInfo,endDate}', 10)::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Order line % has invalid rental dates', order_line.line_number
        using errcode = '22023';
    end;

    insert into public.order_items (
      order_id, line_number, product_id, seller_id, item_type, product_name,
      quantity, unit_amount, line_amount, currency, size, customization,
      rental_start_date, rental_end_date, product_snapshot
    ) values (
      created_order_id,
      order_line.line_number,
      line_product_id,
      line_seller_id,
      line_item_type,
      coalesce(nullif(trim(order_line.item ->> 'name'), ''), catalog_product_name),
      line_quantity,
      line_unit_amount,
      case when line_item_type = 'rental' then line_unit_amount
        else line_unit_amount * line_quantity end,
      currency,
      nullif(trim(order_line.item ->> 'size'), ''),
      case when jsonb_typeof(order_line.item -> 'customization') = 'object'
        then order_line.item -> 'customization' end,
      line_start_date,
      line_end_date,
      order_line.item
    );
  end loop;

  insert into public.seller_fulfillments (order_id, seller_id)
  select distinct created_order_id, seller_id
  from public.order_items
  where order_id = created_order_id and seller_id is not null
  on conflict (order_id, seller_id) do nothing;

  return created_order_id;
end;
$$;

drop policy if exists "Buyers can view their own orders" on public.orders;
create policy "Buyers can view their own orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = buyer_id);

drop policy if exists "Buyers can create their own orders" on public.orders;
create policy "Buyers can create their own orders"
  on public.orders for insert to authenticated
  with check ((select auth.uid()) = buyer_id);

drop policy if exists "Buyers can view their order items" on public.order_items;
create policy "Buyers can view their order items"
  on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.buyer_id = (select auth.uid())
  ));

drop policy if exists "Buyers can view their fulfillments" on public.seller_fulfillments;
create policy "Buyers can view their fulfillments"
  on public.seller_fulfillments for select to authenticated
  using (exists (
    select 1 from public.orders
    where orders.id = seller_fulfillments.order_id
      and orders.buyer_id = (select auth.uid())
  ));

drop policy if exists "Buyers can view their payment status" on public.order_payments;
create policy "Buyers can view their payment status"
  on public.order_payments for select to authenticated
  using (exists (
    select 1 from public.orders
    where orders.id = order_payments.order_id
      and orders.buyer_id = (select auth.uid())
  ));

drop function if exists public.backfill_relational_data();
drop function if exists public.reorder_into_cart(bigint);
drop function if exists public.set_cart_line(uuid, text, integer, text, jsonb, date, date, jsonb, jsonb);

alter table public.carts drop column items;

alter table public.orders
  drop column items,
  drop column user_id,
  drop column seller_id,
  drop column order_id,
  drop column rent_fee,
  drop column deposit,
  drop column label_out_url,
  drop column label_return_url,
  drop column tracking_out,
  drop column tracking_return,
  drop column shipping_tracking_number,
  drop column shipping_tracking_url,
  drop column shipping_provider,
  drop column shipping_carrier,
  drop column shipping_service,
  drop column shipping_rate_amount,
  drop column shipping_rate_currency,
  drop column shipping_label_url,
  drop column shipping_transaction_id,
  drop column shipping_rate_id;

drop table public.customizations;
drop table public.order_email_events;
drop table public.users;

comment on schema migration_archive is
  'Restricted rollback snapshot created before the 2026-10-06 relational commerce contract cutover.';
