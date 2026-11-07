-- E5 · v5.1 adjustments requested by the team (applies after 20261107020000_e5_v51_priority.sql):
--   1. the assignment rule is stored as TEXT ('ventana_prioridad' | 'primero_acepta') in a new table, instead of
--      the numeric params row (params.value is numeric not null);
--   2. the sort key caps the deadline fraction inside the key itself, so the category always decides first even
--      for a very overdue request (a P3 at fraction 12 can never reach a P2).
-- Nothing that `main` uses is touched: the two replaced functions were created by 20261107020000 and only the
-- e5 code calls them; the deleted params row is the one 20261107020000 added (it showed up as an extra field in
-- the production /demo parameters card).

create table if not exists public.settings_v51 (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  constraint settings_v51_rule check (key <> 'regla_asignacion' or value in ('ventana_prioridad', 'primero_acepta'))
);
alter table public.settings_v51 enable row level security;
revoke all on public.settings_v51 from anon, authenticated;
grant all on public.settings_v51 to service_role;

insert into public.settings_v51 (key, value) values ('regla_asignacion', 'ventana_prioridad')
on conflict (key) do nothing;

-- e5-only function (created by 20261107020000): now reads the text setting; default 'ventana_prioridad'
create or replace function public.assignment_rule_v51() returns text
language sql stable set search_path = '' as $$
  select coalesce((select s.value from public.settings_v51 s where s.key = 'regla_asignacion'), 'ventana_prioridad')
$$;

-- e5-only function (created by 20261107020000): (category, fraction) encoded with the fraction capped to [0, 1]
-- inside the key; with the category in the tens, P(k) at any fraction < P(k-1) at fraction 0.
create or replace function public.priority_sort_key_v51(p_category text, p_days_waited int, p_deadline_days int) returns numeric
language sql immutable set search_path = '' as $$
  select (5 - public.category_rank_v51(p_category)) * 10
       + least(greatest(coalesce(public.priority_v51(p_days_waited, p_deadline_days), 0), 0), 1)
$$;

delete from public.params where key = 'regla_asignacion';
