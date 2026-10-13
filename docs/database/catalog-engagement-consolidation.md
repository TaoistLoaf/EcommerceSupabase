# Catalog and engagement consolidation

Migration `20261006140000` expands and backfills the canonical contract while
legacy code remains compatible. Migration `20261006150000` removes four
duplicate sources of truth after the application cutover.

| Before | Canonical contract |
| --- | --- |
| `products` plus `lend_items` | `products.listing_type` with rental terms on the product |
| `reviews.product_id` text plus `product_uuid` | required `reviews.product_uuid` foreign key |
| client-written `requests.likes` plus `request_likes` rows | database-maintained `requests.like_count` derived from `request_likes` |
| `orders.date` plus `orders.created_at` | `orders.created_at` |

Banner rows now declare `scope = platform | seller`. Platform banners have no
seller owner; seller banners require `seller_id`. RLS keeps platform banner
writes with platform admins and seller banner writes with their owner.

`products.catalog_section` preserves the existing storefront grouping. Rows
migrated from `lend_items` remain under the existing **Services** heading, while
existing sale and rental product sections remain visually unchanged.

Before removing `orders.date`, its historical value is copied into
`orders.created_at`, so the date shown to buyers and sellers does not change.

## Safe deployment

1. Back up the remote database.
2. Run `supabase/verification/20261006140000_catalog_engagement_cutover_audit.sql`;
   it must return zero rows.
3. Push migration `20261006140000` (expand/backfill).
4. Deploy the frontend, Admin app, and Edge Functions using canonical fields.
5. Run the verification query again, then push `20261006150000` (contract).
6. Run pgTAP and smoke-test sale listing, rental listing, review, like/unlike,
   platform banner, seller banner, checkout, and order history.
7. Keep `migration_archive` restricted. Remove archive tables only after the
   agreed retention period and a verified backup.

The rollback script restores compatibility columns and `lend_items` without
deleting canonical records created after cutover.
