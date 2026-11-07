-- AsistIA E5, hito 4: waiting list and assignment rules of proposal v5.1 (section 3.5).
--
-- Order of the list: LEXICOGRAPHIC, not a combined index.
--   (1) the clinical category a professional assigned, P1 > P2 > P3 > P4 (a P3 never outranks a P2);
--   (2) within the category, the fraction of the maximum deadline already consumed since the first attempt,
--       R = min(days / deadline, 1), deadlines 30 / 90 / 180 / 360 days, descending (SWALIS-2020);
--   (3) ties (two at 100 %): the earliest first attempt.
-- No bonuses (v4 added 0.15 for a first visit and 0.10 for preferential care). Never uses insurance, sex,
-- past no-shows or whether the person has an appointment.
--
-- Two assignment variants among those who accepted an offer, chosen by params.regla_asignacion:
--   1 = 'ventana_prioridad' (default): the window closes and the slot goes to the highest priority acceptor;
--   0 = 'primero_acepta' (as at Mayo Clinic): the slot goes to whoever accepted first.
-- params.value is numeric not null, so the rule is stored as 1 / 0 and read through assignment_rule_v51().
--
-- ADDITIVE ONLY. The database is shared with the deployed demo (branch main) until the merge, so this file
-- creates NEW objects and does not alter, drop or replace anything main uses: `create function` and
-- `create view` (no `or replace`), so applying it twice, or over an existing name, FAILS instead of replacing.
-- The only data it writes is ONE NEW params row (`insert … on conflict do nothing`); it changes no existing row.
-- public.v_requests, staff_requests(), staff_slots(), propose_candidates(), approve_offer(), close_offer(),
-- assign_next() and demo_tick() keep the v4 behaviour for main.
--
-- breakeven_r (0.053 -> 0.052) is an existing params row that production shows: NOT changed here.
-- See supabase/data/20261107_breakeven_v51.sql. Switch of the v4 functions at the merge:
-- supabase/merge/20261107_v51_switch.sql. Inverse: supabase/rollback/20261107020000_e5_v51_priority.down.sql

-- ---------------------------------------------------------------- the assignment rule (new params row)
insert into public.params (key, value, label, unit, sort) values
  ('regla_asignacion', 1, 'Regla de asignación (1 = mayor prioridad al cierre de la ventana, 0 = primero que acepta)', '', 21)
on conflict (key) do nothing;

create function public.assignment_rule_v51() returns text
language sql stable set search_path = '' as $$
  select case when (select value from public.params where key = 'regla_asignacion') = 0 then 'primero_acepta'
              else 'ventana_prioridad' end
$$;

-- ---------------------------------------------------------------- the priority
-- The value shown: the fraction of the deadline consumed. Its only inputs are the days waited and the deadline
-- of the category: by construction it cannot read insurance, sex, the no-show history or an appointment.
create function public.priority_v51(p_days_waited int, p_deadline_days int) returns numeric
language sql immutable set search_path = '' as $$
  select case when p_deadline_days is null or p_deadline_days <= 0 then null
              else round(least(greatest(coalesce(p_days_waited, 0), 0)::numeric / p_deadline_days, 1), 4) end
$$;

-- 1 for P1 ... 4 for P4; no category yet = provisional P3 (as deadline_for does)
create function public.category_rank_v51(p_category text) returns int
language sql immutable set search_path = '' as $$
  select case p_category when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 when 'P4' then 4 else 3 end
$$;

-- Sort key, DESCENDING: the category in the tens (P1 = 40, P2 = 30, P3 = 20, P4 = 10) plus R in [0, 1].
-- Since R <= 1 < 10, the category always decides first: a P3 at 100 % (21) stays below a P2 at 0 % (30).
create function public.priority_sort_key_v51(p_category text, p_days_waited int, p_deadline_days int) returns numeric
language sql immutable set search_path = '' as $$
  select (5 - public.category_rank_v51(p_category)) * 10 + coalesce(public.priority_v51(p_days_waited, p_deadline_days), 0)
