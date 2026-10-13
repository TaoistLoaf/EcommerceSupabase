-- Must return zero rows before applying the destructive cutover migration.

select 'unresolved_review_product' as issue, review.id::text as record_id
from public.reviews as review
left join public.products as product
  on product.id::text = review.product_id
left join public.lend_items as rental
  on rental.id::text = review.product_id
where review.product_uuid is null
  and product.id is null
  and rental.id is null

union all

select 'invalid_product_listing_type', product.id::text
from public.products as product
where product.rentable is null

union all

select 'unmigrated_legacy_rental', legacy.id::text
from public.lend_items as legacy
left join public.products as product
  on product.id = md5('legacy-lend-item:' || legacy.id::text)::uuid
where product.id is null

union all

select 'duplicate_request_like', request_id::text || ':' || user_id::text
from public.request_likes
group by request_id, user_id
having count(*) > 1

union all

select 'request_like_count_mismatch', request.id::text
from public.requests as request
left join (
  select request_id, count(*)::bigint as total
  from public.request_likes
  group by request_id
) as counts on counts.request_id = request.id
where request.like_count <> coalesce(counts.total, 0)

union all

select 'invalid_banner_owner', banner.id::text
from public.banner as banner
where banner.created_by is not null
  and not exists (
    select 1 from auth.users where id = banner.created_by
  );
