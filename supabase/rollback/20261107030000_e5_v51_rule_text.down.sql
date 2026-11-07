-- ROLLBACK of 20261107030000_e5_v51_rule_text.sql (NOT applied automatically): back to the numeric params row.
begin;
insert into public.params (key, value, label, unit, sort) values
  ('regla_asignacion', case (select value from public.settings_v51 where key = 'regla_asignacion') when 'primero_acepta' then 0 else 1 end,
   'Regla de asignación (1 = mayor prioridad al cierre de la ventana, 0 = primero que acepta)', '', 21)
on conflict (key) do nothing;
create or replace function public.assignment_rule_v51() returns text
language sql stable set search_path = '' as $$
  select case when (select value from public.params where key = 'regla_asignacion') = 0 then 'primero_acepta'
              else 'ventana_prioridad' end
$$;
drop table if exists public.settings_v51;
commit;
