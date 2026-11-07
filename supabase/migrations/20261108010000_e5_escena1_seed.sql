-- E5 · final, scene 1 (insumos/AsistIA_Guion_Pitch_v7.pdf §3): Tito, 62, needs an Oncología Médica consultation
-- "cuanto antes" and got an appointment in 5 weeks. A PROFESSIONAL assigned his clinical category (P1); the AI
-- never prioritises. When the jury card "Carmen" (track E) releases her Oncología Médica slot of Thursday 19/10,
-- the STAFF approves the offer on screen and Tito, first in the list by category, gets it.
--
-- ADDITIVE ONLY: two NEW functions. No table, view or existing function is created, altered or replaced; the
-- existing ones (seed_person, seed_request, future_appointment, regulate, propose_candidates_v51,
-- approve_offer_v51, respond_offer) are only called. reset_demo() deletes Tito like any other request: call
-- seed_escena1() again after a reset (docs/escenas.md).

-- Creates Tito (or puts him back in the scene's starting state) and returns his request. Idempotent.
create function public.seed_escena1(p_specialty text default 'Oncología Médica')
returns jsonb language plpgsql set search_path = '' as $$
declare v_person uuid; r public.requests; v_req bigint; v_appt bigint; v_date date; v_days int := 3; v_best numeric;
begin
  if p_specialty is null or not exists (select 1 from public.appointments where specialty = p_specialty limit 1) then
    raise exception 'specialty required';
  end if;
  v_date := public.demo_today() + 35;   -- "¡Me dieron cita para dentro de cinco semanas!"

  -- his clock starts when his doctor referred him (3 days ago); only if another P1 of the specialty has waited a
  -- larger fraction of the 30-day deadline is the referral moved back, so that he is first in the v5.1 order
  select max(x.idx) into v_best from public.v_requests_v51 x join identity.persons p on p.id = x.person_id
   where x.specialty = p_specialty and x.category = 'P1' and p.display_name <> 'Tito Quispe Rojas'
     and x.state in ('priorizada_sin_cupo', 'en_espera_prioritaria', 'con_cita');
  if v_best is not null then
    v_days := least(29, greatest(v_days, ceil(v_best * public.deadline_for('P1'))::int + 1));
  end if;

  select p.id into v_person from identity.persons p where p.display_name = 'Tito Quispe Rojas' order by p.created_at desc limit 1;
  if v_person is not null then
    select * into r from public.requests where person_id = v_person order by id desc limit 1;
  end if;

  -- mid-scene (open offer or assignment): leave it as it is
  if r.id is not null and (r.state in ('con_oferta', 'asignada_por_validar')
     or exists (select 1 from public.assignments a where a.request_id = r.id and not a.reverted and a.validation_state <> 'vencida')) then
    return jsonb_build_object('request_id', r.id, 'code', r.code, 'state', r.state, 'changed', false);
  end if;

  if r.id is null then
    if v_person is null then
      v_person := public.seed_person('Tito Quispe Rojas', 62, 'M', true, 'Villa El Salvador', null, 'dni');
    end if;
    v_appt := public.future_appointment(null, p_specialty, v_date, '09:00');
    v_req := public.seed_request(v_person, p_specialty, null, v_days, 62, true, true, 'pendiente_regulacion', 'acepta',
      'Su médico le pidió una consulta de oncología cuanto antes.', v_appt, null, false, false, 'llamada', true);
  else
    v_req := r.id;
    v_appt := r.current_appointment_id;
    if v_appt is null or not exists (select 1 from public.appointments where id = v_appt) then
      v_appt := public.future_appointment(null, p_specialty, v_date, '09:00');
      update public.appointments set request_id = v_req where id = v_appt;
    else
      update public.appointments set specialty = p_specialty, date = v_date, time = '09:00', status = 'pendiente', updated_at = now()
       where id = v_appt;
    end if;
    update public.requests
       set specialty = p_specialty, current_appointment_id = v_appt, state = 'pendiente_regulacion', category = null,
           deadline_days = null, due_date = null, first_attempt_at = public.demo_today() - v_days, last_moved_at = null,
           accepts_earlier = true, short_notice_ok = true, sim_offer_reply = 'acepta', preferred_channel = 'llamada',
           modality = 'presencial', updated_at = now()
     where id = v_req;
  end if;

  -- the clinical category is assigned by a professional (never by the system)
  perform public.regulate(v_req, 'P1', 'Profesional');
  select * into r from public.requests where id = v_req;
  return jsonb_build_object('request_id', r.id, 'code', r.code, 'state', r.state, 'category', r.category,
    'first_attempt_at', r.first_attempt_at, 'due_date', r.due_date, 'appointment_id', r.current_appointment_id,
    'appointment_date', v_date, 'changed', true);
end $$;

-- /demo, scene 1 hand-off: the STAFF approves the offer of a released slot (approve_offer_v51, the same action as
-- the panel), and Tito's "¡Sí, sí lo quiero!" on the call is recorded as his answer (respond_offer, channel voz).
-- Refuses unless Tito is the first candidate of the proposal for that slot. With p_close the staff also closes
-- the offer now (close_offer_v51): the slot goes to the highest priority among those who accepted.
create function public.escena1_offer_to_tito(p_slot bigint, p_actor text default 'Admisión', p_close boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare v_req bigint; prop jsonb; v_offer bigint; v_assign bigint;
begin
  select r.id into v_req from public.requests r join identity.persons p on p.id = r.person_id
   where p.display_name = 'Tito Quispe Rojas' order by r.id desc limit 1;
  if v_req is null then raise exception 'tito not seeded'; end if;
  prop := public.propose_candidates_v51(p_slot);
  if coalesce((prop->'candidates'->0->>'request_id')::bigint, -1) <> v_req then raise exception 'tito is not first for this slot'; end if;
  v_offer := public.approve_offer_v51(p_slot, p_actor);
  perform public.respond_offer(v_offer, v_req, 'acepta', 'voz');
  if p_close then v_assign := public.close_offer_v51(v_offer, p_actor); end if;
  return jsonb_build_object('offer_id', v_offer, 'request_id', v_req, 'assignment_id', v_assign,
    'candidates', jsonb_array_length(prop->'candidates'), 'zone', prop->>'zone');
end $$;

revoke all on function public.seed_escena1(text) from public, anon, authenticated;
revoke all on function public.escena1_offer_to_tito(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.seed_escena1(text) to service_role;
grant execute on function public.escena1_offer_to_tito(bigint, text, boolean) to service_role;
