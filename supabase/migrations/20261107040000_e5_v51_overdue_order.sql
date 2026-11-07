-- E5 · v5.1: within a category the MOST overdue goes first. The displayed value (priority_v51, idx) keeps its
-- cap at 100 %, but the sort key now uses the UNCAPPED deadline fraction, so two overdue requests of the same
-- category no longer tie (a P2 at fraction 3.0 goes before a P2 at 1.2).
-- Order = (category, uncapped fraction desc) encoded as: category in the thousands (P1 = 4000 ... P4 = 1000)
-- + fraction bounded to 999.9999. A lower category could only reach the next one past fraction 1000, i.e. ~82
-- years of waiting for a P1 (30 days) and ~986 years for a P4: impossible, so the category always decides first.
-- Only touches priority_sort_key_v51, an e5-only function (created by 20261107020000, replaced by 20261107030000);
-- main never calls it. Every list keeps its tie-breakers after the key: first attempt (oldest first), then id.

create or replace function public.priority_sort_key_v51(p_category text, p_days_waited int, p_deadline_days int) returns numeric
language sql immutable set search_path = '' as $$
  select (5 - public.category_rank_v51(p_category)) * 1000
       + case when p_deadline_days is null or p_deadline_days <= 0 then 0
              else round(least(greatest(coalesce(p_days_waited, 0), 0)::numeric / p_deadline_days, 999.9999), 4) end
$$;
