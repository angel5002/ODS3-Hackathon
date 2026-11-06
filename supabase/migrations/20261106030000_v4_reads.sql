-- AsistIA v4: read models for the server routes (the browser never queries these tables directly).

alter table public.patients add column if not exists last_seen_at timestamptz;
alter table public.patients add column if not exists sound_ready boolean not null default false;

-- names of the cast in section 1 (the generator picks surnames at random)
create or replace function public.fix_cast_names() returns void
language sql set search_path = '' as $$
  update public.patients set full_name = 'Ana Gutiérrez Silva', first_name = 'Ana', short_name = 'Ana G.' where demo_role = 'espera_2';
  update public.patients set full_name = 'Julio Gonzales López', first_name = 'Julio', short_name = 'Julio G.' where demo_role = 'espera_1';
  update identity.persons p set display_name = pt.full_name from public.patients pt
   where p.patient_id = pt.id and pt.demo_role in ('espera_1', 'espera_2');
$$;

-- ---------------------------------------------------------------- Admisión: waiting list (RF-03)
create or replace function public.staff_requests() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.ord, x.cat, x.idx desc, x.id), '[]') from (
    select r.id, r.code, p.display_name as name, public.short_name(p.display_name) as short_name, r.specialty, r.category,
           r.eff_category as cat, r.days_waited, r.eff_deadline as deadline, r.pct_deadline, r.first_visit, r.preferential,
           r.idx, r.reason, r.state, r.preferred_channel, r.short_notice_ok, r.source, r.age, r.modality,
           r.first_attempt_at, r.due_date,
           ca.date as appt_date, ca.time as appt_time,
           exists (select 1 from public.chat_sessions cs where cs.linked_request_id = r.id or
                   (p.patient_id is not null and cs.linked_patient_id = p.patient_id)) as live_chat,
           pt.token as phone_token,
           case when r.state in ('cerrada_con_causal', 'atendida', 'derivada_emergencia') then 2
                when r.state in ('pendiente_regulacion', 'pendiente_informacion') then 1 else 0 end as ord
    from public.v_requests r
    join identity.persons p on p.id = r.person_id
    left join public.patients pt on pt.id = p.patient_id and pt.demo_role is not null
    left join public.appointments ca on ca.id = r.current_appointment_id
  ) x
$$;

create or replace function public.staff_request_detail(p_request bigint) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'request', (select to_jsonb(r) - 'grammar_sex' from public.v_requests r where r.id = p_request),
    'person', (select jsonb_build_object('name', p.display_name, 'doc', (select type from identity.person_identifiers i where i.person_id = p.id limit 1),
                                         'insurance', e.insurance, 'district', e.district, 'origin_facility', e.origin_facility)
               from public.requests r join identity.persons p on p.id = r.person_id
               left join identity.equity_attributes e on e.person_id = p.id where r.id = p_request),
    'events', (select coalesce(jsonb_agg(to_jsonb(ev) order by ev.id desc), '[]') from public.request_events ev where ev.request_id = p_request),
    'withdrawal', (select to_jsonb(w) from public.withdrawals w where w.request_id = p_request order by id desc limit 1)
  )
$$;

