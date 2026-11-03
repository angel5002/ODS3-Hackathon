-- Correct plural in the slot offer message ("1 día").
create or replace function public.make_offer(p_slot bigint, p_waitlist bigint, p_actor text default 'Personal de citas')
returns bigint language plpgsql set search_path = '' as $$
declare s public.appointments; w public.waitlist; p public.patients; v_offer bigint; v_now int; v_exp int; v_day text;
begin
  select * into s from public.appointments where id = p_slot for update;
  if s.status <> 'liberada' then raise exception 'slot is not free'; end if;
  select * into w from public.waitlist where id = p_waitlist for update;
  if w.status = 'asignado' then raise exception 'patient already has a slot'; end if;
  if w.specialty <> s.specialty then raise exception 'specialty mismatch'; end if;
  if exists (select 1 from public.offers where slot_id = p_slot and status = 'enviada') then
    raise exception 'there is already an open offer for this slot';
  end if;
  select * into p from public.patients where id = w.patient_id;
  v_now := public.demo_now_min();
  select v_now + offer_deadline_min, day_label into v_exp, v_day from public.demo_state where id = 1;

  insert into public.offers (slot_id, waitlist_id, patient_id, expires_min)
  values (p_slot, p_waitlist, w.patient_id, v_exp) returning id into v_offer;
  update public.waitlist set status = 'ofertado', updated_at = now() where id = p_waitlist;
  insert into public.messages (patient_id, offer_id, direction, kind, body, buttons, demo_min)
  values (w.patient_id, v_offer, 'saliente', 'oferta',
    'Hola ' || public.greeting_name(p) || ', se liberó un cupo de ' || s.specialty || ' para mañana, ' || v_day ||
    ', a las ' || s.time || '. Usted está en la lista de espera desde hace ' || w.wait_days ||
    case when w.wait_days = 1 then ' día' else ' días' end || '. ¿Desea tomarlo? Responda antes de las ' || public.fmt_min(v_exp) || '.',
    '["Acepto", "No puedo"]'::jsonb, v_now);
  insert into public.events (appointment_id, patient_id, kind, channel, actor, detail, demo_min)
  values (p_slot, w.patient_id, 'oferta', 'panel', p_actor,
          'Cupo ofrecido a ' || p.full_name || ' (lista de espera, ' || w.wait_days || case when w.wait_days = 1 then ' día)' else ' días)' end, v_now);
  perform public.notify('offer', array[p_slot], array[w.patient_id]);
  return v_offer;
end $$;

revoke execute on function public.make_offer(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.make_offer(bigint, bigint, text) to service_role;