$$;

-- ---------------------------------------------------------------- the list, with the v5.1 priority
-- Same column names as public.v_requests (idx, reason, pct_deadline...) so a reader can switch by changing only
-- the source. idx = deadline fraction (displayed); category_rank and sort_key order the list; reason says only
-- what orders it ("P2 · 69 % de su plazo"); no grammar_sex column and identity.equity_attributes is not read.
create view public.v_requests_v51 as
with base as (
  select r.*,
         coalesce(r.category, 'P3') as eff_category,
         greatest(0, public.demo_today() - r.first_attempt_at) as days_waited,
         public.deadline_for(r.category) as eff_deadline,
         (r.pregnant or r.age < 5 or r.age >= 60 or r.disability) as preferential   -- shown only, never ordered by
  from public.requests r
)
select b.*,
       public.priority_v51(b.days_waited, b.eff_deadline) as idx,
       public.category_rank_v51(b.category) as category_rank,
       public.priority_sort_key_v51(b.category, b.days_waited, b.eff_deadline) as sort_key,
       round(100 * least(b.days_waited::numeric / b.eff_deadline, 9.99))::int as pct_deadline,
       concat_ws(' · ',
         case when b.category is null then 'P3 provisional' else b.category end,
         round(100 * b.days_waited::numeric / b.eff_deadline)::int || ' % de su plazo') as reason
from base b;

-- ---------------------------------------------------------------- Admisión: waiting list (copy of staff_requests)
create function public.staff_requests_v51() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.ord, x.sort_key desc, x.first_attempt_at, x.id), '[]') from (
    select r.id, r.code, p.display_name as name, public.short_name(p.display_name) as short_name, r.specialty, r.category,
           r.eff_category as cat, r.days_waited, r.eff_deadline as deadline, r.pct_deadline, r.first_visit, r.preferential,
           r.idx, r.sort_key, r.reason, r.state, r.preferred_channel, r.short_notice_ok, r.source, r.age, r.modality,
           r.first_attempt_at, r.due_date,
           ca.date as appt_date, ca.time as appt_time,
           exists (select 1 from public.chat_sessions cs where cs.linked_request_id = r.id or
                   (p.patient_id is not null and cs.linked_patient_id = p.patient_id)) as live_chat,
           pt.token as phone_token,
           case when r.state in ('cerrada_con_causal', 'atendida', 'derivada_emergencia') then 2
                when r.state in ('pendiente_regulacion', 'pendiente_informacion') then 1 else 0 end as ord
    from public.v_requests_v51 r
    join identity.persons p on p.id = r.person_id
    left join public.patients pt on pt.id = p.patient_id and pt.demo_role is not null
    left join public.appointments ca on ca.id = r.current_appointment_id
  ) x
$$;

-- detail of one request (copy of staff_request_detail; the FHIR export reads it too)
create function public.staff_request_detail_v51(p_request bigint) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'request', (select to_jsonb(r) from public.v_requests_v51 r where r.id = p_request),
    'person', (select jsonb_build_object('name', p.display_name, 'doc', (select type from identity.person_identifiers i where i.person_id = p.id limit 1),
                                         'insurance', e.insurance, 'district', e.district, 'origin_facility', e.origin_facility)
               from public.requests r join identity.persons p on p.id = r.person_id
               left join identity.equity_attributes e on e.person_id = p.id where r.id = p_request),
    'events', (select coalesce(jsonb_agg(to_jsonb(ev) order by ev.id desc), '[]') from public.request_events ev where ev.request_id = p_request),
    'withdrawal', (select to_jsonb(w) from public.withdrawals w where w.request_id = p_request order by id desc limit 1)
  )
$$;

-- ---------------------------------------------------------------- free slot proposal (copy of propose_candidates)
-- Same eligibility filter, k and fill probability as public.propose_candidates(); only the order changes.
create function public.propose_candidates_v51(p_slot bigint) returns jsonb
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
    from public.v_requests_v51 r
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
    order by (r.state = 'en_espera_prioritaria') desc, r.sort_key desc, r.first_attempt_at, r.id
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

