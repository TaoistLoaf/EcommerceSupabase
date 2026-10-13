-- Every query must return zero before deploying the destructive cutover.

select 'orders_without_buyer' as check_name, count(*) as failures
from public.orders where buyer_id is null;

select 'order_line_count_mismatch' as check_name, count(*) as failures
from public.orders as orders
where jsonb_typeof(orders.items) = 'array'
  and jsonb_array_length(orders.items) > 0
  and (select count(*) from public.order_items where order_id = orders.id)
    <> jsonb_array_length(orders.items);

select 'order_items_without_seller' as check_name, count(*) as failures
from public.order_items where seller_id is null;

select 'missing_seller_fulfillments' as check_name, count(*) as failures
from public.order_items as order_items
where not exists (
  select 1 from public.seller_fulfillments
  where order_id = order_items.order_id
    and seller_id = order_items.seller_id
);

select 'legacy_carts_without_normalized_lines' as check_name, count(*) as failures
from public.carts as carts
where carts.items <> '{}'::jsonb
  and not exists (select 1 from public.cart_items where cart_id = carts.id);

select 'multi_seller_orders_with_shared_shipping' as check_name, count(*) as failures
from public.orders as orders
where coalesce(
  orders.shipping_tracking_number,
  orders.shipping_tracking_url,
  orders.shipping_label_url,
  orders.shipping_transaction_id
) is not null
and 1 < (
  select count(distinct seller_id)
  from public.order_items where order_id = orders.id
);
