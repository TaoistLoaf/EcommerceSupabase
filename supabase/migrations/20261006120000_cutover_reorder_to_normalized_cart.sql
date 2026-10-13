-- Add a normalized-only reorder contract. The bigint overload remains for one
-- compatibility window and is removed by a later contract migration.

create or replace function public.reorder_order_into_cart(p_order_number text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_order_number text := upper(trim(coalesce(p_order_number, '')));
  target_order_id bigint;
  current_cart_id uuid;
  order_line record;
  cart_line_key text;
  customization_id text;
  line_rental_quote jsonb;
  added_line_count integer := 0;
  skipped_line_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if normalized_order_number !~ '^[0-9]{14}-[A-F0-9]{6}-[0-9]{8,}$' then
    raise exception 'A valid order number is required' using errcode = '22023';
  end if;

  select customer_order.id
  into target_order_id
  from public.orders as customer_order
  where customer_order.order_number = normalized_order_number
    and customer_order.buyer_id = current_user_id;

  if target_order_id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.order_items where order_id = target_order_id
  ) then
    raise exception 'Order items are not normalized' using errcode = '55000';
  end if;

  insert into public.carts (user_id, updated_at)
  values (current_user_id, now())
  on conflict (user_id) do update set updated_at = now()
  returning id into current_cart_id;

  for order_line in
    select order_item.*
    from public.order_items as order_item
    where order_item.order_id = target_order_id
    order by order_item.line_number
  loop
    if order_line.product_id is null
      or not exists (
        select 1 from public.products as product
        where product.id = order_line.product_id
      ) then
      skipped_line_count := skipped_line_count + 1;
      continue;
    end if;

    customization_id := nullif(
      trim(coalesce(order_line.customization ->> 'id', '')),
      ''
    );
    line_rental_quote := case
      when order_line.item_type = 'rental' then
        case
          when jsonb_typeof(order_line.product_snapshot -> 'rentInfo') = 'object'
            then order_line.product_snapshot -> 'rentInfo'
          else '{}'::jsonb
        end
        || jsonb_strip_nulls(
          jsonb_build_object(
            'startDate', order_line.rental_start_date,
            'endDate', order_line.rental_end_date,
            'rentFee', order_line.line_amount,
            'totalPrice', order_line.line_amount
          )
        )
      else null
    end;

    cart_line_key := order_line.product_id::text || ':' || case
      when order_line.item_type = 'rental'
        and order_line.rental_start_date is not null
        and order_line.rental_end_date is not null
        then 'rent_' || order_line.rental_start_date::text
          || '_to_' || order_line.rental_end_date::text
      when customization_id is not null
        then coalesce(order_line.size, 'One Size')
          || '|custom:' || customization_id
      else coalesce(order_line.size, 'One Size')
    end;

    insert into public.cart_items (
      cart_id, user_id, line_key, product_id, quantity, size, customization,
      rental_start_date, rental_end_date, rental_quote
    )
    values (
      current_cart_id,
      current_user_id,
      cart_line_key,
      order_line.product_id,
      order_line.quantity,
      case when order_line.item_type = 'rental' then null else order_line.size end,
      order_line.customization,
      order_line.rental_start_date,
      order_line.rental_end_date,
      line_rental_quote
    )
    on conflict (cart_id, line_key) do update
    set
      quantity = public.cart_items.quantity + excluded.quantity,
      product_id = excluded.product_id,
      size = excluded.size,
      customization = excluded.customization,
      rental_start_date = excluded.rental_start_date,
      rental_end_date = excluded.rental_end_date,
      rental_quote = excluded.rental_quote,
      updated_at = now();

    added_line_count := added_line_count + 1;
  end loop;

  if added_line_count = 0 then
    raise exception 'No reorderable items' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'cart_id', current_cart_id,
    'order_number', normalized_order_number,
    'source', 'order_items',
    'added_line_count', added_line_count,
    'skipped_line_count', skipped_line_count
  );
end;
$$;

comment on function public.reorder_order_into_cart(text) is
  'Atomically merges normalized order_items into cart_items using an owned public order number.';

revoke all on function public.reorder_order_into_cart(text) from public, anon;
grant execute on function public.reorder_order_into_cart(text)
  to authenticated, service_role;