-- ---------------------------------------------------------------- Admisión: free slots (RF-05 to RF-09)
create or replace function public.staff_slots() returns jsonb
language plpgsql stable set search_path = '' as $$
declare v jsonb := '[]'; s record; v_offer jsonb; v_assign jsonb; v_prop jsonb;
begin
  for s in
    select sl.*, public.slot_zone(sl.id) as zone, sl.date - public.demo_today() as days,
           src.patient_id as src_patient, (select short_name from public.patients where id = src.patient_id) as src_name
    from public.slots sl left join public.appointments src on src.id = sl.source_appointment_id
    order by (sl.state = 'ocupado'), sl.date, sl.time, sl.id
  loop
    select to_jsonb(o) || jsonb_build_object('candidates', (
             select coalesce(jsonb_agg(jsonb_build_object('request_id', r.id, 'code', r.code, 'name', p.display_name,
               'short_name', public.short_name(p.display_name), 'index', r.idx, 'reason', r.reason, 'category', r.eff_category,
               'response', x.response, 'channel', x.channel, 'at', x.at,
               'simulated', r.sim_offer_reply is not null and pt.demo_role is null,
               'phone_token', pt.token, 'live_chat', exists (select 1 from public.chat_sessions cs where cs.linked_request_id = r.id
                  or (p.patient_id is not null and cs.linked_patient_id = p.patient_id)))
               order by r.idx desc), '[]')
             from unnest(o.candidate_ids) c(rid)
             join public.v_requests r on r.id = c.rid join identity.persons p on p.id = r.person_id
             left join public.patients pt on pt.id = p.patient_id
             left join public.offer_responses x on x.offer_id = o.id and x.request_id = r.id))
      into v_offer
    from public.slot_offers o where o.slot_id = s.id order by o.id desc limit 1;
    select jsonb_agg(jsonb_build_object('id', a.id, 'state', a.validation_state, 'reverted', a.reverted, 'rule', a.rule,
             'name', p.display_name, 'short_name', public.short_name(p.display_name), 'code', r.code,
             'validated_by', a.validated_by, 'deadline_min', a.validation_deadline_min, 'attempts', a.attempts,
             'had_appointment', a.previous_appointment_id is not null) order by a.id desc)
      into v_assign
    from public.assignments a join public.requests r on r.id = a.request_id join identity.persons p on p.id = r.person_id
    where a.slot_id = s.id;
    v_prop := case when s.state = 'libre' then public.propose_candidates(s.id) end;
    v := v || jsonb_build_object('id', s.id, 'specialty', s.specialty, 'date', s.date, 'time', s.time, 'state', s.state,
      'origin', s.origin, 'protected', s.protected, 'round', s.round, 'zone', s.zone, 'days', s.days,
      'source_appointment_id', s.source_appointment_id, 'source_name', s.src_name,
      'proposal', v_prop, 'offer', v_offer, 'assignments', coalesce(v_assign, '[]'));
  end loop;
  return v;
end $$;

-- ---------------------------------------------------------------- Admisión: "Por validar"
create or replace function public.staff_validations() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', p.display_name, 'code', r.code,
        'specialty', s.specialty, 'date', s.date, 'time', s.time, 'deadline_min', a.validation_deadline_min, 'attempts', a.attempts,
        'channel', r.preferred_channel, 'origin', a.origin, 'simulated', r.sim_offer_reply is not null and pt.demo_role is null,
        'phone_token', pt.token, 'state', a.validation_state, 'created_at', a.created_at) order by a.id), '[]')
      from public.assignments a join public.requests r on r.id = a.request_id join identity.persons p on p.id = r.person_id
      join public.slots s on s.id = a.slot_id left join public.patients pt on pt.id = p.patient_id
      where a.validation_state = 'pendiente' and not a.reverted),
    'recent', (select coalesce(jsonb_agg(x order by x.id desc), '[]') from (
      select a.id, p.display_name as name, r.code, s.specialty, s.date, s.time, a.validation_state as state, a.validated_by,
             a.validated_role, a.reverted, a.revert_reason, a.origin
      from public.assignments a join public.requests r on r.id = a.request_id join identity.persons p on p.id = r.person_id
      join public.slots s on s.id = a.slot_id where a.validation_state <> 'pendiente' or a.reverted order by a.id desc limit 20) x),
    'reschedules', (select coalesce(jsonb_agg(jsonb_build_object('appointment_id', ap.id, 'name', pt.full_name,
        'specialty', ap.specialty, 'date', ap.date, 'time', ap.time, 'to', ap.reschedule_to) order by ap.id), '[]')
      from public.appointments ap join public.patients pt on pt.id = ap.patient_id where ap.status = 'reprogramacion_pendiente')
  )
$$;

-- ---------------------------------------------------------------- Call center (RF-16)
create or replace function public.callcenter_tasks() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.open desc, x.id desc), '[]') from (
    select t.id, t.type, t.state, t.outcome, t.note, t.source, t.handled_by, t.created_at, t.created_min, t.closed_at,
           t.state <> 'cerrada' as open,
           r.code as request_code, coalesce(p.display_name, ap_pt.full_name, cs.alias) as name,
           coalesce(r.specialty, ap.specialty) as specialty, ap.time as appt_time, ap.date as appt_date,
           t.appointment_id, t.request_id, t.assignment_id, cs.alias as chat_alias,
           coalesce(ap_pt.caregiver_name, null) as caregiver
    from public.staff_tasks t
    left join public.requests r on r.id = t.request_id
    left join identity.persons p on p.id = r.person_id
    left join public.appointments ap on ap.id = t.appointment_id
    left join public.patients ap_pt on ap_pt.id = ap.patient_id
    left join public.chat_sessions cs on cs.id = t.chat_session_id
  ) x
$$;

