-- AsistIA v4: live channels (web chat + browser calls).

-- No phone numbers are stored (v4 privacy rules). The E1 generator wrote fictitious "+51 000 ..." numbers.
update public.patients set phone = '' where phone <> '';

create or replace function public.chat_conversation(p_session uuid) returns bigint
language plpgsql set search_path = '' as $$
declare v bigint;
begin
  select id into v from public.conversations where session_id = p_session;
  if v is null then insert into public.conversations (session_id) values (p_session) returning id into v; end if;
  return v;
end $$;

create or replace function public.chat_system_message(p_session uuid, p_body text) returns void
language plpgsql set search_path = '' as $$
begin
  insert into public.chat_messages (conversation_id, direction, kind, body, demo_min)
  values (public.chat_conversation(p_session), 'saliente', 'sistema', p_body, public.demo_now_min());
  perform public.chat_hint(p_session);
end $$;

-- "Botón de prueba de llamada" in /demo: rings on a chat session or on a simulated phone
create or replace function public.start_test_call(p_session uuid, p_patient text) returns bigint
language plpgsql set search_path = '' as $$
declare v bigint;
begin
  if p_session is null and p_patient is null then raise exception 'call target required'; end if;
  insert into public.calls (chat_session_id, patient_id, purpose, agent)
  values (p_session, p_patient, 'prueba', 'asistia-confirmacion') returning id into v;
  if p_session is not null then perform public.chat_hint(p_session); end if;
  if p_patient is not null then perform public.notify('appt', '{}', array[p_patient]); end if;
  perform public.hint('call');
  return v;
end $$;

-- calls for a request ring on its simulated phone and on the chat session that registered it (or is linked)
create or replace function public.start_request_call(p_request bigint, p_purpose text, p_offer bigint, p_assignment bigint,
                                                     p_session uuid default null)
returns bigint language plpgsql set search_path = '' as $$
declare v_call bigint; v_patient text; v_session uuid := p_session;
begin
  v_patient := public.request_patient(p_request);
  if v_session is null then
    select cs.id into v_session from public.chat_sessions cs
     where cs.expires_at > now() and (cs.linked_request_id = p_request or (v_patient is not null and cs.linked_patient_id = v_patient))
     order by cs.last_seen_at desc limit 1;
  end if;
  update public.calls set status = 'no_contesta', ended_at = now()
   where request_id = p_request and status in ('sonando', 'en_curso');
  insert into public.calls (patient_id, request_id, purpose, offer_id, assignment_id, chat_session_id, agent)
  values (v_patient, p_request, p_purpose, p_offer, p_assignment, v_session,
          case p_purpose when 'oferta' then 'asistia-oferta' when 'validacion' then 'asistia-validacion' else 'asistia-registro' end)
  returning id into v_call;
  if p_assignment is not null then update public.assignments set attempts = attempts + 1 where id = p_assignment; end if;
  perform public.req_event(p_request, 'llamada', 'Sistema', jsonb_build_object('call', v_call, 'purpose', p_purpose));
  if v_patient is not null then perform public.notify('appt', '{}', array[v_patient]); end if;
  if v_session is not null then perform public.chat_hint(v_session); end if;
  perform public.hint('call');
  return v_call;
end $$;

-- calls to a persona's appointment also ring on a chat session linked to that persona
create or replace function public.start_call(p_appt bigint, p_actor text default 'Personal de citas')
returns bigint language plpgsql set search_path = '' as $$
declare a public.appointments; v_call bigint; v_demo boolean; v_session uuid;
begin
  select * into a from public.appointments where id = p_appt for update;
  if a.status in ('reasignada', 'liberada') then raise exception 'cannot call a released slot'; end if;
  update public.calls set status = 'no_contesta', ended_at = now() where appointment_id = p_appt and status in ('sonando', 'en_curso');
  select demo_role is not null into v_demo from public.patients where id = a.patient_id;
  select cs.id into v_session from public.chat_sessions cs
   where cs.expires_at > now() and cs.linked_patient_id = a.patient_id order by cs.last_seen_at desc limit 1;
  insert into public.calls (appointment_id, patient_id, purpose, agent, simulated, chat_session_id)
  values (p_appt, a.patient_id, 'confirmacion', 'asistia-confirmacion', not coalesce(v_demo, false) and v_session is null, v_session)
  returning id into v_call;
  perform public.set_status(p_appt, 'en_llamada', 'voz', p_actor, 'Llamada del asistente automático');
  perform public.notify('appt', array[p_appt], array[a.patient_id]);
  if v_session is not null then perform public.chat_hint(v_session); end if;
  return v_call;
end $$;

-- a chat answer to a reminder of a linked persona (Carmen in the chat)
create or replace function public.chat_reminder_target(p_session uuid) returns bigint
language sql stable set search_path = '' as $$
  select a.id from public.chat_sessions cs
  join public.appointments a on a.patient_id = cs.linked_patient_id and a.is_base
  where cs.id = p_session and a.status in ('recordatorio_enviado', 'sin_respuesta')
  order by a.id limit 1
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
