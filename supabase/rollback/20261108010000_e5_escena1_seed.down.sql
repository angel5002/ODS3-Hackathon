-- ROLLBACK of supabase/migrations/20261108010000_e5_escena1_seed.sql (E5 final, scene 1). NOT APPLIED automatically.
-- Drops ONLY the two functions that migration created. Tito's rows (if seed_escena1() ran) stay until reset_demo().
--   psql "<connection string>" -f supabase/rollback/20261108010000_e5_escena1_seed.down.sql
-- and then remove the row of version 20261108010000 from supabase_migrations.schema_migrations
drop function if exists public.escena1_offer_to_tito(bigint, text, boolean);
drop function if exists public.seed_escena1(text);
