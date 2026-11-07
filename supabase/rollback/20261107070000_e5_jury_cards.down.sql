-- Inverse of supabase/migrations/20261107070000_e5_jury_cards.sql (jury cards, track E).
-- Run public.jury_clear(token) for each card first if its rows (phones, appointments, requests) should go too:
-- dropping the tables does not touch patients, appointments or requests.
drop function if exists public.jury_snapshot(boolean);
drop function if exists public.jury_drop_test(text);
drop function if exists public.jury_rearm(text);
drop function if exists public.jury_clear(text);
drop function if exists public.jury_close(text, text);
drop function if exists public.jury_offer(text, text);
drop function if exists public.jury_categorize(bigint, text, text);
drop function if exists public.jury_prepare();
drop function if exists public.jury_open(text, uuid);
drop function if exists public.jury_ensure(text);
drop function if exists public.jury_card_requests(boolean);
drop function if exists public.jury_epoch();
drop table if exists public.jury_slots;
drop table if exists public.jury_visits;
drop table if exists public.jury_cards;
