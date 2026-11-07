-- DATA CHANGE, NOT A MIGRATION. NOT APPLIED automatically (supabase db push does not read this folder).
-- Proposal v5.1, section 9: the hospital covers the cost with about 461 net consultations a month,
-- 5.2 % of its lost appointments (v4 said 5.3 %).
--
-- public.params is shared by every branch: applying this changes what PRODUCTION (branch main) shows too,
-- on /tablero (red line "el hospital obtiene beneficio desde 5.2 %") and in the parameters card of /demo.
-- reset_demo() does not rewrite params, so the value persists until someone edits it again in /demo.
-- Apply it only when main also follows v5.1 (at the merge), by hand:
--   psql "<connection string>" -f supabase/data/20261107_breakeven_v51.sql
-- Revert: update public.params set value = 0.053 where key = 'breakeven_r';

update public.params set value = 0.052 where key = 'breakeven_r' and value = 0.053;
