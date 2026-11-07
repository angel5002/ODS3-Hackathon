-- ROLLBACK of supabase/migrations/20261107010000_e5_voice_sessions.sql (E5, hito 2). NOT APPLIED automatically.
-- Drops ONLY the objects that migration created: 8 functions and 2 tables (their indexes, grants and the
-- sequence voice_events_id_seq go with the tables). Nothing that `main` uses is touched.
-- The voice code of the e5 branch stops working after this; main keeps working.
--
-- To apply it by hand (with the database password in your own terminal):
--   psql "<connection string>" -f supabase/rollback/20261107010000_e5_voice_sessions.down.sql
-- and then remove the row of version 20261107010000 from supabase_migrations.schema_migrations
-- (`npx supabase migration repair --status reverted 20261107010000 --linked`), so a later `db push` re-applies it.

begin;

drop function if exists public.voice_overview();
drop function if exists public.voice_end_by_conversation(text, text);
drop function if exists public.voice_end(uuid, text, boolean, text);
drop function if exists public.voice_update(uuid, text, text, text, text);
drop function if exists public.voice_claim(bigint, text, int, uuid);
drop function if exists public.voice_expire();
drop function if exists public.voice_call_status(bigint, text, text);
drop function if exists public.voice_log(uuid, bigint, text, text, jsonb);

drop table if exists public.voice_events;   -- references voice_sessions: drop it first
drop table if exists public.voice_sessions; -- its FK to public.calls goes with it; calls itself is untouched

commit;
