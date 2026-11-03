-- Core schema for the prototype.
-- Browser (anon / publishable key): read-only on everything except appointment_outcomes.
-- Server (service_role / secret key): all writes, through the functions below.
-- Realtime: every state-changing function broadcasts one small hint on the public
-- topic 'demo'; clients refetch from the tables (the tables stay the source of truth).

-- ---------------------------------------------------------------- tables

create table public.patients (
  id text primary key,
  full_name text not null,
  first_name text not null,
  short_name text not null,
  sex text not null check (sex in ('F', 'M')),
  age int not null,
  phone text not null,
  caregiver_name text,
  caregiver_relation text,
  token text not null unique,
  demo_role text,
  demo_label text,
  demo_order int
);

create table public.appointments (
  id bigint primary key,
  patient_id text not null references public.patients (id),
  specialty text not null,
  date date not null,
  time text not null,
  remote boolean not null default false,
  insured boolean not null default true,
  wait_days int,
  prev_n int,
  prev_no_shows int,
  risk real,
  risk_rank int,
  factors jsonb not null default '[]',
  sim_reply text check (sim_reply in ('confirma', 'libera', 'persona')),
  sim_delay_min int,
  status text not null default 'pendiente' check (status in (
    'pendiente', 'recordatorio_enviado', 'confirmada', 'liberada', 'sin_respuesta',
    'en_llamada', 'derivada_a_persona', 'reasignada')),
  status_channel text,
  status_at timestamptz,
  reminder_at_min int,
  origin text not null default 'agenda' check (origin in ('agenda', 'lista_espera')),
  replaces_id bigint references public.appointments (id) on delete cascade,
  reassigned_to_id bigint,
  is_base boolean not null default true,
  updated_at timestamptz not null default now()
);
create index appointments_status_idx on public.appointments (status);
create index appointments_patient_idx on public.appointments (patient_id);
create index appointments_specialty_idx on public.appointments (specialty);

create sequence public.appointment_extra_seq start 100001;

-- Real outcome of the demo day: hidden from the browser until "Ver qué pasó" (RF-37).
create table public.appointment_outcomes (
  appointment_id bigint primary key references public.appointments (id) on delete cascade,
  no_show boolean not null
);

create table public.waitlist (
  id bigint primary key,
  patient_id text not null references public.patients (id),
  specialty text not null,
  wait_days int not null,
  requested_on date,
  status text not null default 'en_espera' check (status in ('en_espera', 'ofertado', 'asignado')),
  updated_at timestamptz not null default now()
);
create index waitlist_specialty_idx on public.waitlist (specialty, wait_days desc);

create table public.offers (
  id bigint generated always as identity primary key,
  slot_id bigint not null references public.appointments (id) on delete cascade,
  waitlist_id bigint not null references public.waitlist (id),
  patient_id text not null references public.patients (id),
  status text not null default 'enviada' check (status in ('enviada', 'aceptada', 'rechazada', 'vencida', 'retirada')),
  expires_min int not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  new_appointment_id bigint
);
create index offers_slot_idx on public.offers (slot_id);
create index offers_patient_idx on public.offers (patient_id);

create table public.messages (
  id bigint generated always as identity primary key,
  patient_id text not null references public.patients (id),
  appointment_id bigint references public.appointments (id) on delete cascade,
  offer_id bigint references public.offers (id) on delete cascade,
  direction text not null check (direction in ('saliente', 'entrante')),
  kind text not null default 'info' check (kind in ('recordatorio', 'oferta', 'info', 'respuesta')),
  body text not null,
  buttons jsonb,
  answered_with text,
  demo_min int,
  created_at timestamptz not null default now()
);
create index messages_patient_idx on public.messages (patient_id, id);
create index messages_appointment_idx on public.messages (appointment_id);

