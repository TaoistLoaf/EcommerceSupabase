begin;

-- The previous bigint contract remains during rollout, so rollback only
-- removes the new public-order-number contract.
drop function if exists public.reorder_order_into_cart(text);

commit;
