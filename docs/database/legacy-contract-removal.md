# Legacy commerce contract removal gates

Legacy fields are removed only after normalized data is reconciled in production
and every reader and writer has moved. A zero-count database report is necessary
but not sufficient; application and Edge Function references must also be zero.

Run the read-only report:

```bash
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 \
  --file supabase/verification/20260921181000_legacy_contract_readiness.sql
```

## Completed contract cutover

| Removed legacy structure | Canonical replacement | Enforcement |
| --- | --- | --- |
| `orders.items` | `order_items` | Migration aborts on line-count mismatch. |
| `carts.items` | `cart_items` | Only `set_normalized_cart_line` remains writable. |
| Shared shipping fields on `orders` | `seller_fulfillments` | Every order/seller pair must exist before cutover. |
| `orders.user_id` | `orders.buyer_id` | Buyer policies use UUID ownership only. |
| `orders.order_id` | `orders.order_number` | Public lookup and reorder use the immutable formatted number. |
| `public.users` | `auth.users`, `profiles`, and `carts` | Auth trigger maintains profiles and roles directly. |
| `customizations` | `cart_items.customization`, `order_items.customization` | Immutable snapshots travel with the commerce line. |
| `order_email_events` | `email_events` | One idempotent delivery log remains. |
| `lend_items` | `products.listing_type = 'rental'` | Sale and rental inventory share one catalog. |
| `reviews.product_id` | `reviews.product_uuid` | Review ownership is a required UUID foreign key. |
| `requests.likes` | `request_likes` + `requests.like_count` | A trigger owns the cached count. |
| `orders.date` | `orders.created_at` | One order creation timestamp remains. |

## Release sequence

The additive and backfill stages are complete in migration history. For the
production contract release, follow
[`normalized-commerce-cutover.md`](./normalized-commerce-cutover.md). The
`20261006130000` migration reruns critical reconciliation gates before dropping
anything and keeps a restricted rollback snapshot.

Payment rows are currently test-mode evidence. Missing `order_payments` rows are
reported, not automatically created, because inventing payment history would be
unsafe.
