-- E5 · final day (pitch v7): "modo sala ruidosa" (push-to-talk on the phones' voice), ON by default.
-- Additive only: one new key in the existing settings_v51 table (created by 20261107030000). Nothing else
-- changes; the app also treats a missing key as ON and the staff action `noisy_room` upserts it.
insert into public.settings_v51 (key, value) values ('sala_ruidosa', 'on')
on conflict (key) do nothing;
