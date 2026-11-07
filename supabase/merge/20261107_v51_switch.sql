-- SWITCH OF THE v4 FUNCTIONS TO v5.1, FOR THE MERGE. NOT A MIGRATION, NOT APPLIED (db push does not read this folder).
-- Requires supabase/migrations/20261107020000_e5_v51_priority.sql. It REPLACES functions that main uses, so apply it
-- only when main also follows v5.1 (at the merge), together with supabase/data/20261107_breakeven_v51.sql:
--   psql "<connection string>" -f supabase/merge/20261107_v51_switch.sql
-- Why: on the e5 branch the app calls the _v51 functions directly, but some paths still run inside v4 functions
-- that are not called from the app: respond_offer() closes the offer with close_offer() when every candidate
-- answered; validate_assignment(p_ok = false) passes the slot on with assign_next(); the voice tools
-- (src/lib/voice/tools.ts) call respond_offer() and validate_assignment(). After this file every path, including
-- those, uses the v5.1 order and the assignment rule. Same names, argument names, defaults and volatility.
-- Revert: re-apply the bodies of 20261106020000_v4_functions.sql and 20261106030000_v4_reads.sql.

begin;

create or replace function public.staff_requests() returns jsonb
language sql stable set search_path = '' as $$ select public.staff_requests_v51() $$;

create or replace function public.staff_request_detail(p_request bigint) returns jsonb
language sql stable set search_path = '' as $$ select public.staff_request_detail_v51(p_request) $$;

create or replace function public.staff_slots() returns jsonb
language sql stable set search_path = '' as $$ select public.staff_slots_v51() $$;

create or replace function public.propose_candidates(p_slot bigint) returns jsonb
language sql stable set search_path = '' as $$ select public.propose_candidates_v51(p_slot) $$;

create or replace function public.approve_offer(p_slot bigint, p_actor text default 'Admisión') returns bigint
language sql set search_path = '' as $$ select public.approve_offer_v51(p_slot, p_actor) $$;

create or replace function public.close_offer(p_offer bigint, p_actor text default 'Admisión') returns bigint
language sql set search_path = '' as $$ select public.close_offer_v51(p_offer, p_actor) $$;

create or replace function public.assign_next(p_slot bigint, p_offer bigint) returns bigint
language sql set search_path = '' as $$ select public.assign_next_v51(p_slot, p_offer) $$;

commit;
