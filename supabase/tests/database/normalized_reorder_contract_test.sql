begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

select has_function(
  'public', 'reorder_order_into_cart', array['text'],
  'the public-order-number reorder contract should exist'
);
select is_definer(
  'public', 'reorder_order_into_cart', array['text'],
  'reorder should validate ownership inside one transaction'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.reorder_order_into_cart(text)', 'EXECUTE'
  ),
  'authenticated buyers should be able to reorder'
);
select ok(
  not has_function_privilege(
    'anon', 'public.reorder_order_into_cart(text)', 'EXECUTE'
  ),
  'anonymous callers should not reorder'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, created_at,
  updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'normalized-reorder@example.test', '',
    now(), now(), '{}'::jsonb, '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'other-reorder@example.test', '',
    now(), now(), '{}'::jsonb, '{}'::jsonb
  );

insert into public.products (id, name, price, listing_type)
values
  ('b1000000-0000-4000-8000-000000000001', 'Customized item', 25, 'sale'),
  ('b2000000-0000-4000-8000-000000000002', 'Rental item', 40, 'rental'),
  ('b3000000-0000-4000-8000-000000000003', 'Removed item', 15, 'sale');

insert into public.orders (buyer_id, amount, order_number)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    80, '20261006120000-ABCDEF-00000001'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    25, '20261006120001-ABCDEF-00000002'
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    15, '20261006120002-ABCDEF-00000003'
  );

insert into public.order_items (
  order_id, line_number, product_id, item_type, product_name, quantity,
  unit_amount, line_amount, size, customization, rental_start_date,
  rental_end_date, product_snapshot
)
values
  (
    (select id from public.orders where order_number = '20261006120000-ABCDEF-00000001'),
    1, 'b1000000-0000-4000-8000-000000000001', 'purchase',
    'Customized item', 2, 25, 50, 'M',
    '{"id":"custom-1","lines":["HELLO"]}'::jsonb,
    null, null, '{}'::jsonb
  ),
  (
    (select id from public.orders where order_number = '20261006120000-ABCDEF-00000001'),
    2, 'b2000000-0000-4000-8000-000000000002', 'rental',
    'Rental item', 1, 40, 40, null, null,
    '2026-10-10', '2026-10-12',
    '{"rentInfo":{"deposit":100}}'::jsonb
  ),
  (
    (select id from public.orders where order_number = '20261006120000-ABCDEF-00000001'),
    3, 'b3000000-0000-4000-8000-000000000003', 'purchase',
    'Removed item', 1, 15, 15, 'L', null, null, null, '{}'::jsonb
  ),
  (
    (select id from public.orders where order_number = '20261006120002-ABCDEF-00000003'),
    1, 'b3000000-0000-4000-8000-000000000003', 'purchase',
    'Removed item', 1, 15, 15, 'L', null, null, null, '{}'::jsonb
  );

delete from public.products
where id = 'b3000000-0000-4000-8000-000000000003';

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select set_config(
  'test.normalized_reorder_result',
  public.reorder_order_into_cart(
    '20261006120000-abcdef-00000001'
  )::text,
  true
);

reset role;

select is(
  current_setting('test.normalized_reorder_result')::jsonb ->> 'source',
  'order_items',
  'reorder should use normalized order items only'
);
select is(
  (current_setting('test.normalized_reorder_result')::jsonb ->> 'added_line_count')::integer,
  2,
  'available normalized lines should be added'
);
select is(
  (current_setting('test.normalized_reorder_result')::jsonb ->> 'skipped_line_count')::integer,
  1,
  'a removed catalog product should be skipped'
);
select is(
  (
    select count(*) from public.cart_items
    where user_id = 'a1000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'normalized reorder should create two cart lines'
);
select is(
  (
    select customization #>> '{lines,0}' from public.cart_items
    where line_key = 'b1000000-0000-4000-8000-000000000001:M|custom:custom-1'
  ),
  'HELLO',
  'customization snapshots should be preserved'
);
select is(
  (
    select rental_quote ->> 'deposit' from public.cart_items
    where line_key = 'b2000000-0000-4000-8000-000000000002:rent_2026-10-10_to_2026-10-12'
  ),
  '100',
  'rental quote metadata should be preserved'
);

set local role authenticated;
select lives_ok(
  $$select public.reorder_order_into_cart('20261006120000-ABCDEF-00000001')$$,
  'a repeated reorder should remain atomic'
);
reset role;

select is(
  (
    select quantity from public.cart_items
    where line_key = 'b1000000-0000-4000-8000-000000000001:M|custom:custom-1'
  ),
  4,
  'a repeated reorder should add the purchase quantity once more'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_like(
  $$select public.reorder_order_into_cart('20261006120000-ABCDEF-00000001')$$,
  '%Order not found%',
  'a different buyer should not access the order'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_like(
  $$select public.reorder_order_into_cart('invalid')$$,
  '%A valid order number is required%',
  'invalid public order numbers should be rejected'
);
select throws_like(
  $$select public.reorder_order_into_cart('20261006120002-ABCDEF-00000003')$$,
  '%No reorderable items%',
  'an order with only removed products should not create an empty cart change'
);

reset role;

select * from finish();

rollback;
