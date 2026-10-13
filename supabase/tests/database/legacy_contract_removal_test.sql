begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

select hasnt_table('public', 'users', 'the public Auth compatibility table is removed');
select hasnt_table('public', 'customizations', 'legacy customization rows are removed');
select hasnt_table('public', 'order_email_events', 'duplicate email event storage is removed');
select hasnt_column('public', 'carts', 'items', 'cart JSON snapshots are removed');
select hasnt_column('public', 'orders', 'items', 'order JSON snapshots are removed');
select hasnt_column('public', 'orders', 'user_id', 'legacy text buyer ids are removed');
select hasnt_column('public', 'orders', 'seller_id', 'shared order seller ids are removed');
select hasnt_column('public', 'orders', 'order_id', 'legacy public order ids are removed');
select hasnt_column('public', 'orders', 'shipping_tracking_number', 'shared tracking numbers are removed');
select hasnt_column('public', 'orders', 'shipping_label_url', 'shared shipping labels are removed');
select hasnt_function('public', 'backfill_relational_data', array[]::text[], 'one-time backfill API is removed');
select hasnt_function('public', 'reorder_into_cart', array['bigint'], 'internal-id reorder API is removed');
select hasnt_function(
  'public', 'set_cart_line',
  array['uuid', 'text', 'integer', 'text', 'jsonb', 'date', 'date', 'jsonb', 'jsonb'],
  'legacy cart write API is removed'
);
select has_table('public', 'order_items', 'normalized order lines remain');
select has_table('public', 'cart_items', 'normalized cart lines remain');
select has_table('public', 'seller_fulfillments', 'seller-scoped fulfillment remains');
select has_table('migration_archive', 'orders_legacy_20261006', 'restricted rollback data exists');

select * from finish();
rollback;
