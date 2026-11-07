-- ROLLBACK of 20261107040000_e5_v51_overdue_order.sql (NOT applied automatically): back to the capped key of
-- 20261107030000 (category in the tens + fraction capped to [0, 1]).
create or replace function public.priority_sort_key_v51(p_category text, p_days_waited int, p_deadline_days int) returns numeric
language sql immutable set search_path = '' as $$
  select (5 - public.category_rank_v51(p_category)) * 10
       + least(greatest(coalesce(public.priority_v51(p_days_waited, p_deadline_days), 0), 0), 1)
$$;