-- ---------------------------------------------------------------- the rule an offer was sent with
-- approve_offer_v51() writes it in the 'oferta' events of the offer, so changing the parameter while an offer
-- is open does not change the rule its candidates were told. Offers sent by the v4 approve_offer() have no
-- rule in their events: they keep the v4 promise ('ventana_prioridad').
create function public.offer_rule_v51(p_offer bigint) returns text
language sql stable set search_path = '' as $$
  select coalesce((select e.payload->>'rule' from public.request_events e
                    where e.type = 'oferta' and e.payload->>'offer' = p_offer::text and e.payload ? 'rule'
                    order by e.id limit 1), 'ventana_prioridad')
$$;

-- ---------------------------------------------------------------- Admisión: free slots (copy of staff_slots)
create function public.staff_slots_v51() returns jsonb
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
               order by r.sort_key desc, r.first_attempt_at, r.id), '[]')
             from unnest(o.candidate_ids) c(rid)
             join public.v_requests_v51 r on r.id = c.rid join identity.persons p on p.id = r.person_id
             left join public.patients pt on pt.id = p.patient_id
             left join public.offer_responses x on x.offer_id = o.id and x.request_id = r.id))
           || jsonb_build_object('rule', public.offer_rule_v51(o.id))
      into v_offer
    from public.slot_offers o where o.slot_id = s.id order by o.id desc limit 1;
    select jsonb_agg(jsonb_build_object('id', a.id, 'state', a.validation_state, 'reverted', a.reverted, 'rule', a.rule,
             'name', p.display_name, 'short_name', public.short_name(p.display_name), 'code', r.code,
             'validated_by', a.validated_by, 'deadline_min', a.validation_deadline_min, 'attempts', a.attempts,
             'had_appointment', a.previous_appointment_id is not null) order by a.id desc)
      into v_assign
    from public.assignments a join public.requests r on r.id = a.request_id join identity.persons p on p.id = r.person_id
    where a.slot_id = s.id;
    v_prop := case when s.state = 'libre' then public.propose_candidates_v51(s.id) end;
    v := v || jsonb_build_object('id', s.id, 'specialty', s.specialty, 'date', s.date, 'time', s.time, 'state', s.state,
      'origin', s.origin, 'protected', s.protected, 'round', s.round, 'zone', s.zone, 'days', s.days,
      'source_appointment_id', s.source_appointment_id, 'source_name', s.src_name,
      'proposal', v_prop, 'offer', v_offer, 'assignments', coalesce(v_assign, '[]'));
  end loop;
  return v;
end $$;

-- ---------------------------------------------------------------- RF-06: approve and send (copy of approve_offer)
-- Sends exactly the list the panel shows (propose_candidates_v51) and tells the candidates the rule in force.
create function public.approve_offer_v51(p_slot bigint, p_actor text default 'Admisión')
returns bigint language plpgsql set search_path = '' as $$
declare s public.slots; prop jsonb; v_offer bigint; v_now int; v_close int; c jsonb; v_ids bigint[];
        v_req public.requests; v_patient text; v_first boolean; v_text text; v_close_txt text; v_rule text;