-- ---------------------------------------------------------------- /demo "En vivo"
create or replace function public.live_overview() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', cs.id, 'alias', cs.alias, 'consent', cs.consent_at is not null,
        'linked_patient', cs.linked_patient_id, 'linked_name', pt.short_name, 'request_code', r.code,
        'sound_ready', cs.sound_ready, 'last_seen_at', cs.last_seen_at, 'created_at', cs.created_at,
        'messages', (select count(*) from public.chat_messages m join public.conversations c on c.id = m.conversation_id where c.session_id = cs.id))
        order by cs.created_at desc), '[]')
      from public.chat_sessions cs left join public.patients pt on pt.id = cs.linked_patient_id
      left join public.requests r on r.id = cs.linked_request_id where cs.expires_at > now()),
    'phones', (select coalesce(jsonb_agg(jsonb_build_object('id', pt.id, 'name', pt.full_name, 'token', pt.token, 'role', pt.demo_role,
        'label', pt.demo_label, 'order', pt.demo_order, 'last_seen_at', pt.last_seen_at, 'sound_ready', pt.sound_ready) order by pt.demo_order), '[]')
      from public.patients pt where pt.demo_role is not null),
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'purpose', c.purpose, 'agent', c.agent,
        'provider', c.provider, 'name', coalesce(pt.short_name, cs.alias), 'summary', c.summary, 'result', c.result,
        'actions', c.actions, 'created_at', c.created_at, 'answered_at', c.answered_at, 'ended_at', c.ended_at,
        'duration_s', c.duration_s) order by c.id desc), '[]')
      from (select * from public.calls where not simulated order by id desc limit 12) c
      left join public.patients pt on pt.id = c.patient_id left join public.chat_sessions cs on cs.id = c.chat_session_id)
  )
$$;