create table public.calls (
  id bigint generated always as identity primary key,
  appointment_id bigint not null references public.appointments (id) on delete cascade,
  patient_id text not null references public.patients (id),
  status text not null default 'sonando' check (status in ('sonando', 'en_curso', 'finalizada', 'no_contesta', 'rechazada')),
  agent text not null default 'guion',
  result text,
  transcript jsonb not null default '[]',
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index calls_patient_idx on public.calls (patient_id, id);
create index calls_appointment_idx on public.calls (appointment_id);

create table public.events (
  id bigint generated always as identity primary key,
  appointment_id bigint references public.appointments (id) on delete cascade,
  patient_id text references public.patients (id),
  kind text not null default 'estado',
  from_status text,
  to_status text,
  channel text not null check (channel in ('panel', 'mensaje', 'voz', 'sistema')),
  actor text not null,
  detail text,
  demo_min int,
  created_at timestamptz not null default now()
);
create index events_appointment_idx on public.events (appointment_id, id);
create index events_created_idx on public.events (id desc);

create table public.demo_state (
  id int primary key default 1 check (id = 1),
  day_label text not null default '',
  clock_base_min int not null default 540,
  clock_started_at timestamptz,
  speed real not null default 60,
  reminders_sent_min int,
  reply_deadline_min int not null default 180,
  offer_deadline_min int not null default 45,
  call_list_pct real not null default 0.10,
  threshold_high real not null default 0.41,
  threshold_mid real not null default 0.27,
  simulate_others boolean not null default true,
  revealed boolean not null default false,
  version int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.metrics (
  key text primary key,
  value jsonb not null
);

-- ---------------------------------------------------------------- access

alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_outcomes enable row level security;
alter table public.waitlist enable row level security;
alter table public.offers enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;
alter table public.events enable row level security;
alter table public.demo_state enable row level security;
alter table public.metrics enable row level security;

-- Read-only for the browser. No insert/update/delete policies: only the server
-- (service_role, which bypasses RLS) writes. All data is fictitious.
do $$
declare t text;
begin
  foreach t in array array['patients', 'appointments', 'waitlist', 'offers', 'messages', 'calls',
                           'events', 'demo_state', 'metrics'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy "browser can read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

revoke all on public.appointment_outcomes from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------- helpers

create or replace function public.demo_now_min() returns int
language sql stable set search_path = '' as $$
  select case when s.clock_started_at is null then s.clock_base_min
    else s.clock_base_min + floor(extract(epoch from (now() - s.clock_started_at)) * s.speed / 60)::int end
  from public.demo_state s where s.id = 1
$$;

create or replace function public.fmt_min(m int) returns text
language sql immutable set search_path = '' as $$
  select lpad(((m / 60) % 24)::text, 2, '0') || ':' || lpad((m % 60)::text, 2, '0')
$$;

-- One small hint per action. Clients refetch what the hint names.
create or replace function public.notify(p_kind text, p_appts bigint[] default '{}', p_patients text[] default '{}')
returns void language plpgsql set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('kind', p_kind, 'appts', to_jsonb(p_appts), 'patients', to_jsonb(p_patients)),
    'change', 'demo', false);
exception when others then
  null; -- a failed hint must never roll back a state change; clients also poll
end $$;

-- Who reads the message: the patient, or the caregiver for minors.
create or replace function public.greeting_name(p public.patients) returns text
language sql immutable set search_path = '' as $$
  select coalesce(split_part(p.caregiver_name, ' ', 1), p.first_name)
$$;

-- ---------------------------------------------------------------- transitions

create or replace function public.set_status(
  p_appt bigint, p_to text, p_channel text, p_actor text, p_detail text default null, p_kind text default 'estado'
) returns text language plpgsql set search_path = '' as $$
declare v_from text; v_patient text;
begin
  select status, patient_id into v_from, v_patient from public.appointments where id = p_appt for update;
  if v_from is null then raise exception 'appointment % not found', p_appt; end if;
  if v_from = 'reasignada' and p_to <> 'reasignada' then raise exception 'slot already reassigned'; end if;
  update public.appointments
     set status = p_to, status_channel = p_channel, status_at = now(), updated_at = now()
   where id = p_appt;
  insert into public.events (appointment_id, patient_id, kind, from_status, to_status, channel, actor, detail, demo_min)
  values (p_appt, v_patient, p_kind, v_from, p_to, p_channel, p_actor, p_detail, public.demo_now_min());
  return v_from;
end $$;

-- Manual change by staff (RF-11)
create or replace function public.staff_set_status(p_appt bigint, p_to text, p_actor text default 'Personal de citas')
returns void language plpgsql set search_path = '' as $$
declare v_patient text;
begin
  perform public.set_status(p_appt, p_to, 'panel', p_actor, 'Cambio manual en el panel');
  select patient_id into v_patient from public.appointments where id = p_appt;
  perform public.notify('appt', array[p_appt], array[v_patient]);
end $$;

-- RF-12: reminders to every appointment of tomorrow that has not received one
create or replace function public.send_reminders() returns int
language plpgsql set search_path = '' as $$
declare v_now int; v_day text; v_count int;
begin
  update public.demo_state set clock_started_at = coalesce(clock_started_at, now()) where id = 1;
  v_now := public.demo_now_min();
  select day_label into v_day from public.demo_state where id = 1;

  with target as (
    select a.id, a.patient_id, a.status from public.appointments a
    where a.is_base and a.status = 'pendiente'
  ), msgs as (
    insert into public.messages (patient_id, appointment_id, direction, kind, body, buttons, demo_min)
    select a.patient_id, a.id, 'saliente', 'recordatorio',
      'Hola ' || public.greeting_name(p) || ', le recordamos ' ||
      case when p.caregiver_name is not null then 'la cita de ' || p.first_name else 'su cita' end ||
      ' de ' || a.specialty || ' mañana, ' || v_day || ', a las ' || a.time ||
      case when a.remote then ' (teleconsulta).' else ' en el Hospital María Auxiliadora.' end ||
      ' ¿Podrá asistir? Si no puede, avísenos y el cupo pasará a otro paciente que lo espera.',
      '["Confirmo", "No podré asistir", "Hablar con una persona"]'::jsonb, v_now
    from public.appointments a join public.patients p on p.id = a.patient_id
    where a.id in (select id from target)
    returning appointment_id
  ), upd as (
    update public.appointments a
       set status = 'recordatorio_enviado', status_channel = 'mensaje', status_at = now(),
           reminder_at_min = v_now, updated_at = now()
     where a.id in (select id from target)
    returning a.id, a.patient_id
  ), ev as (
    insert into public.events (appointment_id, patient_id, kind, from_status, to_status, channel, actor, detail, demo_min)
    select u.id, u.patient_id, 'estado', 'pendiente', 'recordatorio_enviado', 'mensaje', 'Sistema',
           'Recordatorio enviado por mensaje', v_now
    from upd u
    returning 1
  )
  select count(*) into v_count from ev;

  update public.demo_state set reminders_sent_min = coalesce(reminders_sent_min, v_now), version = version + 1,
         updated_at = now() where id = 1;
  perform public.notify('bulk');
  return v_count;
end $$;

-- RF-13 / RF-14: the patient (or the voice agent on their behalf) answers
-- p_reply: 'confirma' | 'libera' | 'persona' | 'otra_fecha'
create or replace function public.patient_reply(
  p_appt bigint, p_reply text, p_channel text default 'mensaje', p_actor text default null, p_detail text default null
) returns text language plpgsql set search_path = '' as $$
declare a public.appointments; p public.patients; v_to text; v_label text; v_answer text; v_now int;
begin
  select * into a from public.appointments where id = p_appt for update;
  if a.id is null then raise exception 'appointment % not found', p_appt; end if;
  if a.status in ('reasignada') then raise exception 'slot already reassigned'; end if;
  select * into p from public.patients where id = a.patient_id;
  v_now := public.demo_now_min();
  v_to := case p_reply when 'confirma' then 'confirmada' when 'libera' then 'liberada'
                       when 'otra_fecha' then 'liberada' when 'persona' then 'derivada_a_persona' end;
  if v_to is null then raise exception 'unknown reply %', p_reply; end if;
  v_label := case p_reply when 'confirma' then 'Confirmo' when 'libera' then 'No podré asistir'
                          when 'otra_fecha' then 'Necesito otra fecha' else 'Hablar con una persona' end;

  if p_channel = 'mensaje' then
    update public.messages set answered_with = v_label
     where id = (select id from public.messages where appointment_id = p_appt and kind = 'recordatorio'
                 order by id desc limit 1);
    insert into public.messages (patient_id, appointment_id, direction, kind, body, demo_min)
    values (a.patient_id, p_appt, 'entrante', 'respuesta', v_label, v_now);
    v_answer := case p_reply
      when 'confirma' then 'Gracias. Su cita queda confirmada. Le esperamos mañana a las ' || a.time || '.'
      when 'libera' then 'Gracias por avisar. Su cupo pasará a otro paciente que lo espera. Si necesita una nueva cita, puede pedirla en admisión.'
      else 'Una persona del equipo de citas le contactará pronto.' end;
    insert into public.messages (patient_id, appointment_id, direction, kind, body, demo_min)
    values (a.patient_id, p_appt, 'saliente', 'info', v_answer, v_now);
  end if;

  perform public.set_status(p_appt, v_to, p_channel,
    coalesce(p_actor, case when p.caregiver_name is not null then p.caregiver_name || ' (' || p.caregiver_relation || ')'
                      else p.full_name end),
    coalesce(p_detail, case p_channel when 'voz' then 'Respondió en la llamada: ' else 'Respondió por mensaje: ' end || v_label));
  perform public.notify('appt', array[p_appt], array[a.patient_id]);
  return v_to;
end $$;

-- ---------------------------------------------------------------- calls (RF-18, RF-19)

create or replace function public.start_call(p_appt bigint, p_actor text default 'Personal de citas')
returns bigint language plpgsql set search_path = '' as $$
declare a public.appointments; v_call bigint;
begin
  select * into a from public.appointments where id = p_appt for update;
  if a.status in ('reasignada', 'liberada') then raise exception 'cannot call a released slot'; end if;
  update public.calls set status = 'no_contesta', ended_at = now()
   where appointment_id = p_appt and status in ('sonando', 'en_curso');
  insert into public.calls (appointment_id, patient_id) values (p_appt, a.patient_id) returning id into v_call;
  perform public.set_status(p_appt, 'en_llamada', 'voz', p_actor, 'Llamada del asistente automático');
  perform public.notify('appt', array[p_appt], array[a.patient_id]);
  return v_call;
end $$;

-- p_status: 'en_curso' (answered) | 'rechazada' | 'no_contesta' | 'finalizada'
create or replace function public.update_call(p_call bigint, p_status text, p_result text default null, p_transcript jsonb default null)
returns void language plpgsql set search_path = '' as $$
declare c public.calls; v_status text;
begin
  select * into c from public.calls where id = p_call for update;
  if c.id is null then raise exception 'call % not found', p_call; end if;
  update public.calls set
    status = p_status,
    result = coalesce(p_result, result),
    transcript = coalesce(p_transcript, transcript),
    answered_at = case when p_status = 'en_curso' then coalesce(answered_at, now()) else answered_at end,
    ended_at = case when p_status in ('finalizada', 'rechazada', 'no_contesta') then now() else ended_at end
  where id = p_call;
  if p_status = 'en_curso' and c.status = 'sonando' then
    insert into public.events (appointment_id, patient_id, kind, channel, actor, detail, demo_min)
    values (c.appointment_id, c.patient_id, 'llamada', 'voz', 'Sistema', 'El paciente contestó la llamada', public.demo_now_min());
  end if;
  -- a call that ended without an answer leaves the appointment as "sin respuesta"
  select status into v_status from public.appointments where id = c.appointment_id;
  if p_status in ('rechazada', 'no_contesta', 'finalizada') and v_status = 'en_llamada' then
    perform public.set_status(c.appointment_id, 'sin_respuesta', 'voz', 'Sistema',
      case p_status when 'rechazada' then 'Rechazó la llamada' when 'no_contesta' then 'No contestó la llamada'
                    else 'La llamada terminó sin respuesta' end);
  end if;
  perform public.notify('appt', array[c.appointment_id], array[c.patient_id]);
end $$;

-- ---------------------------------------------------------------- reassignment (RF-28 to RF-32)

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
    ' días. ¿Desea tomarlo? Responda antes de las ' || public.fmt_min(v_exp) || '.',
    '["Acepto", "No puedo"]'::jsonb, v_now);
  insert into public.events (appointment_id, patient_id, kind, channel, actor, detail, demo_min)
  values (p_slot, w.patient_id, 'oferta', 'panel', p_actor,
          'Cupo ofrecido a ' || p.full_name || ' (lista de espera, ' || w.wait_days || ' días)', v_now);
  perform public.notify('offer', array[p_slot], array[w.patient_id]);
  return v_offer;
end $$;

create or replace function public.answer_offer(p_offer bigint, p_accept boolean)
returns bigint language plpgsql set search_path = '' as $$
declare o public.offers; s public.appointments; p public.patients; v_new bigint; v_now int;
begin
  select * into o from public.offers where id = p_offer for update;
  if o.status <> 'enviada' then raise exception 'offer is no longer open'; end if;
  v_now := public.demo_now_min();
  if v_now > o.expires_min then raise exception 'offer expired'; end if;
  select * into s from public.appointments where id = o.slot_id for update;
  select * into p from public.patients where id = o.patient_id;

  update public.messages set answered_with = case when p_accept then 'Acepto' else 'No puedo' end
   where offer_id = p_offer and kind = 'oferta';
  insert into public.messages (patient_id, offer_id, direction, kind, body, demo_min)
  values (o.patient_id, p_offer, 'entrante', 'respuesta', case when p_accept then 'Acepto' else 'No puedo' end, v_now);

  if not p_accept then
    update public.offers set status = 'rechazada', decided_at = now() where id = p_offer;
    update public.waitlist set status = 'en_espera', updated_at = now() where id = o.waitlist_id;
    insert into public.messages (patient_id, offer_id, direction, kind, body, demo_min)
    values (o.patient_id, p_offer, 'saliente', 'info', 'Entendido. Sigue en la lista de espera y le avisaremos del próximo cupo.', v_now);
    insert into public.events (appointment_id, patient_id, kind, channel, actor, detail, demo_min)
    values (o.slot_id, o.patient_id, 'oferta', 'mensaje', p.full_name, p.full_name || ' no puede tomar el cupo', v_now);
    perform public.notify('offer', array[o.slot_id], array[o.patient_id]);
    return null;
  end if;

  if s.status <> 'liberada' then raise exception 'slot is not free'; end if;
  v_new := nextval('public.appointment_extra_seq');
  insert into public.appointments (id, patient_id, specialty, date, time, remote, insured, status, status_channel,
                                   status_at, origin, replaces_id, is_base)
  values (v_new, o.patient_id, s.specialty, s.date, s.time, s.remote, true, 'confirmada', 'mensaje', now(),
          'lista_espera', s.id, false);
  update public.appointments set reassigned_to_id = v_new where id = s.id;
  perform public.set_status(s.id, 'reasignada', 'mensaje', p.full_name,
                            'Cupo reasignado a ' || p.full_name || ' desde la lista de espera');
  insert into public.events (appointment_id, patient_id, kind, from_status, to_status, channel, actor, detail, demo_min)
  values (v_new, o.patient_id, 'estado', null, 'confirmada', 'mensaje', p.full_name,
          'Nueva cita desde la lista de espera (cupo de la cita ' || s.id || ')', v_now);
  update public.offers set status = 'aceptada', decided_at = now(), new_appointment_id = v_new where id = p_offer;
  update public.waitlist set status = 'asignado', updated_at = now() where id = o.waitlist_id;
  insert into public.messages (patient_id, appointment_id, offer_id, direction, kind, body, demo_min)
  values (o.patient_id, v_new, p_offer, 'saliente', 'info',
          'Listo. Su cita de ' || s.specialty || ' queda registrada para mañana a las ' || s.time ||
          '. Llegue 20 minutos antes a admisión.', v_now);
  perform public.notify('offer', array[s.id, v_new], array[o.patient_id, s.patient_id]);
  return v_new;
end $$;

-- ---------------------------------------------------------------- demo clock (RF-15, RF-17, RF-31, RF-39)

-- Applies everything that is due at the current demo time. Idempotent; any open
-- staff screen calls it every few seconds through the server.
create or replace function public.demo_tick() returns int
language plpgsql set search_path = '' as $$
declare v_now int; s public.demo_state; v_changes int := 0; n int; r record;
begin
  select * into s from public.demo_state where id = 1;
  if s.clock_started_at is null then return 0; end if;
  v_now := public.demo_now_min();

  -- RF-17: replies of patients without a QR, with probabilities based on their risk (precomputed in ml/)
  if s.simulate_others then
    for r in
      select a.id, a.sim_reply from public.appointments a
      where a.status in ('recordatorio_enviado', 'sin_respuesta') and a.sim_reply is not null
        and a.reminder_at_min + a.sim_delay_min <= v_now
        and not exists (select 1 from public.events e where e.appointment_id = a.id and e.channel = 'mensaje'
                          and e.kind = 'estado' and e.to_status in ('confirmada', 'liberada', 'derivada_a_persona'))
      order by a.id
      for update skip locked
    loop
      perform public.set_status(r.id, case r.sim_reply when 'confirma' then 'confirmada' when 'libera' then 'liberada'
                                     else 'derivada_a_persona' end,
                                'mensaje', 'Paciente (simulado)',
                                'Respondió por mensaje (respuesta simulada): ' ||
                                case r.sim_reply when 'confirma' then 'Confirmo' when 'libera' then 'No podré asistir'
                                     else 'Hablar con una persona' end);
      update public.messages set answered_with = case r.sim_reply when 'confirma' then 'Confirmo'
               when 'libera' then 'No podré asistir' else 'Hablar con una persona' end
       where appointment_id = r.id and kind = 'recordatorio';
      v_changes := v_changes + 1;
    end loop;
  end if;

  -- RF-15: no reply within the deadline -> "sin respuesta" (and the panel proposes a call)
  for r in
    select a.id from public.appointments a
    where a.status = 'recordatorio_enviado' and a.reminder_at_min + s.reply_deadline_min <= v_now
    for update skip locked
  loop
    perform public.set_status(r.id, 'sin_respuesta', 'sistema', 'Sistema',
      'Sin respuesta al recordatorio después de ' || (s.reply_deadline_min / 60.0)::numeric(4,1) || ' h');
    v_changes := v_changes + 1;
  end loop;

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
      update public.calls set status = 'finalizada', answered_at = now(), ended_at = now(),
             result = 'Respuesta simulada: ' || r.sim_reply where id = r.id;
      perform public.patient_reply(r.appointment_id, case when r.sim_reply = 'persona' then 'persona' else r.sim_reply end,
                                   'voz', 'Paciente (simulado)', 'Respondió en la llamada (respuesta simulada)');
    end if;
    v_changes := v_changes + 1;
  end loop;

  -- RF-31: expired offers
  for r in
    select o.id, o.slot_id, o.waitlist_id, o.patient_id from public.offers o
    where o.status = 'enviada' and o.expires_min < v_now
    for update skip locked
  loop
    update public.offers set status = 'vencida', decided_at = now() where id = r.id;
    update public.waitlist set status = 'en_espera', updated_at = now() where id = r.waitlist_id;
    update public.messages set buttons = null where offer_id = r.id and kind = 'oferta';
    insert into public.messages (patient_id, offer_id, direction, kind, body, demo_min)
    values (r.patient_id, r.id, 'saliente', 'info', 'El plazo para tomar el cupo venció. Sigue en la lista de espera.', v_now);
    insert into public.events (appointment_id, patient_id, kind, channel, actor, detail, demo_min)
    values (r.slot_id, r.patient_id, 'oferta', 'sistema', 'Sistema', 'Venció el plazo de la oferta', v_now);
    v_changes := v_changes + 1;
  end loop;

  if v_changes > 0 then
    update public.demo_state set version = version + 1, updated_at = now() where id = 1;
    perform public.notify('bulk');
  end if;
  return v_changes;
end $$;

-- RF-39: move the demo clock forward
create or replace function public.advance_clock(p_minutes int) returns void
language plpgsql set search_path = '' as $$
begin
  update public.demo_state
     set clock_base_min = clock_base_min + p_minutes, updated_at = now(), version = version + 1
   where id = 1;
  perform public.demo_tick();
  perform public.notify('bulk');
end $$;

-- RF-40: back to the initial state in one statement batch
create or replace function public.reset_demo() returns void
language plpgsql set search_path = '' as $$
begin
  delete from public.events where id > 0;
  delete from public.messages where id > 0;
  delete from public.calls where id > 0;
  delete from public.offers where id > 0;
  update public.appointments set reassigned_to_id = null where reassigned_to_id is not null;
  delete from public.appointments where not is_base;
  update public.appointments
     set status = 'pendiente', status_channel = null, status_at = null, reminder_at_min = null, updated_at = now()
   where status <> 'pendiente' or reminder_at_min is not null;
  update public.waitlist set status = 'en_espera', updated_at = now() where status <> 'en_espera';
  update public.demo_state
     set clock_base_min = 540, clock_started_at = null, reminders_sent_min = null, revealed = false,
         version = version + 1, updated_at = now()
   where id = 1;
  delete from public.metrics where key = 'reveal';
  perform setval('public.appointment_extra_seq', 100001, false);
  perform public.notify('bulk');
end $$;

-- Full reload of static data (used by scripts/load-data.mjs)
create or replace function public.wipe_all() returns void
language plpgsql set search_path = '' as $$
begin
  truncate public.events, public.messages, public.calls, public.offers, public.appointment_outcomes,
           public.waitlist, public.appointments, public.patients, public.metrics restart identity cascade;
end $$;

-- Only the server may run state-changing functions.
do $$
declare f text;
begin
  foreach f in array array[
    'notify(text, bigint[], text[])', 'set_status(bigint, text, text, text, text, text)',
    'staff_set_status(bigint, text, text)', 'send_reminders()', 'patient_reply(bigint, text, text, text, text)',
    'start_call(bigint, text)', 'update_call(bigint, text, text, jsonb)', 'make_offer(bigint, bigint, text)',
    'answer_offer(bigint, boolean)', 'demo_tick()', 'advance_clock(int)', 'reset_demo()', 'wipe_all()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
