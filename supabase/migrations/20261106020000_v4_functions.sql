-- AsistIA v4: state transitions. Every important transition is one atomic function with its event and
-- its Realtime hint, so the panel, the simulated phones and the live channels see the same thing.
-- All of them run only with the server key (grants at the end of the file).

alter table public.requests add column if not exists received_min int;            -- demo minute of reception
alter table public.requests add column if not exists accepts_earlier boolean not null default true;
alter table public.requests add column if not exists info_question text;

-- ---------------------------------------------------------------- helpers
create or replace function public.param(p_key text) returns numeric
language sql stable set search_path = '' as $$
  select value from public.params where key = p_key
$$;

create or replace function public.demo_today() returns date
language sql stable set search_path = '' as $$
  select s.demo_date + (public.demo_now_min() / 1440) from public.demo_state s where s.id = 1
$$;

create or replace function public.fmt_date_es(d date) returns text
language sql immutable set search_path = '' as $$
  select (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow from d)::int + 1]
         || ' ' || extract(day from d)::int || ' de ' ||
         (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre',
                'noviembre','diciembre'])[extract(month from d)::int]
$$;

create or replace function public.fmt_time_es(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(t, '^0', '')
$$;

create or replace function public.fmt_slot(d date, t text) returns text
language sql immutable set search_path = '' as $$
  select public.fmt_date_es(d) || ' a las ' || public.fmt_time_es(t)
$$;

-- "Ana G." from "Ana Gutiérrez Silva"
create or replace function public.short_name(n text) returns text
language sql immutable set search_path = '' as $$
  select split_part(n, ' ', 1) || case when split_part(n, ' ', 2) <> '' then ' ' || left(split_part(n, ' ', 2), 1) || '.' else '' end
$$;

create or replace function public.deadline_for(p_cat text) returns int
language sql stable set search_path = '' as $$
  select public.param('deadline_' || lower(coalesce(p_cat, 'P3')))::int
$$;

-- Priority index and its one-line reason (proposal section 5). Never uses insurance, sex, past no-shows
-- or whether the person already has an appointment. Sex is read only to write "adulta"/"adulto" mayor.
create or replace view public.v_requests as
with base as (
  select r.*,
         coalesce(r.category, 'P3') as eff_category,
         greatest(0, public.demo_today() - r.first_attempt_at) as days_waited,
         public.deadline_for(r.category) as eff_deadline,
         (r.pregnant or r.age < 5 or r.age >= 60 or r.disability) as preferential,
         (select e.sex from identity.equity_attributes e where e.person_id = r.person_id) as grammar_sex
  from public.requests r
)
select b.*,
       round(public.param('w_r') * least(b.days_waited::numeric / b.eff_deadline, 1)
             + public.param('w_n') * (case when b.first_visit then 1 else 0 end)
             + public.param('w_e') * (case when b.preferential then 1 else 0 end), 4) as idx,
       round(100 * least(b.days_waited::numeric / b.eff_deadline, 9.99))::int as pct_deadline,
       concat_ws(' · ',
         case when b.category is null then 'P3 provisional' else b.category end,
         round(100 * b.days_waited::numeric / b.eff_deadline)::int || ' % de su plazo',
         case when b.first_visit then 'primera consulta' end,
         case when b.pregnant then 'gestante' end,
         case when b.age < 5 then 'menor de 5 años' end,
         case when b.age >= 60 then case when b.grammar_sex = 'F' then 'adulta mayor' else 'adulto mayor' end end,
         case when b.disability then 'con discapacidad' end) as reason
from base b;
revoke all on public.v_requests from anon, authenticated;
grant select on public.v_requests to service_role;

-- Blind view for the regulator (section 2): clinical fields only. Nothing that identifies the person.
create or replace view public.regulator_queue as
select r.id as request_id, r.code, r.specialty, r.reason_text, r.age,
       case when r.pregnant then true end as pregnant,
       r.referral, r.first_attempt_at, r.state, r.category, r.info_question,
       greatest(0, public.demo_now_min() - coalesce(r.received_min, 0)) / 60 as hours_waiting
from public.requests r
where r.state in ('pendiente_regulacion', 'pendiente_informacion', 'priorizada_sin_cupo', 'con_oferta',
                  'en_espera_prioritaria', 'asignada_por_validar', 'con_cita', 'derivada_emergencia');
revoke all on public.regulator_queue from anon, authenticated;
grant select on public.regulator_queue to service_role;

create or replace function public.regulator_list() returns setof public.regulator_queue
language sql stable set search_path = '' as $$
  select * from public.regulator_queue
  order by case state when 'pendiente_regulacion' then 0 when 'pendiente_informacion' then 1 else 2 end,
           hours_waiting desc, request_id
$$;

create or replace function public.req_event(p_request bigint, p_type text, p_actor text, p_payload jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.request_events (request_id, type, actor, payload, demo_min)
  values (p_request, p_type, p_actor, coalesce(p_payload, '{}'), public.demo_now_min())
$$;

-- activity feed (board and panel): one line per step of a chain
create or replace function public.activity(p_detail text, p_actor text, p_appt bigint default null, p_kind text default 'reasignacion')
returns void language sql set search_path = '' as $$
  insert into public.events (appointment_id, kind, channel, actor, detail, demo_min)
  values (p_appt, p_kind, 'sistema', p_actor, p_detail, public.demo_now_min())
$$;

create or replace function public.hint(p_kind text) returns void
language plpgsql set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind', p_kind, 'appts', '[]'::jsonb, 'patients', '[]'::jsonb), 'change', 'demo', false);
exception when others then null;
end $$;

create or replace function public.chat_hint(p_session uuid) returns void
language plpgsql set search_path = '' as $$
declare v_topic text;
begin
  select topic into v_topic from public.chat_sessions where id = p_session;
  if v_topic is not null then
    perform realtime.send('{"kind": "chat"}'::jsonb, 'change', v_topic, false);
  end if;
exception when others then null;
end $$;

-- The request's resting state when an offer or assignment does not work out: nobody loses their place.
create or replace function public.rest_state(p_request bigint) returns text
language sql stable set search_path = '' as $$
  select case when r.current_appointment_id is not null then 'con_cita' else 'priorizada_sin_cupo' end
  from public.requests r where r.id = p_request
$$;

-- Simulated phone of the person behind a request (if any)
create or replace function public.request_patient(p_request bigint) returns text
language sql stable set search_path = '' as $$
  select p.patient_id from public.requests r join identity.persons p on p.id = r.person_id where r.id = p_request
$$;

-- One message to a person, by every channel they have: the simulated phone (MessagingChannel = Simulated)
-- and any live chat session linked to them or to the request (MessagingChannel = WebChat).
create or replace function public.deliver(
  p_patient text, p_request bigint, p_body text, p_buttons jsonb, p_kind text,
  p_offer bigint default null, p_assignment bigint default null, p_appt bigint default null, p_sim boolean default true
) returns void language plpgsql set search_path = '' as $$
declare s record; v_now int := public.demo_now_min(); v_conv bigint;
begin
  if p_patient is not null and p_sim then
    insert into public.messages (patient_id, appointment_id, request_id, slot_offer_id, assignment_id, direction, kind,
                                 body, buttons, demo_min)
    values (p_patient, p_appt, p_request, p_offer, p_assignment, 'saliente', p_kind, p_body, p_buttons, v_now);
  end if;
  for s in
    select cs.id from public.chat_sessions cs
    where cs.consent_at is not null and cs.expires_at > now()
      and ((p_patient is not null and cs.linked_patient_id = p_patient)
           or (p_request is not null and cs.linked_request_id = p_request))
  loop
    select id into v_conv from public.conversations where session_id = s.id;
    if v_conv is null then
      insert into public.conversations (session_id) values (s.id) returning id into v_conv;
    end if;
    insert into public.chat_messages (conversation_id, direction, kind, body, buttons, ref, demo_min)
    values (v_conv, 'saliente',
            case p_kind when 'oferta' then 'oferta' when 'validacion' then 'validacion'
                        when 'recordatorio' then 'recordatorio' when 'reprogramacion' then 'recordatorio' else 'info' end,
            p_body, p_buttons,
            jsonb_strip_nulls(jsonb_build_object('offer', p_offer, 'assignment', p_assignment, 'appointment', p_appt,
                                                 'request', p_request)),
            v_now);
    perform public.chat_hint(s.id);
  end loop;
end $$;

-- A patients row for a request's person, so an assignment can become an appointment in the agenda.
create or replace function public.ensure_patient(p_person uuid) returns text
language plpgsql set search_path = '' as $$
declare v_pid text; p identity.persons; v_sex text;
begin
  select * into p from identity.persons where id = p_person for update;
  if p.patient_id is not null then return p.patient_id; end if;
  select sex into v_sex from identity.equity_attributes where person_id = p_person;
  v_pid := 'R' || substr(replace(p_person::text, '-', ''), 1, 10);
  insert into public.patients (id, full_name, first_name, short_name, sex, age, phone, token)
  values (v_pid, p.display_name, split_part(p.display_name, ' ', 1), public.short_name(p.display_name),
          coalesce(v_sex, 'F'), greatest(0, 2023 - coalesce(p.birth_year, 1980)), '', 'r' || substr(md5(p_person::text), 1, 12))
  on conflict (id) do nothing;
  update identity.persons set patient_id = v_pid where id = p_person;
  return v_pid;
end $$;

-- ---------------------------------------------------------------- RF-01: register the whole demand
-- p: display_name, doc_type, age, sex, insurance, district, origin_facility, specialty, modality, referral,
--    reason_text, pregnant, disability, first_visit, preferred_channel, short_notice_ok, first_attempt_at,
--    source, patient_id, chat_session_id, actor
create or replace function public.create_request(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare v_person uuid; v_req bigint; v_code text; v_age int; v_actor text; v_doc text; v_first date;
begin
  v_age := greatest(0, least(120, coalesce((p->>'age')::int, 0)));
  v_actor := coalesce(p->>'actor', 'Admisión');
  v_doc := coalesce(nullif(p->>'doc_type', ''), 'sin_documento');
  if v_doc not in ('dni', 'ce', 'pasaporte', 'otro', 'sin_documento') then v_doc := 'otro'; end if;
  if coalesce(trim(p->>'display_name'), '') = '' then raise exception 'name required'; end if;
  if coalesce(trim(p->>'specialty'), '') = '' then raise exception 'specialty required'; end if;
  v_first := coalesce((p->>'first_attempt_at')::date, public.demo_today());
  if v_first > public.demo_today() then v_first := public.demo_today(); end if;

  insert into identity.persons (display_name, birth_year, patient_id)
  values (left(trim(p->>'display_name'), 80), 2023 - v_age, nullif(p->>'patient_id', ''))
  returning id into v_person;
  insert into identity.person_identifiers (person_id, type, value_masked, verified)
  values (v_person, v_doc, case when v_doc = 'sin_documento' then null else 'FICTICIO-' || upper(substr(md5(v_person::text), 1, 4)) end, false);
  insert into identity.equity_attributes (person_id, insurance, district, origin_facility, sex)
  values (v_person, (p->>'insurance')::boolean, nullif(p->>'district', ''), nullif(p->>'origin_facility', ''),
          case when p->>'sex' in ('F', 'M') then p->>'sex' end);
  insert into identity.contact_points (person_id, channel, chat_session_id, consent_at, expires_at)
  values (v_person, case when p->>'chat_session_id' is not null then 'webchat'
                         when p->>'source' = 'voz' then 'voz_navegador' else 'simulado' end,
          nullif(p->>'chat_session_id', '')::uuid,
          case when p->>'chat_session_id' is not null then now() end,
          case when p->>'chat_session_id' is not null then now() + interval '24 hours' end);

  v_code := 'S-' || lpad(nextval('public.request_code_seq')::text, 4, '0');
  insert into public.requests (code, person_id, specialty, modality, first_attempt_at, referral, reason_text, age, pregnant,
                               disability, first_visit, preferred_channel, short_notice_ok, state, source, received_min)
  values (v_code, v_person, p->>'specialty', coalesce(nullif(p->>'modality', ''), 'presencial'), v_first,
          coalesce((p->>'referral')::boolean, false), left(nullif(trim(p->>'reason_text'), ''), 400), v_age,
          coalesce((p->>'pregnant')::boolean, false), coalesce((p->>'disability')::boolean, false),
          coalesce((p->>'first_visit')::boolean, true), coalesce(nullif(p->>'preferred_channel', ''), 'mensaje'),
          coalesce((p->>'short_notice_ok')::boolean, false), 'pendiente_regulacion',
          coalesce(nullif(p->>'source', ''), 'ventanilla'), public.demo_now_min())
  returning id into v_req;

  perform public.req_event(v_req, 'indicacion', v_actor, jsonb_build_object('date', v_first));
  perform public.req_event(v_req, 'recepcion', v_actor, jsonb_build_object('source', coalesce(p->>'source', 'ventanilla')));
  if p->>'chat_session_id' is not null then
    update public.chat_sessions set linked_request_id = v_req where id = (p->>'chat_session_id')::uuid;
  end if;
  perform public.hint('req');
  return jsonb_build_object('id', v_req, 'code', v_code);
end $$;

-- ---------------------------------------------------------------- RF-02: regulation (blind)
create or replace function public.regulate(p_request bigint, p_category text, p_actor text default 'Regulador')
returns void language plpgsql set search_path = '' as $$
declare r public.requests; v_deadline int;
begin
  if p_category not in ('P1', 'P2', 'P3', 'P4') then raise exception 'invalid category'; end if;
  select * into r from public.requests where id = p_request for update;
  if r.id is null then raise exception 'request not found'; end if;
  if r.state in ('derivada_emergencia', 'cerrada_con_causal', 'atendida') then raise exception 'request is closed'; end if;
  v_deadline := public.deadline_for(p_category);
  update public.requests
     set category = p_category, deadline_days = v_deadline, due_date = first_attempt_at + v_deadline,
         state = case when state in ('pendiente_regulacion', 'pendiente_informacion', 'registrada')
                      then case when current_appointment_id is not null then 'con_cita' else 'priorizada_sin_cupo' end
                      else state end,
         info_question = null, updated_at = now()
   where id = p_request;
  perform public.req_event(p_request, 'regulacion', p_actor, jsonb_build_object('category', p_category));
  perform public.req_event(p_request, 'fecha_limite', 'Sistema', jsonb_build_object('due_date', r.first_attempt_at + v_deadline));
  perform public.hint('req');
end $$;

create or replace function public.request_info(p_request bigint, p_question text, p_actor text default 'Regulador')
returns void language plpgsql set search_path = '' as $$
declare r public.requests;
begin
  select * into r from public.requests where id = p_request for update;
  if r.state not in ('pendiente_regulacion', 'pendiente_informacion') then raise exception 'request is not pending'; end if;
  update public.requests set state = 'pendiente_informacion', info_question = left(coalesce(nullif(trim(p_question), ''),
         'Necesitamos un poco más de información sobre el motivo de la consulta.'), 300), updated_at = now()
   where id = p_request;
  perform public.req_event(p_request, 'pedido_informacion', p_actor, jsonb_build_object('question', p_question));
  perform public.deliver(public.request_patient(p_request), p_request,
    'Sobre su solicitud ' || r.code || ': un profesional necesita un dato más. ' ||
    coalesce(nullif(trim(p_question), ''), '¿Podría contarnos un poco más sobre el motivo de la consulta?') ||
    ' Su fecha de solicitud no cambia.', null, 'info');
  perform public.hint('req');
end $$;

create or replace function public.derive_emergency(p_request bigint, p_actor text default 'Regulador', p_source text default 'regulador')
returns void language plpgsql set search_path = '' as $$
declare r public.requests;
begin
  select * into r from public.requests where id = p_request for update;
  if r.id is null then raise exception 'request not found'; end if;
  update public.requests set state = 'derivada_emergencia', updated_at = now() where id = p_request;
  insert into public.staff_tasks (type, request_id, source, note, created_min)
  values ('alarma', p_request, p_source, 'Signos de alarma: confirmar que el paciente acudió a emergencia', public.demo_now_min());
  perform public.req_event(p_request, 'cierre', p_actor, '{"reason": "derivada_emergencia"}');
  perform public.deliver(public.request_patient(p_request), p_request,
    'Por lo que nos cuenta, no espere una cita: acuda a la emergencia más cercana o llame al 106 (SAMU). ' ||
    'Avisamos a una persona del equipo de citas.', null, 'info');
  perform public.hint('req');
end $$;

-- ---------------------------------------------------------------- RF-12: withdrawal only with a reason
create or replace function public.withdraw_request(p_request bigint, p_reason text, p_text text, p_user text)
returns void language plpgsql set search_path = '' as $$
declare r public.requests;
begin
  if p_reason is null or p_reason not in ('atendido_en_otro_lugar', 'ya_no_lo_necesita', 'duplicado', 'otro') then
    raise exception 'invalid withdrawal reason';
  end if;
  if p_reason = 'otro' and coalesce(trim(p_text), '') = '' then raise exception 'withdrawal text required'; end if;
  if coalesce(trim(p_user), '') = '' then raise exception 'withdrawal user required'; end if;
  select * into r from public.requests where id = p_request for update;
  if r.state in ('cerrada_con_causal', 'atendida') then raise exception 'request is closed'; end if;
  if r.state in ('con_oferta', 'asignada_por_validar') then raise exception 'request has an open offer'; end if;
  insert into public.withdrawals (request_id, reason, reason_text, "user") values (p_request, p_reason, nullif(trim(p_text), ''), p_user);
  update public.requests set state = 'cerrada_con_causal', updated_at = now() where id = p_request;
  perform public.req_event(p_request, 'cierre', p_user, jsonb_build_object('reason', p_reason, 'text', p_text));
  perform public.hint('req');
end $$;

-- ---------------------------------------------------------------- RF-05: zones and candidates
create or replace function public.slot_days(p_slot bigint) returns int
language sql stable set search_path = '' as $$
  select s.date - public.demo_today() from public.slots s where s.id = p_slot
$$;

create or replace function public.slot_zone(p_slot bigint) returns text
language plpgsql stable set search_path = '' as $$
declare v_days int; v_round int; v_zone int;
begin
  select s.date - public.demo_today(), s.round into v_days, v_round from public.slots s where s.id = p_slot;
  v_zone := case when v_days <= public.param('zone_near_max') then 0
                 when v_days <= public.param('zone_mid_max') then 1 else 2 end;
  v_zone := least(2, v_zone + coalesce(v_round, 0)); -- a round without takers moves to the next zone
  return (array['cercana', 'media', 'lejana'])[v_zone + 1];
end $$;

-- Proposal for a free slot: eligible candidates in priority order, k and the fill probability.
-- The filter only matches slots (same specialty and modality, earlier than a current appointment, moved at
-- most once a week); it never gives priority.
create or replace function public.propose_candidates(p_slot bigint) returns jsonb
language plpgsql stable set search_path = '' as $$
declare s public.slots; v_zone text; v_target numeric; v_kmax int; v_miss numeric := 1; v_k int := 0;
        v_list jsonb := '[]'; c record; v_total int := 0; v_prot boolean; v_days int;
begin
  select * into s from public.slots where id = p_slot;
  if s.id is null then raise exception 'slot not found'; end if;
  v_zone := public.slot_zone(p_slot);
  v_days := s.date - public.demo_today();
  v_prot := s.protected and v_days > 1;   -- protected slots open to everyone 24 h before
  v_target := public.param('fill_target');
  v_kmax := public.param('k_max')::int;
  for c in
    select r.id, r.code, r.idx, r.reason, r.eff_category, r.state, r.short_notice_ok, r.days_waited,
           p.display_name, r.age, r.current_appointment_id, ca.date as current_date,
           case when r.short_notice_ok then public.param('a_short') else public.param('a_base') end as a
    from public.v_requests r
    join identity.persons p on p.id = r.person_id
    left join public.appointments ca on ca.id = r.current_appointment_id
    where r.specialty = s.specialty
      and r.category is not null
      and r.modality = case when s.remote then 'remota' else 'presencial' end
      and (r.state in ('priorizada_sin_cupo', 'en_espera_prioritaria')
           or (r.state = 'con_cita' and r.accepts_earlier and ca.date > s.date))
      and (r.last_moved_at is null or r.last_moved_at <= public.demo_today() - 7)
      and not exists (select 1 from public.assignments a where a.slot_id = p_slot and a.request_id = r.id)
      and case v_zone
            when 'cercana' then r.category in ('P1', 'P2') or (r.short_notice_ok and not v_prot)
            when 'media' then r.category in ('P2', 'P3') and (not v_prot or r.category = 'P2')
            else r.category in ('P3', 'P4') end
    order by (r.state = 'en_espera_prioritaria') desc, r.eff_category, r.idx desc, r.first_attempt_at, r.id
  loop
    v_total := v_total + 1;
    if v_k < v_kmax and (v_k = 0 or 1 - v_miss < v_target) then
      v_k := v_k + 1;
      v_miss := v_miss * (1 - c.a);
      v_list := v_list || jsonb_build_object('request_id', c.id, 'code', c.code, 'name', c.display_name,
        'short_name', public.short_name(c.display_name), 'age', c.age, 'category', c.eff_category,
        'index', c.idx, 'reason', c.reason, 'a', c.a, 'state', c.state,
        'current_date', c.current_date, 'priority_wait', c.state = 'en_espera_prioritaria');
    end if;
  end loop;
  return jsonb_build_object('slot_id', p_slot, 'zone', v_zone, 'days', v_days, 'protected', v_prot,
    'k', v_k, 'fill_probability', round(1 - v_miss, 4), 'available', v_total, 'candidates', v_list,
    'target', v_target, 'k_max', v_kmax);
end $$;

-- ---------------------------------------------------------------- RF-06: approve and send a simultaneous offer
create or replace function public.approve_offer(p_slot bigint, p_actor text default 'Admisión')
returns bigint language plpgsql set search_path = '' as $$
declare s public.slots; prop jsonb; v_offer bigint; v_now int; v_close int; c jsonb; v_ids bigint[];
        v_req public.requests; v_patient text; v_first boolean; v_text text; v_close_txt text;
begin
  select * into s from public.slots where id = p_slot for update;
  if s.id is null then raise exception 'slot not found'; end if;
  if s.state <> 'libre' then raise exception 'slot is not free'; end if;
  if exists (select 1 from public.slot_offers where slot_id = p_slot and state = 'enviada') then
    raise exception 'there is already an open offer for this slot';
  end if;
  prop := public.propose_candidates(p_slot);
  if (prop->>'k')::int = 0 then raise exception 'no candidates'; end if;
  select array_agg((x->>'request_id')::bigint) into v_ids from jsonb_array_elements(prop->'candidates') x;
  v_now := public.demo_now_min();
  v_close := v_now + public.param('offer_window_min')::int;
  v_close_txt := public.fmt_min(v_close);
  insert into public.slot_offers (slot_id, zone, k, fill_probability, candidate_ids, approved_by, sent_min, closes_min, round)
  values (p_slot, prop->>'zone', (prop->>'k')::int, (prop->>'fill_probability')::numeric, v_ids, p_actor, v_now, v_close, s.round)
  returning id into v_offer;
  update public.slots set state = 'retenido', updated_at = now() where id = p_slot;

  v_text := 'Se liberó un cupo de ' || s.specialty || ' el ' || public.fmt_slot(s.date, s.time) ||
    '. Recibe la oferta junto con otros pacientes de la lista; al cerrar el plazo se asigna según la prioridad publicada, ' ||
    'no según quién responde primero. ¿Lo quiere? Tiene hasta las ' || v_close_txt ||
    '. Si dice que no, conserva su lugar en la lista.';
  for c in select * from jsonb_array_elements(prop->'candidates') loop
    select * into v_req from public.requests where id = (c->>'request_id')::bigint for update;
    v_first := not exists (select 1 from public.request_events where request_id = v_req.id and type = 'primera_oferta');
    update public.requests set state = 'con_oferta', updated_at = now() where id = v_req.id;
    if v_first then perform public.req_event(v_req.id, 'primera_oferta', p_actor, jsonb_build_object('offer', v_offer)); end if;
    perform public.req_event(v_req.id, 'oferta', p_actor, jsonb_build_object('offer', v_offer, 'slot', p_slot, 'zone', prop->>'zone'));
    v_patient := public.request_patient(v_req.id);
    perform public.deliver(v_patient, v_req.id, v_text, '["Acepto", "No puedo"]'::jsonb, 'oferta', v_offer);
    -- RF-15: people who chose a call get the offer agent on their phone
    if v_req.preferred_channel = 'llamada' and v_patient is not null then
      perform public.start_request_call(v_req.id, 'oferta', v_offer, null);
    end if;
  end loop;
  perform public.activity('Cupo ' || to_char(s.date, 'DD/MM') || ' ' || s.time || ' de ' || s.specialty ||
    ' ofrecido a ' || (prop->>'k') || ' (zona ' || (prop->>'zone') || ', ' ||
    round((prop->>'fill_probability')::numeric * 100) || ' % de probabilidad de llenarlo). Aprobó: ' || p_actor,
    p_actor, s.source_appointment_id, 'oferta');
  perform public.hint('slot');
  return v_offer;
end $$;

-- Idempotent: a repeated answer (button pressed twice, webhook retried) returns the first one.
create or replace function public.respond_offer(p_offer bigint, p_request bigint, p_response text, p_channel text default 'mensaje')
returns text language plpgsql set search_path = '' as $$
declare o public.slot_offers; v_prev text; v_label text; v_left int;
begin
  if p_response not in ('acepta', 'declina') then raise exception 'invalid response'; end if;
  select * into o from public.slot_offers where id = p_offer for update;
  if o.id is null then raise exception 'offer not found'; end if;
  if not (p_request = any (o.candidate_ids)) then raise exception 'not a candidate'; end if;
  select response into v_prev from public.offer_responses where offer_id = p_offer and request_id = p_request;
  if v_prev is not null then return v_prev; end if;
  if o.state <> 'enviada' then raise exception 'offer is no longer open'; end if;
  insert into public.offer_responses (offer_id, request_id, response, channel, demo_min)
  values (p_offer, p_request, p_response, p_channel, public.demo_now_min());
  v_label := case when p_response = 'acepta' then 'Acepto' else 'No puedo' end;
  update public.messages set answered_with = v_label where slot_offer_id = p_offer and request_id = p_request and kind = 'oferta';
  update public.chat_messages set answered_with = v_label
   where (ref->>'offer')::bigint = p_offer and (ref->>'request')::bigint = p_request and kind = 'oferta';
  perform public.req_event(p_request, 'respuesta_oferta', p_channel, jsonb_build_object('offer', p_offer, 'response', p_response));
  if p_response = 'acepta' then
    perform public.deliver(public.request_patient(p_request), p_request,
      'Registramos que acepta. A las ' || public.fmt_min(o.closes_min) || ' le confirmamos si el cupo es suyo.', null, 'info', p_offer);
  else
    update public.requests set state = public.rest_state(p_request), updated_at = now() where id = p_request;
    perform public.deliver(public.request_patient(p_request), p_request,
      'Entendido. Conserva su lugar en la lista y le avisaremos del próximo cupo.', null, 'info', p_offer);
  end if;
  select count(*) into v_left from unnest(o.candidate_ids) c
   where not exists (select 1 from public.offer_responses r where r.offer_id = p_offer and r.request_id = c);
  if v_left = 0 then perform public.close_offer(p_offer, 'Sistema (respondieron todos)'); end if;
  perform public.hint('slot');
  return p_response;
end $$;

-- Assignment to one acceptor, pending validation with the patient (RF-08)
create or replace function public.make_assignment(p_slot bigint, p_offer bigint, p_request bigint, p_rule text)
returns bigint language plpgsql set search_path = '' as $$
declare s public.slots; v_a bigint; r public.requests; v_patient text;
begin
  select * into s from public.slots where id = p_slot;
  select * into r from public.requests where id = p_request for update;
  insert into public.assignments (slot_id, request_id, offer_id, rule, origin, validation_deadline_min, previous_appointment_id)
  values (p_slot, p_request, p_offer, p_rule, case s.origin when 'domino' then 'domino' when 'cupo_del_dia' then 'cupo_del_dia' else 'liberado' end,
          public.demo_now_min() + public.param('validation_timeout_min')::int, r.current_appointment_id)
  returning id into v_a;
  update public.requests set state = 'asignada_por_validar', updated_at = now() where id = p_request;
  perform public.req_event(p_request, 'asignacion', 'Sistema', jsonb_build_object('assignment', v_a, 'slot', p_slot));
  v_patient := public.request_patient(p_request);
  perform public.deliver(v_patient, p_request,
    'El cupo de ' || s.specialty || ' del ' || public.fmt_slot(s.date, s.time) || ' es suyo. Para confirmarlo, responda SÍ y ' ||
    'díganos si es usted el paciente o su cuidador. Si ya no puede, responda NO y conserva su lugar.',
    '["Sí, soy el paciente", "Sí, soy su cuidador", "No puedo"]'::jsonb, 'validacion', p_offer, v_a);
  if r.preferred_channel = 'llamada' and v_patient is not null then
    perform public.start_request_call(p_request, 'validacion', p_offer, v_a);
  end if;
  return v_a;
end $$;

-- RF-07: when the window closes, the slot goes to the highest index among those who accepted
create or replace function public.close_offer(p_offer bigint, p_actor text default 'Admisión')
returns bigint language plpgsql set search_path = '' as $$
declare o public.slot_offers; s public.slots; w record; f record; v_a bigint; acc record; v_n int; v_detail text;
begin
  select * into o from public.slot_offers where id = p_offer for update;
  if o.id is null then raise exception 'offer not found'; end if;
  if o.state <> 'enviada' then
    select id into v_a from public.assignments where offer_id = p_offer order by id desc limit 1;
    return v_a;
  end if;
  select * into s from public.slots where id = o.slot_id for update;
  -- not answering is recorded, never penalised
  insert into public.offer_responses (offer_id, request_id, response, channel, demo_min)
  select p_offer, c, 'sin_respuesta', 'sistema', public.demo_now_min() from unnest(o.candidate_ids) c
  on conflict (offer_id, request_id) do nothing;
  update public.requests r set state = public.rest_state(r.id), updated_at = now()
   where r.id = any (o.candidate_ids) and r.state = 'con_oferta'
     and exists (select 1 from public.offer_responses x where x.offer_id = p_offer and x.request_id = r.id and x.response = 'sin_respuesta');
  update public.messages set buttons = null where slot_offer_id = p_offer and kind = 'oferta' and answered_with is null;
  update public.chat_messages set buttons = null where (ref->>'offer')::bigint = p_offer and kind = 'oferta' and answered_with is null;

  select count(*) into v_n from public.offer_responses where offer_id = p_offer and response = 'acepta';
  if v_n = 0 then
    update public.slot_offers set state = 'sin_aceptantes', closed_at = now() where id = p_offer;
    update public.slots set state = 'libre', round = round + 1, updated_at = now() where id = s.id;
    perform public.activity('Nadie aceptó el cupo ' || to_char(s.date, 'DD/MM') || ' ' || s.time || ' de ' || s.specialty ||
      ': se abrirá una nueva ronda en la zona siguiente', p_actor, s.source_appointment_id, 'oferta');
    perform public.hint('slot');
    return null;
  end if;
  update public.slot_offers set state = 'cerrada', closed_at = now() where id = p_offer;

  select r.id, r.idx, r.reason, r.eff_category, r.pct_deadline, p.display_name into w
  from public.offer_responses x join public.v_requests r on r.id = x.request_id join identity.persons p on p.id = r.person_id
  where x.offer_id = p_offer and x.response = 'acepta'
  order by r.idx desc, r.first_attempt_at, r.id limit 1;
  select r.id, r.idx, p.display_name into f
  from public.offer_responses x join public.v_requests r on r.id = x.request_id join identity.persons p on p.id = r.person_id
  where x.offer_id = p_offer and x.response = 'acepta' order by x.at, x.id limit 1;

  v_a := public.make_assignment(s.id, p_offer, w.id, 'mayor_indice');
  v_detail := 'Asignado a ' || public.short_name(w.display_name) || ' (prioridad ' || to_char(w.idx, 'FM0.00') || ': ' ||
              w.eff_category || ', ' || w.pct_deadline || ' % de su plazo)' ||
              case when f.id <> w.id then ' aunque ' || split_part(f.display_name, ' ', 1) || ' respondió primero (' ||
                   to_char(f.idx, 'FM0.00') || ')' else '' end || '.';
  perform public.activity(v_detail, p_actor, s.source_appointment_id, 'asignacion');

  -- the other acceptors wait first in line for the next slot of their zone
  for acc in
    select x.request_id from public.offer_responses x where x.offer_id = p_offer and x.response = 'acepta' and x.request_id <> w.id
  loop
    update public.requests set state = 'en_espera_prioritaria', updated_at = now() where id = acc.request_id;
    perform public.req_event(acc.request_id, 'espera_prioritaria', 'Sistema', jsonb_build_object('offer', p_offer));
    perform public.deliver(public.request_patient(acc.request_id), acc.request_id,
      'Esta vez el cupo fue para un paciente con mayor prioridad. Usted queda primero para el próximo cupo de su zona.',
      null, 'info', p_offer);
  end loop;
  perform public.hint('slot');
  return v_a;
end $$;

-- Next acceptor (validation failed or expired), in index order; otherwise a new round
create or replace function public.assign_next(p_slot bigint, p_offer bigint) returns bigint
language plpgsql set search_path = '' as $$
declare v_next bigint; s public.slots;
begin
  select r.id into v_next
  from public.offer_responses x join public.v_requests r on r.id = x.request_id
  where x.offer_id = p_offer and x.response = 'acepta' and r.state = 'en_espera_prioritaria'
    and not exists (select 1 from public.assignments a where a.slot_id = p_slot and a.request_id = r.id)
  order by r.idx desc, r.first_attempt_at, r.id limit 1;
  if v_next is not null then
    perform public.activity('El cupo pasa al siguiente que aceptó, en orden de prioridad', 'Sistema',
      (select source_appointment_id from public.slots where id = p_slot), 'asignacion');
    return public.make_assignment(p_slot, p_offer, v_next, 'siguiente_aceptante');
  end if;
  select * into s from public.slots where id = p_slot;
  update public.slots set state = 'libre', round = round + 1, updated_at = now() where id = p_slot;
  perform public.activity('Sin otros aceptantes: el cupo ' || to_char(s.date, 'DD/MM') || ' ' || s.time ||
    ' vuelve a Por reasignar (zona siguiente)', 'Sistema', s.source_appointment_id, 'oferta');
  return null;
end $$;

-- ---------------------------------------------------------------- RF-08 / RF-09: validation and domino
create or replace function public.validate_assignment(
  p_assignment bigint, p_ok boolean, p_by text default 'mensaje', p_role text default 'paciente', p_actor text default null
) returns text language plpgsql set search_path = '' as $$
declare a public.assignments; s public.slots; r public.requests; v_new bigint; v_pid text; v_prev public.appointments;
        v_name text; v_dom bigint;
begin
  if p_by not in ('mensaje', 'agente', 'persona') then raise exception 'invalid validator'; end if;
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null then raise exception 'assignment not found'; end if;
  if a.validation_state <> 'pendiente' or a.reverted then return a.validation_state; end if; -- idempotent
  select * into s from public.slots where id = a.slot_id for update;
  select * into r from public.requests where id = a.request_id for update;
  select display_name into v_name from identity.persons where id = r.person_id;
  update public.messages set answered_with = case when p_ok then 'Sí, confirmo' else 'No puedo' end, buttons = null
   where assignment_id = p_assignment and kind = 'validacion';
  update public.chat_messages set answered_with = case when p_ok then 'Sí, confirmo' else 'No puedo' end, buttons = null
   where (ref->>'assignment')::bigint = p_assignment and kind = 'validacion';

  if not p_ok then
    update public.assignments set validation_state = 'fallida', validated_by = p_by, updated_at = now() where id = p_assignment;
    update public.requests set state = public.rest_state(r.id), updated_at = now() where id = r.id;
    perform public.req_event(r.id, 'validacion_rechazada', coalesce(p_actor, p_by), '{}');
    perform public.deliver(public.request_patient(r.id), r.id, 'Entendido. Conserva su lugar en la lista y le avisaremos del próximo cupo.',
                           null, 'info', a.offer_id, p_assignment);
    perform public.assign_next(s.id, a.offer_id);
    perform public.hint('slot');
    return 'fallida';
  end if;

  -- the slot becomes an appointment in the agenda
  v_pid := public.ensure_patient(r.person_id);
  v_new := nextval('public.appointment_extra_seq');
  insert into public.appointments (id, patient_id, specialty, date, time, remote, insured, status, status_channel, status_at,
                                   origin, replaces_id, is_base, request_id, uses_messaging)
  values (v_new, v_pid, s.specialty, s.date, s.time, s.remote, true, 'confirmada',
          case p_by when 'agente' then 'voz' when 'persona' then 'panel' else 'mensaje' end, now(),
          'lista_espera', s.source_appointment_id, false, r.id, true);
  insert into public.events (appointment_id, patient_id, kind, from_status, to_status, channel, actor, detail, demo_min)
  values (v_new, v_pid, 'estado', null, 'confirmada', case p_by when 'agente' then 'voz' when 'persona' then 'panel' else 'mensaje' end,
          coalesce(p_actor, v_name), 'Cita desde la lista de espera, validada con ' ||
          case p_role when 'cuidador' then 'su cuidador' else 'el paciente' end, public.demo_now_min());
  update public.slots set state = 'ocupado', appointment_id = v_new, updated_at = now() where id = s.id;
  if s.source_appointment_id is not null then
    update public.appointments set reassigned_to_id = v_new where id = s.source_appointment_id;
    perform public.set_status(s.source_appointment_id, 'reasignada', 'sistema', 'Sistema',
      'Cupo reasignado a ' || v_name || ' (solicitud ' || r.code || ')');
  end if;
  update public.assignments set validation_state = 'confirmada', validated_by = p_by, validated_role = p_role,
         new_appointment_id = v_new, updated_at = now() where id = p_assignment;
  update public.requests set state = 'con_cita', current_appointment_id = v_new, last_moved_at = public.demo_today(),
         updated_at = now() where id = r.id;
  perform public.req_event(r.id, 'confirmacion', coalesce(p_actor, p_by), jsonb_build_object('appointment', v_new, 'role', p_role));
  perform public.deliver(v_pid, r.id, 'Su cita quedó registrada: ' || s.specialty || ', ' || public.fmt_slot(s.date, s.time) ||
    '. Le enviaremos un recordatorio 72 horas antes.', null, 'info', a.offer_id, p_assignment, v_new);
  perform public.activity(public.short_name(v_name) || ' confirmó el cupo ' || to_char(s.date, 'DD/MM') || ' ' || s.time ||
    case when a.previous_appointment_id is null then ' (solicitud sin cita)' else '' end, coalesce(p_actor, p_by),
    s.source_appointment_id, 'validacion');

  -- RF-09: the farther appointment the person leaves free enters the same cycle
  if a.previous_appointment_id is not null then
    select * into v_prev from public.appointments where id = a.previous_appointment_id;
    if v_prev.id is not null and v_prev.status not in ('liberada', 'reasignada') then
      perform public.set_status(v_prev.id, 'liberada', 'sistema', 'Sistema',
        'Liberada por efecto dominó: ' || v_name || ' adelantó su cita al ' || to_char(s.date, 'DD/MM'));
      update public.slots set origin = 'domino' where source_appointment_id = v_prev.id returning id into v_dom;
      perform public.activity('Su cita del ' || to_char(v_prev.date, 'DD/MM') || ' se liberó (efecto dominó)', 'Sistema',
        s.source_appointment_id, 'domino');
    end if;
  end if;
  perform public.notify('appt', array[v_new], array[v_pid]);
  perform public.hint('slot');
  return 'confirmada';
end $$;

-- Every assignment can be reverted with a reason; everything goes back to its previous state.
create or replace function public.revert_assignment(p_assignment bigint, p_reason text, p_actor text)
returns void language plpgsql set search_path = '' as $$
declare a public.assignments; s public.slots; v_dom public.slots;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'revert reason required'; end if;
  select * into a from public.assignments where id = p_assignment for update;
  if a.id is null or a.reverted then raise exception 'assignment not found'; end if;
  select * into s from public.slots where id = a.slot_id for update;
  if a.validation_state = 'confirmada' then
    if a.previous_appointment_id is not null then
      select * into v_dom from public.slots where source_appointment_id = a.previous_appointment_id;
      if v_dom.id is not null and v_dom.state <> 'libre' then raise exception 'revert downstream first'; end if;
      delete from public.slots where id = v_dom.id;
      update public.appointments set status = 'pendiente', status_channel = 'panel', status_at = now(), updated_at = now()
       where id = a.previous_appointment_id;
    end if;
    update public.slots set state = 'libre', appointment_id = null, updated_at = now() where id = s.id;
    if s.source_appointment_id is not null then
      update public.appointments set status = 'liberada', reassigned_to_id = null, updated_at = now() where id = s.source_appointment_id;
    end if;
    update public.requests set state = case when a.previous_appointment_id is not null then 'con_cita' else 'priorizada_sin_cupo' end,
           current_appointment_id = a.previous_appointment_id, last_moved_at = null, updated_at = now()
     where id = a.request_id;
    delete from public.appointments where id = a.new_appointment_id;
  else
    update public.slots set state = 'libre', updated_at = now() where id = s.id;
    update public.requests set state = public.rest_state(a.request_id), updated_at = now() where id = a.request_id;
  end if;
  update public.assignments set reverted = true, revert_reason = p_reason, validation_state =
         case when validation_state = 'pendiente' then 'fallida' else validation_state end, updated_at = now()
   where id = p_assignment;
  perform public.req_event(a.request_id, 'reversion', p_actor, jsonb_build_object('reason', p_reason, 'assignment', p_assignment));
  perform public.activity('Asignación revertida por ' || p_actor || ': ' || p_reason, p_actor, s.source_appointment_id, 'reversion');
  perform public.notify('bulk');
  perform public.hint('slot');
end $$;

-- ---------------------------------------------------------------- RF-16: staff tasks
create or replace function public.create_task(p_type text, p_request bigint, p_appt bigint, p_source text, p_note text,
                                              p_session uuid default null, p_assignment bigint default null)
returns bigint language plpgsql set search_path = '' as $$
declare v bigint;
begin
  -- one open task of each type per case
  select id into v from public.staff_tasks
   where state <> 'cerrada' and type = p_type
     and coalesce(request_id, -1) = coalesce(p_request, -1) and coalesce(appointment_id, -1) = coalesce(p_appt, -1)
     and coalesce(chat_session_id::text, '') = coalesce(p_session::text, '');
  if v is not null then return v; end if;
  insert into public.staff_tasks (type, request_id, appointment_id, chat_session_id, assignment_id, source, note, created_min)
  values (p_type, p_request, p_appt, p_session, p_assignment, p_source, p_note, public.demo_now_min()) returning id into v;
  perform public.hint('task');
  return v;
end $$;

create or replace function public.close_task(p_task bigint, p_outcome text, p_actor text, p_note text default null)
returns void language plpgsql set search_path = '' as $$
declare t public.staff_tasks;
begin
  if p_outcome not in ('confirmo', 'rechazo', 'no_contesto', 'pidio_otra_fecha', 'resuelta') then raise exception 'invalid outcome'; end if;
  select * into t from public.staff_tasks where id = p_task for update;
  if t.id is null then raise exception 'task not found'; end if;
  if t.state = 'cerrada' then return; end if;
  update public.staff_tasks set state = 'cerrada', outcome = p_outcome, handled_by = p_actor, closed_at = now(),
         note = coalesce(nullif(trim(p_note), ''), note) where id = p_task;
  -- the outcome acts through the same functions as the patient
  if t.appointment_id is not null and p_outcome in ('confirmo', 'rechazo') then
    perform public.patient_reply(t.appointment_id, case p_outcome when 'confirmo' then 'confirma' else 'libera' end,
                                 'panel', p_actor || ' (call center)', 'Resultado de la llamada del call center');
  end if;
  if t.assignment_id is not null and p_outcome in ('confirmo', 'rechazo') then
    perform public.validate_assignment(t.assignment_id, p_outcome = 'confirmo', 'persona', 'paciente', p_actor);
  end if;
  perform public.hint('task');
end $$;

-- ---------------------------------------------------------------- calls for requests (offer / validation)
create or replace function public.start_request_call(p_request bigint, p_purpose text, p_offer bigint, p_assignment bigint,
                                                     p_session uuid default null)
returns bigint language plpgsql set search_path = '' as $$
declare v_call bigint; v_patient text;
begin
  v_patient := public.request_patient(p_request);
  update public.calls set status = 'no_contesta', ended_at = now()
   where request_id = p_request and status in ('sonando', 'en_curso');
  insert into public.calls (patient_id, request_id, purpose, offer_id, assignment_id, chat_session_id, agent)
  values (v_patient, p_request, p_purpose, p_offer, p_assignment, p_session,
          case p_purpose when 'oferta' then 'asistia-oferta' when 'validacion' then 'asistia-validacion' else 'asistia-registro' end)
  returning id into v_call;
  if p_assignment is not null then update public.assignments set attempts = attempts + 1 where id = p_assignment; end if;
  perform public.req_event(p_request, 'llamada', 'Sistema', jsonb_build_object('call', v_call, 'purpose', p_purpose));
  if v_patient is not null then perform public.notify('appt', '{}', array[v_patient]); end if;
  if p_session is not null then perform public.chat_hint(p_session); end if;
  perform public.hint('call');
  return v_call;
end $$;

-- ---------------------------------------------------------------- slots appear when an appointment is released
create or replace function public.set_status(
  p_appt bigint, p_to text, p_channel text, p_actor text, p_detail text default null, p_kind text default 'estado'
) returns text language plpgsql set search_path = '' as $$
declare v_from text; v_patient text; a public.appointments; v_days int; v_prot boolean;
begin
  select * into a from public.appointments where id = p_appt for update;
  v_from := a.status; v_patient := a.patient_id;
  if v_from is null then raise exception 'appointment % not found', p_appt; end if;
  if v_from = 'reasignada' and p_to <> 'reasignada' then raise exception 'slot already reassigned'; end if;
  update public.appointments
     set status = p_to, status_channel = p_channel, status_at = now(), updated_at = now()
   where id = p_appt;
  insert into public.events (appointment_id, patient_id, kind, from_status, to_status, channel, actor, detail, demo_min)
  values (p_appt, v_patient, p_kind, v_from, p_to, case when p_channel in ('panel', 'mensaje', 'voz', 'sistema', 'chat') then p_channel else 'sistema' end,
          p_actor, p_detail, public.demo_now_min());
  -- v4: a released appointment becomes a free slot in "Por reasignar"
  if p_to = 'liberada' and v_from <> 'liberada' then
    v_days := a.date - public.demo_today();
    -- protected slots: a share of the next 3 days, chosen deterministically
    v_prot := v_days <= 3 and (p_appt % 100) < (public.param('protected_pct') * 100);
    insert into public.slots (specialty, date, time, remote, source_appointment_id, origin, protected)
    values (a.specialty, a.date, a.time, a.remote, p_appt, 'liberado', v_prot)
    on conflict (source_appointment_id) where source_appointment_id is not null
    do update set state = case when public.slots.state = 'ocupado' then 'ocupado' else 'libre' end, updated_at = now();
    perform public.hint('slot');
  end if;
  return v_from;
end $$;

-- ---------------------------------------------------------------- RF-04 / RF-10: confirmations and rescheduling
create or replace function public.send_reminders() returns int
language plpgsql set search_path = '' as $$
declare v_now int; v_count int;
begin
  update public.demo_state set clock_started_at = coalesce(clock_started_at, now()) where id = 1;
  v_now := public.demo_now_min();
  with target as (
    select a.id, a.patient_id from public.appointments a
    where a.is_base and a.status = 'pendiente' and a.uses_messaging
  ), msgs as (
    insert into public.messages (patient_id, appointment_id, direction, kind, body, buttons, demo_min)
    select a.patient_id, a.id, 'saliente', 'recordatorio',
      'Hola ' || public.greeting_name(p) || ', le recordamos ' ||
      case when p.caregiver_name is not null then 'la cita de ' || p.first_name else 'su cita' end ||
      ' de ' || a.specialty || ' en 3 días: el ' || public.fmt_slot(a.date, a.time) ||
      case when a.remote then ' (teleconsulta).' else ', en el Hospital María Auxiliadora.' end ||
      ' ¿Podrá asistir? Si no puede, avísenos y el cupo pasará a otro paciente que lo espera.',
      '["Confirmo", "No podré asistir", "Reprogramar", "Hablar con una persona"]'::jsonb, v_now
    from public.appointments a join public.patients p on p.id = a.patient_id
    where a.id in (select id from target)
    returning appointment_id
  ), upd as (
    update public.appointments a
       set status = 'recordatorio_enviado', status_channel = 'mensaje', status_at = now(), reminder_at_min = v_now, updated_at = now()
     where a.id in (select id from target)
    returning a.id, a.patient_id
  ), ev as (
    insert into public.events (appointment_id, patient_id, kind, from_status, to_status, channel, actor, detail, demo_min)
    select u.id, u.patient_id, 'estado', 'pendiente', 'recordatorio_enviado', 'mensaje', 'Sistema',
           'Recordatorio 72 h antes, por mensaje', v_now
    from upd u returning 1
  )
  select count(*) into v_count from ev;
  -- linked live chat sessions (Carmen, Rosa, ...) receive it in the chat too (the phone already has it)
  perform public.deliver(a.patient_id, null, m.body, m.buttons, 'recordatorio', null, null, a.id, false)
  from public.chat_sessions cs
  join public.appointments a on a.patient_id = cs.linked_patient_id and a.is_base
  join lateral (select body, buttons from public.messages where appointment_id = a.id and kind = 'recordatorio'
                order by id desc limit 1) m on true
  where cs.consent_at is not null;
  update public.demo_state set reminders_sent_min = coalesce(reminders_sent_min, v_now), version = version + 1, updated_at = now() where id = 1;
  perform public.notify('bulk');
  return v_count;
end $$;

-- 24 h before: last reminder to those who did not answer
create or replace function public.send_last_reminders() returns int
language plpgsql set search_path = '' as $$
declare v_now int := public.demo_now_min(); v_count int;
begin
  with target as (
    select a.id, a.patient_id from public.appointments a
    where a.is_base and a.uses_messaging and a.status in ('recordatorio_enviado', 'sin_respuesta') and a.reminder_24_at_min is null
  ), msgs as (
    insert into public.messages (patient_id, appointment_id, direction, kind, body, buttons, demo_min)
    select a.patient_id, a.id, 'saliente', 'recordatorio',
      'Último recordatorio: su cita de ' || a.specialty || ' es mañana, ' || public.fmt_slot(a.date, a.time) ||
      '. Si no podrá ir, avísenos para dar el cupo a otro paciente. Si no responde, su cita se mantiene.',
      '["Confirmo", "No podré asistir", "Reprogramar", "Hablar con una persona"]'::jsonb, v_now
    from public.appointments a where a.id in (select id from target) returning 1
  )
  select count(*) into v_count from msgs;
  update public.appointments set reminder_24_at_min = v_now, updated_at = now()
   where is_base and uses_messaging and status in ('recordatorio_enviado', 'sin_respuesta') and reminder_24_at_min is null;
  update public.demo_state set version = version + 1, updated_at = now() where id = 1;
  perform public.notify('bulk');
  return v_count;
end $$;

-- Three free dates for a reschedule (same specialty and time, next working days after the appointment)
create or replace function public.reschedule_options(p_appt bigint) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', d, 'time', a.time, 'label', public.fmt_slot(d, a.time)) order by d), '[]')
  from public.appointments a,
       lateral (select d::date from generate_series(a.date + 4, a.date + 20, interval '1 day') d
                where extract(isodow from d) between 1 and 5 limit 3) x
  where a.id = p_appt
$$;

-- p_reply: 'confirma' | 'libera' | 'persona' | 'otra_fecha' | 'reprograma'
create or replace function public.patient_reply(
  p_appt bigint, p_reply text, p_channel text default 'mensaje', p_actor text default null, p_detail text default null
) returns text language plpgsql set search_path = '' as $$
declare a public.appointments; p public.patients; v_to text; v_label text; v_answer text; v_now int; v_opts jsonb;
begin
  select * into a from public.appointments where id = p_appt for update;
  if a.id is null then raise exception 'appointment % not found', p_appt; end if;
  if a.status in ('reasignada') then raise exception 'slot already reassigned'; end if;
  select * into p from public.patients where id = a.patient_id;
  v_now := public.demo_now_min();
  v_label := case p_reply when 'confirma' then 'Confirmo' when 'libera' then 'No podré asistir'
                          when 'otra_fecha' then 'Necesito otra fecha' when 'reprograma' then 'Reprogramar'
                          else 'Hablar con una persona' end;
  if p_channel in ('mensaje', 'chat') then
    update public.messages set answered_with = v_label
     where id = (select id from public.messages where appointment_id = p_appt and kind = 'recordatorio' order by id desc limit 1);
    insert into public.messages (patient_id, appointment_id, direction, kind, body, demo_min)
    values (a.patient_id, p_appt, 'entrante', 'respuesta', v_label, v_now);
  end if;

  if p_reply in ('reprograma', 'otra_fecha') then
    -- RF-10: the patient picks a date; nothing changes until Admisión approves it
    v_opts := public.reschedule_options(p_appt);
    perform public.deliver(a.patient_id, null,
      'Estas son 3 fechas libres de ' || a.specialty || '. Elija una: quedará pendiente hasta que el equipo de citas la valide. ' ||
      'Mientras tanto, su cita actual se mantiene.',
      (select jsonb_agg(x->>'label') from jsonb_array_elements(v_opts) x), 'reprogramacion', null, null, p_appt);
    perform public.set_status(p_appt, a.status, p_channel, coalesce(p_actor, p.full_name), 'Pidió reprogramar: se le ofrecieron 3 fechas', 'reprogramacion');
    perform public.notify('appt', array[p_appt], array[a.patient_id]);
    return a.status;
  end if;

  v_to := case p_reply when 'confirma' then 'confirmada' when 'libera' then 'liberada' when 'persona' then 'derivada_a_persona' end;
  if v_to is null then raise exception 'unknown reply %', p_reply; end if;
  if p_channel in ('mensaje', 'chat') then
    v_answer := case p_reply
      when 'confirma' then 'Gracias. Su cita queda confirmada. Le esperamos el ' || public.fmt_slot(a.date, a.time) || '.'
      when 'libera' then 'Gracias por avisar: su cupo se ofrecerá a otro paciente. Si necesita una nueva cita, puede pedirla aquí o en admisión.'
      else 'Una persona del equipo de citas le contactará pronto.' end;
    perform public.deliver(a.patient_id, null, v_answer, null, 'info', null, null, p_appt);
  end if;
  perform public.set_status(p_appt, v_to, p_channel,
    coalesce(p_actor, case when p.caregiver_name is not null then p.caregiver_name || ' (' || p.caregiver_relation || ')' else p.full_name end),
    coalesce(p_detail, case p_channel when 'voz' then 'Respondió en la llamada: ' else 'Respondió por mensaje: ' end || v_label));
  if p_reply = 'persona' then
    perform public.create_task('pide_persona', null, p_appt, case p_channel when 'voz' then 'agente' else 'mensaje' end,
                               'Pidió hablar con una persona sobre su cita');
  end if;
  perform public.notify('appt', array[p_appt], array[a.patient_id]);
  return v_to;
end $$;

create or replace function public.choose_reschedule(p_appt bigint, p_label text, p_channel text default 'mensaje')
returns void language plpgsql set search_path = '' as $$
declare a public.appointments; v_opt jsonb;
begin
  select * into a from public.appointments where id = p_appt for update;
  if a.status in ('reasignada', 'liberada') then raise exception 'slot is not free'; end if;
  select x into v_opt from jsonb_array_elements(public.reschedule_options(p_appt)) x where x->>'label' = p_label;
  if v_opt is null then raise exception 'invalid reschedule option'; end if;
  update public.messages set answered_with = p_label, buttons = null
   where appointment_id = p_appt and kind = 'reprogramacion' and answered_with is null;
  update public.appointments set reschedule_to = v_opt where id = p_appt;
  perform public.set_status(p_appt, 'reprogramacion_pendiente', p_channel, coalesce((select full_name from public.patients where id = a.patient_id), 'Paciente'),
    'Eligió el ' || p_label || ': pendiente de validación');
  perform public.deliver(a.patient_id, null, 'Registramos su pedido para el ' || p_label ||
    '. El equipo de citas lo validará y le avisaremos. Mientras tanto, su cita actual se mantiene.', null, 'info', null, null, p_appt);
  perform public.notify('appt', array[p_appt], array[a.patient_id]);
end $$;

-- Admisión approves or rejects; the patient keeps their seniority either way
create or replace function public.review_reschedule(p_appt bigint, p_approve boolean, p_actor text)
returns bigint language plpgsql set search_path = '' as $$
declare a public.appointments; v_new bigint;
begin
  select * into a from public.appointments where id = p_appt for update;
  if a.status <> 'reprogramacion_pendiente' then raise exception 'nothing to review'; end if;
  if not p_approve then
    perform public.set_status(p_appt, 'confirmada', 'panel', p_actor, 'Reprogramación rechazada: se mantiene la cita original');
    update public.appointments set reschedule_to = null where id = p_appt;
    perform public.deliver(a.patient_id, null, 'No pudimos cambiar la fecha. Su cita sigue el ' || public.fmt_slot(a.date, a.time) ||
      '. Si necesita otra opción, responda PERSONA.', null, 'info', null, null, p_appt);
    perform public.notify('appt', array[p_appt], array[a.patient_id]);
    return null;
  end if;
  v_new := nextval('public.appointment_extra_seq');
  insert into public.appointments (id, patient_id, specialty, date, time, remote, insured, status, status_channel, status_at,
                                   origin, replaces_id, is_base, uses_messaging)
  values (v_new, a.patient_id, a.specialty, (a.reschedule_to->>'date')::date, a.reschedule_to->>'time', a.remote, a.insured,
          'confirmada', 'panel', now(), 'reprogramada', p_appt, false, a.uses_messaging);
  perform public.set_status(p_appt, 'liberada', 'panel', p_actor, 'Reprogramación aprobada al ' || (a.reschedule_to->>'label') ||
    ': el cupo original queda libre');
  perform public.deliver(a.patient_id, null, 'Listo: su cita de ' || a.specialty || ' cambió al ' || (a.reschedule_to->>'label') ||
    '. Conserva su antigüedad.', null, 'info', null, null, v_new);
  perform public.notify('appt', array[p_appt, v_new], array[a.patient_id]);
  return v_new;
end $$;

-- 48 h before: the agent calls those without messaging and the non-responders of the call list
create or replace function public.start_agent_calls() returns int
language plpgsql set search_path = '' as $$
declare s public.demo_state; v_list int; r record; n int := 0;
begin
  select * into s from public.demo_state where id = 1;
  select floor(count(*) * s.call_list_pct) into v_list from public.appointments where is_base;
  for r in
    select a.id from public.appointments a
    where a.is_base and a.status in ('sin_respuesta', 'pendiente')
      and ((a.status = 'sin_respuesta' and a.risk_rank <= v_list) or (a.status = 'pendiente' and not a.uses_messaging))
      and not exists (select 1 from public.calls c where c.appointment_id = a.id)
    order by a.risk_rank
  loop
    perform public.start_call(r.id, 'Asistente automático (48 h)');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.start_call(p_appt bigint, p_actor text default 'Personal de citas')
returns bigint language plpgsql set search_path = '' as $$
declare a public.appointments; v_call bigint; v_demo boolean;
begin
  select * into a from public.appointments where id = p_appt for update;
  if a.status in ('reasignada', 'liberada') then raise exception 'cannot call a released slot'; end if;
  update public.calls set status = 'no_contesta', ended_at = now() where appointment_id = p_appt and status in ('sonando', 'en_curso');
  select demo_role is not null into v_demo from public.patients where id = a.patient_id;
  insert into public.calls (appointment_id, patient_id, purpose, agent, simulated)
  values (p_appt, a.patient_id, 'confirmacion', 'asistia-confirmacion', not coalesce(v_demo, false)) returning id into v_call;
  perform public.set_status(p_appt, 'en_llamada', 'voz', p_actor, 'Llamada del asistente automático');
  perform public.notify('appt', array[p_appt], array[a.patient_id]);
  return v_call;
end $$;

-- ---------------------------------------------------------------- demo clock: v4 rules
create or replace function public.demo_tick() returns int
language plpgsql set search_path = '' as $$
declare v_now int; s public.demo_state; v_changes int := 0; r record; v_deadline_passed boolean := false;
begin
  select * into s from public.demo_state where id = 1;
  if s.clock_started_at is null then return 0; end if;
  v_now := public.demo_now_min();

  -- simulated replies of patients without a QR (assumptions shown in /demo)
  if s.simulate_others then
    for r in
      select a.id, a.sim_reply from public.appointments a
      where a.status in ('recordatorio_enviado', 'sin_respuesta') and a.sim_reply is not null and a.uses_messaging
        and a.reminder_at_min + a.sim_delay_min <= v_now
        and not exists (select 1 from public.events e where e.appointment_id = a.id and e.channel = 'mensaje'
                          and e.kind = 'estado' and e.to_status in ('confirmada', 'liberada', 'derivada_a_persona'))
      order by a.id for update skip locked
    loop
      perform public.set_status(r.id, case r.sim_reply when 'confirma' then 'confirmada' when 'libera' then 'liberada'
                                     else 'derivada_a_persona' end, 'mensaje', 'Paciente (simulado)',
        'Respondió por mensaje (respuesta simulada): ' ||
        case r.sim_reply when 'confirma' then 'Confirmo' when 'libera' then 'No podré asistir' else 'Hablar con una persona' end);
      update public.messages set answered_with = case r.sim_reply when 'confirma' then 'Confirmo'
               when 'libera' then 'No podré asistir' else 'Hablar con una persona' end
       where appointment_id = r.id and kind = 'recordatorio';
      v_changes := v_changes + 1;
    end loop;
  end if;

  -- no reply within the deadline -> "sin respuesta" (the appointment is kept: nobody loses it)
  for r in
    select a.id from public.appointments a
    where a.status = 'recordatorio_enviado' and a.reminder_at_min + s.reply_deadline_min <= v_now
    for update skip locked
  loop
    perform public.set_status(r.id, 'sin_respuesta', 'sistema', 'Sistema',
      'Sin respuesta al recordatorio después de ' || (s.reply_deadline_min / 60.0)::numeric(4,1) || ' h. La cita se mantiene');
    v_changes := v_changes + 1;
    v_deadline_passed := true;
  end loop;
  if s.reminders_sent_min is not null and s.reminders_sent_min + s.reply_deadline_min <= v_now then
    v_changes := v_changes + public.start_agent_calls();
  end if;

  -- simulated answer to calls made to patients without a QR (15 s ringing)
  for r in
    select c.id, c.appointment_id, a.sim_reply from public.calls c
    join public.appointments a on a.id = c.appointment_id
    join public.patients p on p.id = c.patient_id
    where c.status = 'sonando' and p.demo_role is null and c.created_at < now() - interval '15 seconds'
    for update of c skip locked
  loop
    if r.sim_reply is null then
      perform public.update_call(r.id, 'no_contesta', 'No contestó');
    else
      update public.calls set status = 'finalizada', answered_at = now(), ended_at = now(), provider = 'simulado',
             result = 'Respuesta simulada: ' || r.sim_reply where id = r.id;
      perform public.patient_reply(r.appointment_id, r.sim_reply, 'voz', 'Paciente (simulado)', 'Respondió en la llamada (respuesta simulada)');
    end if;
    v_changes := v_changes + 1;
  end loop;

  -- a ringing browser call nobody answers in 30 s counts as one attempt
  for r in
    select c.id, c.assignment_id from public.calls c
    where c.status = 'sonando' and c.created_at < now() - interval '30 seconds'
      and (c.request_id is not null or exists (select 1 from public.patients p where p.id = c.patient_id and p.demo_role is not null))
    for update skip locked
  loop
    perform public.update_call(r.id, 'no_contesta', 'No contestó en 30 s');
    v_changes := v_changes + 1;
  end loop;

  -- simulated candidates answer offers a few demo minutes after they are sent
  for r in
    select o.id as offer_id, rq.id as request_id, rq.sim_offer_reply
    from public.slot_offers o cross join lateral unnest(o.candidate_ids) c(rid)
    join public.requests rq on rq.id = c.rid
    where o.state = 'enviada' and rq.sim_offer_reply in ('acepta', 'declina')
      and v_now >= o.sent_min + 2 + (rq.id % 5)
      and not exists (select 1 from public.offer_responses x where x.offer_id = o.id and x.request_id = rq.id)
  loop
    perform public.respond_offer(r.offer_id, r.request_id, r.sim_offer_reply, 'simulado');
    v_changes := v_changes + 1;
  end loop;

  -- offer windows that closed
  for r in select o.id from public.slot_offers o where o.state = 'enviada' and o.closes_min <= v_now loop
    perform public.close_offer(r.id, 'Sistema (venció la ventana)');
    v_changes := v_changes + 1;
  end loop;

  -- simulated candidates validate their assignment
  for r in
    select a.id from public.assignments a join public.requests rq on rq.id = a.request_id
    where a.validation_state = 'pendiente' and not a.reverted and rq.sim_offer_reply = 'acepta'
      and v_now >= public.demo_now_min() and a.created_at < now() - interval '4 seconds'
  loop
    perform public.validate_assignment(r.id, true, 'mensaje', 'paciente', 'Paciente (simulado)');
    v_changes := v_changes + 1;
  end loop;

  -- validation timeout: the slot goes to the next acceptor
  for r in
    select a.id, a.slot_id, a.offer_id, a.request_id from public.assignments a
    where a.validation_state = 'pendiente' and not a.reverted and a.validation_deadline_min <= v_now
    for update skip locked
  loop
    update public.assignments set validation_state = 'vencida', updated_at = now() where id = r.id;
    update public.requests set state = public.rest_state(r.request_id), updated_at = now() where id = r.request_id;
    perform public.req_event(r.request_id, 'validacion_vencida', 'Sistema', '{}');
    perform public.create_task('validacion_fallida', r.request_id, null, 'sistema', 'Venció el plazo de validación', null, r.id);
    perform public.assign_next(r.slot_id, r.offer_id);
    v_changes := v_changes + 1;
  end loop;

  if v_changes > 0 then
    update public.demo_state set version = version + 1, updated_at = now() where id = 1;
    perform public.notify('bulk');
  end if;
  return v_changes;
end $$;

-- calls: two failed agent attempts on a validation create a human task; v4 statuses
create or replace function public.update_call(p_call bigint, p_status text, p_result text default null, p_transcript jsonb default null)
returns void language plpgsql set search_path = '' as $$
declare c public.calls; v_status text; v_att int;
begin
  select * into c from public.calls where id = p_call for update;
  if c.id is null then raise exception 'call % not found', p_call; end if;
  if c.status in ('finalizada', 'no_contesta', 'rechazada', 'fallo') and p_status <> 'finalizada' then return; end if;
  update public.calls set
    status = p_status,
    result = coalesce(p_result, result),
    transcript = coalesce(p_transcript, transcript),
    answered_at = case when p_status = 'en_curso' then coalesce(answered_at, now()) else answered_at end,
    ended_at = case when p_status in ('finalizada', 'rechazada', 'no_contesta', 'fallo') then coalesce(ended_at, now()) else ended_at end,
    duration_s = case when p_status in ('finalizada', 'rechazada', 'no_contesta', 'fallo') and answered_at is not null
                      then extract(epoch from now() - answered_at)::int else duration_s end
  where id = p_call;
  if p_status = 'en_curso' and c.status = 'sonando' and c.appointment_id is not null then
    insert into public.events (appointment_id, patient_id, kind, channel, actor, detail, demo_min)
    values (c.appointment_id, c.patient_id, 'llamada', 'voz', 'Sistema', 'El paciente contestó la llamada', public.demo_now_min());
  end if;
  if c.appointment_id is not null then
    select status into v_status from public.appointments where id = c.appointment_id;
    if p_status in ('rechazada', 'no_contesta', 'finalizada', 'fallo') and v_status = 'en_llamada' then
      perform public.set_status(c.appointment_id, 'sin_respuesta', 'voz', 'Sistema',
        case p_status when 'rechazada' then 'Rechazó la llamada' when 'no_contesta' then 'No contestó la llamada'
                      else 'La llamada terminó sin respuesta' end || '. La cita se mantiene');
    end if;
  end if;
  if c.assignment_id is not null and p_status in ('rechazada', 'no_contesta', 'fallo') then
    select attempts into v_att from public.assignments where id = c.assignment_id and validation_state = 'pendiente';
    if v_att >= 2 then
      perform public.create_task('validacion_fallida', c.request_id, null, 'agente', 'Dos intentos del agente sin éxito', null, c.assignment_id);
    elsif v_att is not null then
      perform public.start_request_call(c.request_id, 'validacion', c.offer_id, c.assignment_id, c.chat_session_id);
    end if;
  end if;
  perform public.notify('appt', case when c.appointment_id is null then '{}'::bigint[] else array[c.appointment_id] end,
                        case when c.patient_id is null then '{}'::text[] else array[c.patient_id] end);
  perform public.hint('call');
  if c.chat_session_id is not null then perform public.chat_hint(c.chat_session_id); end if;
end $$;

-- ---------------------------------------------------------------- seed (section 1) and reset
create or replace function public.seed_person(p_name text, p_age int, p_sex text, p_insured boolean, p_district text,
                                              p_patient text default null, p_doc text default 'dni')
returns uuid language plpgsql set search_path = '' as $$
declare v uuid;
begin
  insert into identity.persons (display_name, birth_year, patient_id, seeded) values (p_name, 2023 - p_age, p_patient, true) returning id into v;
  insert into identity.person_identifiers (person_id, type, value_masked) values (v, p_doc, case when p_doc = 'sin_documento' then null else 'FICTICIO' end);
  insert into identity.equity_attributes (person_id, insurance, district, origin_facility, sex)
  values (v, p_insured, p_district, 'Centro de salud ' || p_district, p_sex);
  insert into identity.contact_points (person_id, channel) values (v, 'simulado');
  return v;
end $$;

create or replace function public.seed_request(p_person uuid, p_specialty text, p_cat text, p_days int, p_age int,
  p_first boolean, p_short boolean, p_state text, p_sim text, p_reason text default null, p_appt bigint default null,
  p_received_min int default null, p_pregnant boolean default false, p_disability boolean default false,
  p_channel text default 'mensaje', p_referral boolean default true)
returns bigint language plpgsql set search_path = '' as $$
declare v bigint; v_first date;
begin
  v_first := (select demo_date from public.demo_state where id = 1) - p_days;
  insert into public.requests (code, person_id, specialty, first_attempt_at, referral, reason_text, age, pregnant, disability,
    first_visit, preferred_channel, short_notice_ok, current_appointment_id, category, deadline_days, due_date, state, source,
    sim_offer_reply, seeded, received_min)
  values ('S-' || lpad(nextval('public.request_code_seq')::text, 4, '0'), p_person, p_specialty, v_first, p_referral, p_reason,
    p_age, p_pregnant, p_disability, p_first, p_channel, p_short, p_appt, p_cat, public.deadline_for(p_cat),
    case when p_cat is not null then v_first + public.deadline_for(p_cat) end, p_state, 'semilla', p_sim, true,
    coalesce(p_received_min, -1440 * least(p_days, 30)))
  returning id into v;
  if p_appt is not null then update public.appointments set request_id = v where id = p_appt; end if;
  insert into public.request_events (request_id, type, actor, payload, demo_min, at)
  values (v, 'indicacion', 'Semilla', jsonb_build_object('date', v_first), -1440 * p_days, now()),
         (v, 'recepcion', 'Semilla', '{}', coalesce(p_received_min, -1440 * least(p_days, 30)), now());
  if p_cat is not null then
    insert into public.request_events (request_id, type, actor, payload, demo_min)
    values (v, 'regulacion', 'Semilla', jsonb_build_object('category', p_cat), -1440 * least(p_days, 29));
  end if;
  return v;
end $$;

create or replace function public.future_appointment(p_patient text, p_specialty text, p_date date, p_time text)
returns bigint language plpgsql set search_path = '' as $$
declare v bigint;
begin
  v := nextval('public.appointment_extra_seq');
  insert into public.appointments (id, patient_id, specialty, date, time, remote, insured, status, origin, is_base, uses_messaging)
  values (v, p_patient, p_specialty, p_date, p_time, false, true, 'pendiente', 'futura', false, true);
  return v;
end $$;

create or replace function public.seed_v4() returns void
language plpgsql set search_path = '' as $$
declare w record; v_p uuid; v_cat text; v_sim text; v_i int := 0; v_ana bigint; v_julio bigint; v_dist text;
        districts text[] := array['San Juan de Miraflores', 'Villa María del Triunfo', 'Villa El Salvador', 'Chorrillos',
                                  'Pachacámac', 'Lurín', 'San Bartolo', 'Surquillo'];
begin
  perform setval('public.request_code_seq', 1, false);

  -- Luis: a simulated phone for the domino step
  insert into public.patients (id, full_name, first_name, short_name, sex, age, phone, token, demo_role, demo_label, demo_order)
  values ('P9001', 'Luis Ramos Huamán', 'Luis', 'Luis R.', 'M', 52, '', 'luis', 'espera_3',
          'Recibe el cupo liberado por efecto dominó', 6)
  on conflict (id) do update set demo_role = excluded.demo_role, demo_label = excluded.demo_label, demo_order = 6;
  update public.patients set age = 64, demo_label = 'Gana la oferta (prioridad 0.77)' where demo_role = 'espera_2';
  update public.patients set age = 59, demo_label = 'Acepta primero, pero no gana (prioridad 0.48)' where demo_role = 'espera_1';

  -- Cardiología: exactly the cast of section 1
  v_ana := public.future_appointment((select id from public.patients where demo_role = 'espera_2'), 'Cardiología', '2023-11-09', '09:00');
  v_julio := public.future_appointment((select id from public.patients where demo_role = 'espera_1'), 'Cardiología', '2023-11-23', '09:00');
  v_p := public.seed_person((select full_name from public.patients where demo_role = 'espera_2'), 64, 'F', true, 'San Juan de Miraflores',
                            (select id from public.patients where demo_role = 'espera_2'));
  perform public.seed_request(v_p, 'Cardiología', 'P2', 62, 64, true, true, 'con_cita', null,
    'Palpitaciones y cansancio al subir escaleras desde hace dos meses.', v_ana);
  v_p := public.seed_person((select full_name from public.patients where demo_role = 'espera_1'), 59, 'M', false, 'Villa El Salvador',
                            (select id from public.patients where demo_role = 'espera_1'));
  perform public.seed_request(v_p, 'Cardiología', 'P2', 40, 59, true, true, 'con_cita', null,
    'Presión alta difícil de controlar; lo refiere su centro de salud.', v_julio);
  v_p := public.seed_person('Luis Ramos Huamán', 52, 'M', true, 'Villa María del Triunfo', 'P9001');
  perform public.seed_request(v_p, 'Cardiología', 'P3', 30, 52, true, false, 'priorizada_sin_cupo', 'acepta',
    'Control por soplo detectado en un chequeo.');
  -- near zone: two P2 with a lower index (one declines, one does not answer)
  v_p := public.seed_person('Marta Ccori Pumacayo', 47, 'F', true, 'Chorrillos');
  perform public.seed_request(v_p, 'Cardiología', 'P2', 25, 47, true, false, 'priorizada_sin_cupo', 'declina', 'Dolor de pecho leve al esfuerzo, ya evaluado en emergencia.');
  v_p := public.seed_person('Pedro Salazar Quispe', 55, 'M', false, 'Lurín');
  perform public.seed_request(v_p, 'Cardiología', 'P2', 20, 55, false, false, 'priorizada_sin_cupo', 'sin_respuesta', 'Control de arritmia.');
  -- far zone: three P3 or P4 with a lower index than Luis
  v_p := public.seed_person('Rocío Mendoza Ríos', 38, 'F', true, 'Pachacámac');
  perform public.seed_request(v_p, 'Cardiología', 'P3', 20, 38, true, false, 'priorizada_sin_cupo', 'declina', 'Evaluación previa a una cirugía programada.');
  v_p := public.seed_person('Hugo Paredes Lima', 44, 'M', true, 'San Bartolo');
  perform public.seed_request(v_p, 'Cardiología', 'P4', 40, 44, true, false, 'priorizada_sin_cupo', 'sin_respuesta', 'Chequeo cardiológico preventivo.');
  v_p := public.seed_person('Elena Torres Vílchez', 51, 'F', false, 'Surquillo');
  perform public.seed_request(v_p, 'Cardiología', 'P4', 60, 51, false, false, 'priorizada_sin_cupo', 'declina', 'Control anual.');

  -- every other specialty: the generated waiting lists of E1, already regulated (deterministic)
  for w in
    select wl.*, p.full_name, p.age, p.sex from public.waitlist wl join public.patients p on p.id = wl.patient_id
    where wl.specialty <> 'Cardiología' order by wl.id
  loop
    v_i := v_i + 1;
    v_cat := case when w.specialty in ('Dermatología', 'Oftalmología') then 'P4'
                  when w.id % 10 < 2 then 'P2' when w.id % 10 < 7 then 'P3' else 'P4' end;
    v_sim := case when w.id % 10 < 2 then 'acepta' when w.id % 10 < 6 then 'declina' else 'sin_respuesta' end;
    v_dist := districts[1 + (w.id % array_length(districts, 1))];
    v_p := public.seed_person(w.full_name, w.age, w.sex, w.id % 5 <> 0, v_dist, w.patient_id);
    perform public.seed_request(v_p, w.specialty, v_cat, w.wait_days, w.age, w.id % 3 <> 0, w.id % 4 = 0,
      'priorizada_sin_cupo', v_sim, null, null, null, false, w.id % 23 = 0);
  end loop;

  -- pending regulation: the regulator's queue is not empty when the demo starts
  v_p := public.seed_person('Gloria Huanca Rojas', 33, 'F', true, 'Villa El Salvador');
  perform public.seed_request(v_p, 'Otorrinolaringología', null, 3, 33, true, false, 'pendiente_regulacion', null,
    'Dolor de oído y pérdida de audición del lado izquierdo desde hace un mes.', null, -60 * 40);
  v_p := public.seed_person('Mateo Flores Cárdenas', 4, 'M', false, 'Lurín', null, 'sin_documento');
  perform public.seed_request(v_p, 'Pediatría General', null, 2, 4, true, false, 'pendiente_regulacion', null,
    'Tos que no mejora desde hace tres semanas; lo trae su madre.', null, -60 * 26);
  v_p := public.seed_person('Rosaura Quispe Mamani', 71, 'F', true, 'San Juan de Miraflores');
  perform public.seed_request(v_p, 'Oftalmología', null, 5, 71, true, false, 'pendiente_regulacion', null,
    'Visión borrosa progresiva en ambos ojos.', null, -60 * 60);
  v_p := public.seed_person('Jhon Vargas Ccahuana', 29, 'M', false, 'Chorrillos');
  perform public.seed_request(v_p, 'Traumatología', null, 1, 29, false, false, 'pendiente_regulacion', null,
    'Dolor de rodilla después de una caída jugando fútbol.', null, -60 * 8);

  -- free slots for the jury's live test (section 6): Dermatología and Oftalmología, mid and far zone
  insert into public.slots (specialty, date, time, origin, seeded) values
    ('Dermatología', '2023-10-23', '09:40', 'agenda_libre', true),
    ('Dermatología', '2023-11-02', '09:40', 'agenda_libre', true),
    ('Oftalmología', '2023-10-23', '10:00', 'agenda_libre', true),
    ('Oftalmología', '2023-11-02', '10:00', 'agenda_libre', true);
end $$;

create or replace function public.reset_demo() returns void
language plpgsql set search_path = '' as $$
begin
  -- live sessions and conversations are deleted on every reset
  delete from public.chat_sessions where true;
  delete from public.staff_tasks where true;
  delete from public.calls where id > 0;
  delete from public.assignments where true;
  delete from public.slot_offers where true;
  delete from public.slots where true;
  delete from public.withdrawals where true;
  delete from public.requests where true;
  delete from identity.persons where true;
  delete from public.events where id > 0;
  delete from public.messages where id > 0;
  delete from public.offers where id > 0;
  update public.appointments set reassigned_to_id = null where reassigned_to_id is not null;
  delete from public.appointments where not is_base;
  update public.appointments
     set status = 'pendiente', status_channel = null, status_at = null, reminder_at_min = null, reminder_24_at_min = null,
         reschedule_to = null, request_id = null, updated_at = now()
   where status <> 'pendiente' or reminder_at_min is not null or request_id is not null or reschedule_to is not null;
  update public.waitlist set status = 'en_espera', updated_at = now() where status <> 'en_espera';
  update public.demo_state
     set clock_base_min = 480, clock_started_at = null, reminders_sent_min = null, revealed = false,
         demo_date = '2023-10-16', version = version + 1, updated_at = now()
   where id = 1;
  delete from public.metrics where key = 'reveal';
  perform setval('public.appointment_extra_seq', 100001, false);
  perform public.seed_v4();
  perform public.notify('full');
end $$;

-- chat sessions expire after 24 h at most
create or replace function public.purge_expired_sessions() returns int
language sql set search_path = '' as $$
  with d as (delete from public.chat_sessions where expires_at < now() returning 1) select count(*)::int from d
$$;

create or replace function public.wipe_all() returns void
language plpgsql set search_path = '' as $$
begin
  truncate public.chat_messages, public.conversations, public.chat_sessions, public.staff_tasks, public.withdrawals,
           public.offer_responses, public.assignments, public.slot_offers, public.slots, public.request_events,
           public.requests, identity.contact_points, identity.equity_attributes, identity.person_identifiers,
           identity.persons, public.events, public.messages, public.calls, public.offers, public.appointment_outcomes,
           public.waitlist, public.appointments, public.patients, public.metrics cascade;
end $$;

-- ---------------------------------------------------------------- only the server may run these
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname not in ('demo_now_min', 'fmt_min')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
