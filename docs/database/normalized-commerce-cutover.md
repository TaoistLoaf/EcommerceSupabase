# Normalized commerce cutover

The final cutover moves all runtime reads and writes to the relational commerce
model:

- `orders.buyer_id` owns an order.
- `order_items` is the only order-line source.
- `carts` owns a cart and `cart_items` is the only cart-line source.
- `seller_fulfillments` owns seller-specific status, Shippo labels, and tracking.
- `profiles`, `user_roles`, and `seller_accounts` replace `public.users`.
- `email_events` replaces `order_email_events`.
- customization snapshots live on `cart_items` and `order_items`.

## Production order

1. Deploy the frontend, Admin app, and Edge Functions that no longer read legacy
   columns.
2. Run `supabase/verification/20261006130000_legacy_contract_cutover_audit.sql`
   and `supabase/verification/20261006140000_catalog_engagement_cutover_audit.sql`
   against production. Both reports must return zero rows.
3. Take a managed Supabase backup and record its recovery point.
4. Run `supabase db push`. Migration `20261006130000` repeats the critical
   checks and aborts atomically if reconciliation is incomplete. Migration
   `20261006140000` expands and backfills catalog and engagement data. Deploy
   the canonical application, rerun its audit, then apply `20261006150000` to
   remove the compatibility structures.
5. Run the smoke tests: sign in, open a buyer order, reorder it, open the seller
   order, update one seller's tracking, and request Shippo test rates.
6. Keep the restricted `migration_archive` schema for the agreed retention
   window. It is not available to `anon` or `authenticated` roles.

Do not force the migration through a failed gate. Repair the reported rows,
rerun the audit, and then retry the migration.

## Rollback

Stop application writes first. Run
`supabase/rollback/20261006_consolidate_catalog_and_engagement.sql`, followed by
`supabase/rollback/20261006_remove_legacy_commerce_contracts.sql`, then restore
the legacy functions and policies from migrations `20260908143000` through
`20260915160000` before redeploying the previous application version. For a
full incident, prefer restoring the managed backup to a separate project and
verify it before directing traffic.