begin
  select * into s from public.slots where id = p_slot for update;
  if s.id is null then raise exception 'slot not found'; end if;
  if s.state <> 'libre' then raise exception 'slot is not free'; end if;
  if exists (select 1 from public.slot_offers where slot_id = p_slot and state = 'enviada') then
    raise exception 'there is already an open offer for this slot';
  end if;
  prop := public.propose_candidates_v51(p_slot);
  if (prop->>'k')::int = 0 then raise exception 'no candidates'; end if;
  select array_agg((x->>'request_id')::bigint) into v_ids from jsonb_array_elements(prop->'candidates') x;
  v_rule := public.assignment_rule_v51();
  v_now := public.demo_now_min();
  v_close := v_now + public.param('offer_window_min')::int;
  v_close_txt := public.fmt_min(v_close);
  insert into public.slot_offers (slot_id, zone, k, fill_probability, candidate_ids, approved_by, sent_min, closes_min, round)
  values (p_slot, prop->>'zone', (prop->>'k')::int, (prop->>'fill_probability')::numeric, v_ids, p_actor, v_now, v_close, s.round)
  returning id into v_offer;
  update public.slots set state = 'retenido', updated_at = now() where id = p_slot;

  v_text := 'Se liberó un cupo de ' || s.specialty || ' el ' || public.fmt_slot(s.date, s.time) ||
    '. Recibe la oferta junto con otros pacientes de la lista; ' ||
    case when v_rule = 'primero_acepta' then 'el cupo es para quien acepte primero. '
         else 'al cerrar el plazo se asigna según la prioridad publicada, no según quién responde primero. ' end ||
    '¿Lo quiere? Tiene hasta las ' || v_close_txt ||
    '. Si dice que no, conserva su lugar en la lista.';
  for c in select * from jsonb_array_elements(prop->'candidates') loop
    select * into v_req from public.requests where id = (c->>'request_id')::bigint for update;
    v_first := not exists (select 1 from public.request_events where request_id = v_req.id and type = 'primera_oferta');
    update public.requests set state = 'con_oferta', updated_at = now() where id = v_req.id;
    if v_first then perform public.req_event(v_req.id, 'primera_oferta', p_actor, jsonb_build_object('offer', v_offer)); end if;
    perform public.req_event(v_req.id, 'oferta', p_actor, jsonb_build_object('offer', v_offer, 'slot', p_slot, 'zone', prop->>'zone',
      'rule', v_rule));
    v_patient := public.request_patient(v_req.id);
    perform public.deliver(v_patient, v_req.id, v_text, '["Acepto", "No puedo"]'::jsonb, 'oferta', v_offer);
    -- RF-15: people who chose a call get the offer agent on their phone
    if v_req.preferred_channel = 'llamada' and v_patient is not null then
      perform public.start_request_call(v_req.id, 'oferta', v_offer, null);
    end if;
  end loop;
  perform public.activity('Cupo ' || to_char(s.date, 'DD/MM') || ' ' || s.time || ' de ' || s.specialty ||
    ' ofrecido a ' || (prop->>'k') || ' (zona ' || (prop->>'zone') || ', ' ||
    round((prop->>'fill_probability')::numeric * 100) || ' % de probabilidad de llenarlo; regla: ' ||
    case when v_rule = 'primero_acepta' then 'primero que acepta' else 'mayor prioridad al cierre' end ||
    '). Aprobó: ' || p_actor,
    p_actor, s.source_appointment_id, 'oferta');
  perform public.hint('slot');
  return v_offer;
end $$;

