-- AsistIA v4: helpers for the web chat router.

-- requests a chat session acts for: the one it registered and those of the persona it is linked to
create or replace function public.session_requests(p_session uuid) returns bigint[]
language sql stable set search_path = '' as $$
  select coalesce(array_agg(distinct r.id), '{}')
  from public.chat_sessions cs
  join public.requests r on r.id = cs.linked_request_id
     or r.person_id in (select p.id from identity.persons p where p.patient_id is not null and p.patient_id = cs.linked_patient_id)
  where cs.id = p_session
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname not in ('demo_now_min', 'fmt_min')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
