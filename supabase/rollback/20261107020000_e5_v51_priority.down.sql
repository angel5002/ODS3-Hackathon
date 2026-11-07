-- ROLLBACK of supabase/migrations/20261107020000_e5_v51_priority.sql (E5, hito 4). NOT APPLIED automatically.
-- Drops ONLY what that migration created: 14 functions, 1 view (their grants go with them) and the params row
-- it inserted ('regla_asignacion'). Nothing that `main` uses is touched: public.v_requests, staff_requests(),
-- staff_slots(), propose_candidates(), approve_offer(), close_offer(), assign_next(), demo_tick() and every
-- other params row stay as they are. Assignments created with rule 'mayor_prioridad' or 'primero_acepta' stay
-- (rule is free text; main never reads its value).
-- If supabase/merge/20261107_v51_switch.sql was applied, revert it FIRST (re-apply the v4 bodies), because its
-- v4 functions call the _v51 ones dropped here.
--
-- To apply it by hand (with the database password in your own terminal):
--   psql "<connection string>" -f supabase/rollback/20261107020000_e5_v51_priority.down.sql
-- and then remove the row of version 20261107020000 from supabase_migrations.schema_migrations
-- (`npx supabase migration repair --status reverted 20261107020000 --linked`), so a later `db push` re-applies it.
-- If supabase/data/20261107_breakeven_v51.sql was applied, revert it separately (see that file).

begin;

drop function if exists public.advance_clock_v51(int);
drop function if exists public.demo_tick_offers_v51();
drop function if exists public.assign_next_v51(bigint, bigint);
drop function if exists public.close_offer_v51(bigint, text);
drop function if exists public.approve_offer_v51(bigint, text);
drop function if exists public.staff_slots_v51();
drop function if exists public.offer_rule_v51(bigint);
drop function if exists public.propose_candidates_v51(bigint);
drop function if exists public.staff_request_detail_v51(bigint);
drop function if exists public.staff_requests_v51();
drop view if exists public.v_requests_v51;                       -- uses the three functions below: drop it first
drop function if exists public.priority_sort_key_v51(text, int, int);
drop function if exists public.category_rank_v51(text);
drop function if exists public.priority_v51(int, int);
drop function if exists public.assignment_rule_v51();

delete from public.params where key = 'regla_asignacion';

commit;
