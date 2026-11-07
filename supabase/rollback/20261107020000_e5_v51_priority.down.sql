-- ROLLBACK of supabase/migrations/20261107020000_e5_v51_priority.sql (E5, hito 4). NOT APPLIED automatically.
-- Drops ONLY the 4 objects that migration created (their grants go with them). Nothing that `main` uses is
-- touched: public.v_requests, staff_requests(), propose_candidates() and the params table stay as they are.
--
-- To apply it by hand (with the database password in your own terminal):
--   psql "<connection string>" -f supabase/rollback/20261107020000_e5_v51_priority.down.sql
-- and then remove the row of version 20261107020000 from supabase_migrations.schema_migrations
-- (`npx supabase migration repair --status reverted 20261107020000 --linked`), so a later `db push` re-applies it.
-- If supabase/data/20261107_breakeven_v51.sql was applied, revert it separately (see that file).

begin;

drop function if exists public.propose_candidates_v51(bigint);   -- reads v_requests_v51: drop before the view
drop function if exists public.staff_requests_v51();             -- idem
drop view if exists public.v_requests_v51;                       -- uses priority_v51: drop before the function
drop function if exists public.priority_v51(int, int);

commit;
