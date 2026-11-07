-- ROLLBACK of supabase/migrations/20261108020000_e5_preconsulta.sql (E5 final, pre-visit). NOT APPLIED automatically.
-- Drops ONLY what that migration created: 3 functions and 3 tables (indexes and grants go with them).
-- Staff tasks created by a pre-visit alarm stay in staff_tasks (they are ordinary 'alarma' tasks).
--   psql "<connection string>" -f supabase/rollback/20261108020000_e5_preconsulta.down.sql
-- and then remove the row of version 20261108020000 from supabase_migrations.schema_migrations
drop function if exists public.preconsulta_apply(uuid, int, jsonb, jsonb, text, jsonb, text, text);
drop function if exists public.preconsulta_edit(uuid, text, jsonb, jsonb, jsonb, text);
drop function if exists public.preconsulta_purge();
drop table if exists public.preconsulta_edits;
drop table if exists public.preconsulta_answers;
drop table if exists public.preconsulta_sessions;