-- ---------------------------------------------------------------- RF-07: close the offer (copy of close_offer)
-- 'ventana_prioridad': the highest priority among those who accepted (category first, then deadline fraction).
-- 'primero_acepta': whoever accepted first. Either way the other acceptors wait first in line.
create function public.close_offer_v51(p_offer bigint, p_actor text default 'Admisión')
returns bigint language plpgsql set search_path = '' as $$
declare o public.slot_offers; s public.slots; w record; f record; b record; v_a bigint; acc record; v_n int; v_detail text;
        v_rule text;
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
  v_rule := public.offer_rule_v51(p_offer);

  -- b: highest priority acceptor; f: first acceptor
  select r.id, r.eff_category, r.pct_deadline, p.display_name into b
  from public.offer_responses x join public.v_requests_v51 r on r.id = x.request_id join identity.persons p on p.id = r.person_id
  where x.offer_id = p_offer and x.response = 'acepta'
  order by r.sort_key desc, r.first_attempt_at, r.id limit 1;
  select r.id, r.eff_category, r.pct_deadline, p.display_name into f
  from public.offer_responses x join public.v_requests_v51 r on r.id = x.request_id join identity.persons p on p.id = r.person_id
  where x.offer_id = p_offer and x.response = 'acepta' order by x.at, x.id limit 1;

  if v_rule = 'primero_acepta' then
    w := f;
    v_a := public.make_assignment(s.id, p_offer, w.id, 'primero_acepta');
    v_detail := 'Asignado a ' || public.short_name(w.display_name) || ', el primero que aceptó (' ||
                w.eff_category || ', ' || w.pct_deadline || ' % de su plazo)' ||
                case when b.id <> w.id then '. Con la regla de mayor prioridad habría sido ' || public.short_name(b.display_name) ||
                     ' (' || b.eff_category || ', ' || b.pct_deadline || ' % de su plazo)' else '' end || '.';
  else
    w := b;
    v_a := public.make_assignment(s.id, p_offer, w.id, 'mayor_prioridad');
    v_detail := 'Asignado a ' || public.short_name(w.display_name) || ' (mayor prioridad: ' ||
                w.eff_category || ', ' || w.pct_deadline || ' % de su plazo)' ||
                case when f.id <> w.id then ' aunque ' || split_part(f.display_name, ' ', 1) || ' respondió primero (' ||
                     f.eff_category || ', ' || f.pct_deadline || ' % de su plazo)' else '' end || '.';
  end if;
  perform public.activity(v_detail, p_actor, s.source_appointment_id, 'asignacion');

  -- the other acceptors wait first in line for the next slot of their zone
  for acc in
    select x.request_id from public.offer_responses x where x.offer_id = p_offer and x.response = 'acepta' and x.request_id <> w.id
  loop
    update public.requests set state = 'en_espera_prioritaria', updated_at = now() where id = acc.request_id;
    perform public.req_event(acc.request_id, 'espera_prioritaria', 'Sistema', jsonb_build_object('offer', p_offer));
    perform public.deliver(public.request_patient(acc.request_id), acc.request_id,
      case when v_rule = 'primero_acepta' then 'Esta vez el cupo fue para quien aceptó primero.'
           else 'Esta vez el cupo fue para un paciente con mayor prioridad.' end ||
      ' Usted queda primero para el próximo cupo de su zona.',
      null, 'info', p_offer);
  end loop;
  perform public.hint('slot');
  return v_a;
end $$;

-- Next acceptor (validation failed or expired), with the rule of the offer; otherwise a new round
create function public.assign_next_v51(p_slot bigint, p_offer bigint) returns bigint
language plpgsql set search_path = '' as $$
declare v_next bigint; s public.slots; v_rule text;
begin
  v_rule := public.offer_rule_v51(p_offer);
  select r.id into v_next
  from public.offer_responses x join public.v_requests_v51 r on r.id = x.request_id
  where x.offer_id = p_offer and x.response = 'acepta' and r.state = 'en_espera_prioritaria'
    and not exists (select 1 from public.assignments a where a.slot_id = p_slot and a.request_id = r.id)
  order by case when v_rule = 'primero_acepta' then null else r.sort_key end desc,   -- ventana_prioridad: priority
           case when v_rule = 'primero_acepta' then x.at end,                      -- primero_acepta: answer time
           r.first_attempt_at, r.id limit 1;
  if v_next is not null then
    perform public.activity(case when v_rule = 'primero_acepta' then 'El cupo pasa al siguiente que aceptó, en orden de respuesta'
                                 else 'El cupo pasa al siguiente que aceptó, en orden de prioridad' end, 'Sistema',
      (select source_appointment_id from public.slots where id = p_slot), 'asignacion');
    return public.make_assignment(p_slot, p_offer, v_next, 'siguiente_aceptante');
  end if;
  select * into s from public.slots where id = p_slot;
  update public.slots set state = 'libre', round = round + 1, updated_at = now() where id = p_slot;
  perform public.activity('Sin otros aceptantes: el cupo ' || to_char(s.date, 'DD/MM') || ' ' || s.time ||
    ' vuelve a Por reasignar (zona siguiente)', 'Sistema', s.source_appointment_id, 'oferta');
  return null;