-- ---------------------------------------------------------------- Board v4 (RF-17, proposal section 13)
create or replace function public.board_v4() returns jsonb
language plpgsql stable set search_path = '' as $$
declare v jsonb; v_today date := public.demo_today(); eq jsonb := '[]'; c text; g record; n_list int; n_off int; n_asg int;
begin
  with req as (
    select r.*, e.insurance,
           case when r.state = 'con_cita' and ap.date is not null then ap.date - r.first_attempt_at else v_today - r.first_attempt_at end as wait
    from public.requests r left join identity.equity_attributes e on e.person_id = r.person_id
    left join public.appointments ap on ap.id = r.current_appointment_id
  )
  select jsonb_build_object(
    'registered_without_slot', (select count(*) from req where state in ('pendiente_regulacion', 'pendiente_informacion', 'priorizada_sin_cupo',
                                 'con_oferta', 'en_espera_prioritaria', 'asignada_por_validar')),
    'requests_total', (select count(*) from req),
    'with_care', (select count(*) from req where state in ('con_cita', 'atendida')),
    'pending_regulation', (select count(*) from req where state in ('pendiente_regulacion', 'pendiente_informacion')),
    'wait_median', (select percentile_cont(0.5) within group (order by wait) from req where state not in ('cerrada_con_causal', 'derivada_emergencia')),
    'wait_p90', (select percentile_cont(0.9) within group (order by wait) from req where state not in ('cerrada_con_causal', 'derivada_emergencia')),
    'over_deadline', (select count(*) from req where category is not null and state not in ('cerrada_con_causal', 'derivada_emergencia', 'atendida')
                       and wait > deadline_days),
    'regulated', (select count(*) from req where category is not null and state not in ('cerrada_con_causal', 'derivada_emergencia', 'atendida')),
    'slots_freed', (select count(*) from public.slots where origin in ('liberado', 'domino')),
    'slots_filled', (select count(*) from public.slots where origin in ('liberado', 'domino') and state = 'ocupado'),
    'slots_total', (select count(*) from public.slots),
    'slots_total_filled', (select count(*) from public.slots where state = 'ocupado'),
    'offers_sent', (select count(*) from public.slot_offers),
    'offer_people', (select coalesce(sum(cardinality(candidate_ids)), 0) from public.slot_offers),
    'accepted', (select count(*) from public.offer_responses where response = 'acepta'),
    'declined', (select count(*) from public.offer_responses where response = 'declina'),
    'no_answer', (select count(*) from public.offer_responses where response = 'sin_respuesta'),
    'validations', (select jsonb_object_agg(validation_state, n) from (select validation_state, count(*) n from public.assignments
                     where not reverted group by 1) x),
    'reverted', (select count(*) from public.assignments where reverted),
    'domino', (select count(*) from public.slots where origin = 'domino'),
    'withdrawals', (select coalesce(jsonb_object_agg(reason, n), '{}') from (select reason, count(*) n from public.withdrawals group by 1) x),
    'tasks_today', (select count(*) from public.staff_tasks),
    'tasks_closed', (select count(*) from public.staff_tasks where state = 'cerrada'),
    'tasks_by_type', (select coalesce(jsonb_object_agg(type, n), '{}') from (select type, count(*) n from public.staff_tasks group by 1) x),
    'agent_derivations', (select count(*) from public.staff_tasks where source = 'agente'),
    'agent_calls', (select count(*) from public.calls),
    'agent_calls_answered', (select count(*) from public.calls where answered_at is not null),
    'live_calls', (select count(*) from public.calls where not simulated),
    'appointments_day', (select count(*) from public.appointments where is_base),
    'unanswered_day', (select count(*) from public.appointments where is_base and status in ('sin_respuesta', 'en_llamada')),
    'released_day', (select count(*) from public.appointments where is_base and status in ('liberada', 'reasignada')),
    'confirmed_day', (select count(*) from public.appointments where is_base and status = 'confirmada')
  ) into v;

  -- equity within each category: share of each group among offers and assignments vs among the list
  for c in select distinct category from public.requests where category is not null order by 1 loop
    for g in
      select * from (values ('60+', 'Adultos de 60 años o más'), ('<12', 'Niños menores de 12 años'), ('sin_seguro', 'Sin seguro de salud')) t(key, label)
    loop
      eq := eq || jsonb_build_object('category', c, 'group', g.key, 'label', g.label,
        'list_n', (select count(*) filter (where public.in_group(r.id, g.key)) from public.requests r where r.category = c and r.state <> 'cerrada_con_causal'),
        'list_total', (select count(*) from public.requests r where r.category = c and r.state <> 'cerrada_con_causal'),
        'offer_n', (select count(*) filter (where public.in_group(x, g.key)) from public.slot_offers o, unnest(o.candidate_ids) x
                    join public.requests r on r.id = x where r.category = c),
        'offer_total', (select count(*) from public.slot_offers o, unnest(o.candidate_ids) x join public.requests r on r.id = x where r.category = c),
        'assign_n', (select count(*) filter (where public.in_group(a.request_id, g.key)) from public.assignments a join public.requests r on r.id = a.request_id
                     where r.category = c and not a.reverted),
        'assign_total', (select count(*) from public.assignments a join public.requests r on r.id = a.request_id where r.category = c and not a.reverted));
    end loop;
  end loop;
  return v || jsonb_build_object('equity', eq,
    'params', (select jsonb_object_agg(key, value) from public.params),
    'feed', (select coalesce(jsonb_agg(x order by x.id desc), '[]') from (
       select e.id, e.kind, e.detail, e.actor, e.demo_min, e.created_at from public.events e
       where e.kind in ('oferta', 'asignacion', 'validacion', 'domino', 'reversion') order by e.id desc limit 30) x));
end $$;

create or replace function public.in_group(p_request bigint, p_group text) returns boolean
language sql stable set search_path = '' as $$
  select case p_group
    when '60+' then r.age >= 60
    when '<12' then r.age < 12
    when 'sin_seguro' then coalesce(not e.insurance, false)
    else false end
  from public.requests r left join identity.equity_attributes e on e.person_id = r.person_id where r.id = p_request
$$;

-- the cast names are fixed on every reset
create or replace function public.seed_v4_cast() returns void
language plpgsql set search_path = '' as $$
begin
  perform public.fix_cast_names();
end $$;

do $$
begin
  -- run the name fix inside seed_v4 from now on
  execute $f$
    create or replace function public.reset_demo() returns void
    language plpgsql set search_path = '' as $b$
    begin
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
      update public.patients set last_seen_at = null, sound_ready = false where last_seen_at is not null or sound_ready;
      update public.waitlist set status = 'en_espera', updated_at = now() where status <> 'en_espera';
      update public.demo_state
         set clock_base_min = 480, clock_started_at = null, reminders_sent_min = null, revealed = false,
             demo_date = '2023-10-16', version = version + 1, updated_at = now()
       where id = 1;
      delete from public.metrics where key = 'reveal';
      perform setval('public.appointment_extra_seq', 100001, false);
      perform public.fix_cast_names();
      perform public.seed_v4();
      perform public.notify('full');
    end $b$;
  $f$;
end $$;

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