end $$;

-- ---------------------------------------------------------------- the offer part of demo_tick, with the v5.1 rules
-- The /api/staff "tick" of this branch and advance_clock_v51() call this BEFORE demo_tick(). It runs the last four steps of demo_tick()
-- in the same order (simulated offer answers, closed windows, simulated validations, validation timeouts) but
-- closes with close_offer_v51() and passes the slot on with assign_next_v51(); demo_tick() then finds nothing
-- left to do in those steps. Same row locks (skip locked) as demo_tick().
create function public.demo_tick_offers_v51() returns int
language plpgsql set search_path = '' as $$
declare v_now int; s public.demo_state; v_changes int := 0; r record;
begin
  select * into s from public.demo_state where id = 1;
  if s.clock_started_at is null then return 0; end if;
  v_now := public.demo_now_min();

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
    perform public.close_offer_v51(r.id, 'Sistema (venció la ventana)');
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
    perform public.assign_next_v51(r.slot_id, r.offer_id);
    v_changes := v_changes + 1;
  end loop;

  if v_changes > 0 then
    update public.demo_state set version = version + 1, updated_at = now() where id = 1;
  end if;
  return v_changes;
end $$;

-- Copy of advance_clock() (init_schema), which runs demo_tick() itself: the offer steps go first with the v5.1 rules.
create function public.advance_clock_v51(p_minutes int) returns void
language plpgsql set search_path = '' as $$
begin
  update public.demo_state
     set clock_base_min = clock_base_min + p_minutes, updated_at = now(), version = version + 1
   where id = 1;
  perform public.demo_tick_offers_v51();
  perform public.demo_tick();
  perform public.notify('bulk');
end $$;

-- ---------------------------------------------------------------- access: server key only (new objects only)
revoke all on public.v_requests_v51 from anon, authenticated;
grant select on public.v_requests_v51 to service_role;

revoke all on function public.assignment_rule_v51() from public, anon, authenticated;
revoke all on function public.priority_v51(int, int) from public, anon, authenticated;
revoke all on function public.category_rank_v51(text) from public, anon, authenticated;
revoke all on function public.priority_sort_key_v51(text, int, int) from public, anon, authenticated;
revoke all on function public.staff_requests_v51() from public, anon, authenticated;
revoke all on function public.staff_request_detail_v51(bigint) from public, anon, authenticated;
revoke all on function public.propose_candidates_v51(bigint) from public, anon, authenticated;
revoke all on function public.staff_slots_v51() from public, anon, authenticated;
revoke all on function public.offer_rule_v51(bigint) from public, anon, authenticated;
revoke all on function public.approve_offer_v51(bigint, text) from public, anon, authenticated;
revoke all on function public.close_offer_v51(bigint, text) from public, anon, authenticated;
revoke all on function public.assign_next_v51(bigint, bigint) from public, anon, authenticated;
revoke all on function public.demo_tick_offers_v51() from public, anon, authenticated;
revoke all on function public.advance_clock_v51(int) from public, anon, authenticated;
grant execute on function public.assignment_rule_v51() to service_role;
grant execute on function public.priority_v51(int, int) to service_role;
grant execute on function public.category_rank_v51(text) to service_role;
grant execute on function public.priority_sort_key_v51(text, int, int) to service_role;
grant execute on function public.staff_requests_v51() to service_role;
grant execute on function public.staff_request_detail_v51(bigint) to service_role;
grant execute on function public.propose_candidates_v51(bigint) to service_role;
grant execute on function public.staff_slots_v51() to service_role;
grant execute on function public.offer_rule_v51(bigint) to service_role;
grant execute on function public.approve_offer_v51(bigint, text) to service_role;
grant execute on function public.close_offer_v51(bigint, text) to service_role;
grant execute on function public.assign_next_v51(bigint, bigint) to service_role;
grant execute on function public.demo_tick_offers_v51() to service_role;
grant execute on function public.advance_clock_v51(int) to service_role;
