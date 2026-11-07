-- AsistIA E5, final (pitch v7): the jury's live interaction (track E, docs/jurado.md).
--
-- Each jury member gets a printed card with a QR to /j/<token>: a unique token and a fictitious character
-- (Carmen cancels her oncology appointment and frees the slot of scene 1; others confirm, ask for a new
-- appointment by voice or chat, or accept an offer). The projector reads what they do from jury_snapshot().
--
-- ADDITIVE ONLY. The database is shared with the deployed demo (branch main): this file creates NEW tables
-- and NEW functions (`create table` / `create function`, no `or replace`, no `if not exists` on functions), so
-- applying it twice, or over an existing name, FAILS instead of replacing anything. It alters, drops or
-- replaces nothing that exists, and it changes no existing row. The only rows it writes are the 8 cards
-- of public.jury_cards (a new table). Patients, appointments and requests for the characters are created
-- later, as NEW rows, by public.jury_ensure() / public.jury_prepare() (called from the app), never here.
-- Inverse: supabase/rollback/20261107070000_e5_jury_cards.down.sql

-- ---------------------------------------------------------------- cards
create table public.jury_cards (
  token text primary key
    check (token ~ '^j-([abcdefghjkmnpqrstuvwxyz23456789]{6}|test-[a-z0-9]{4,12})$'),
  character text not null,                 -- first name shown on the card and on the projector
  full_name text not null,                 -- fictitious
  story text not null,                     -- who the person is and what happens to them
  try_line text not null,                  -- what to try (1 line)
  channel text not null check (channel in ('voz', 'chat', 'voz_o_chat')),
  kind text not null check (kind in ('cancela', 'confirma', 'pide_cita', 'acepta_oferta')),
  specialty text not null,
  appt_time text,                          -- cancela / confirma: Thursday 19/10/2023 at this time
  category text check (category in ('P1', 'P2', 'P3', 'P4')),  -- acepta_oferta: category of the seeded request
  wait_days int,                           -- acepta_oferta: days already waited
  reason text,                             -- acepta_oferta: reason of the seeded request
  age int not null,
  sex text not null check (sex in ('F', 'M')),
  scene boolean not null default false,    -- the card whose released slot is the one of scene 1 (Carmen)
  is_test boolean not null default false,  -- temporary cards of tests/e2e/jurado_circuito.py
  sort int not null default 0,
  patient_id text,                         -- simulated phone (patients.token = card token); no FK on purpose
  created_at timestamptz not null default now(),
  check ((kind in ('cancela', 'confirma')) = (appt_time is not null)),
  check ((kind = 'acepta_oferta') = (category is not null and wait_days is not null))
);
create unique index jury_cards_one_scene on public.jury_cards (scene) where scene;

-- every time a card is opened (and the chat session it opened, for the cards that register by chat or voice)
create table public.jury_visits (
  id bigint generated always as identity primary key,
  token text not null references public.jury_cards (token) on delete cascade,
  chat_session_id uuid,
  created_at timestamptz not null default now()
);
create index jury_visits_token_idx on public.jury_visits (token, created_at);
create index jury_visits_session_idx on public.jury_visits (chat_session_id) where chat_session_id is not null;

-- free agenda slots opened for a card's request (like the jury slots of seed_v4, requisitos §6)
create table public.jury_slots (
  slot_id bigint primary key references public.slots (id) on delete cascade,
  token text not null references public.jury_cards (token) on delete cascade,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['jury_cards', 'jury_visits', 'jury_slots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.jury_visits_id_seq to service_role;

-- ---------------------------------------------------------------- the 8 printed cards (fictitious characters)
-- Tokens generated with src/lib/jury/tokens.ts and checked against every patients.token in use.
insert into public.jury_cards (token, character, full_name, story, try_line, channel, kind, specialty, appt_time, category, wait_days, reason, age, sex, scene, sort) values
  ('j-cmp73z', 'Carmen', 'Carmen Rojas Paredes',
   'Usted es Carmen, de 47 años. Tiene cita de oncología el jueves 19 a las 9:00, pero ese día no podrá ir.',
   'Avise que no podrá ir, por mensaje o en la llamada: su cupo no se pierde.',
   'voz_o_chat', 'cancela', 'Oncología Médica', '09:00', null, null, null, 47, 'F', true, 1),
  ('j-geg8pd', 'Jorge', 'Jorge Huamán Ríos',
   'Usted es Jorge, de 68 años. Tiene cita de medicina interna el jueves 19 a las 11:40. No usa WhatsApp: el hospital lo llama.',
   'Pida la llamada del asistente y confirme su cita hablando.',
   'voz', 'confirma', 'Medicina Interna', '11:40', null, null, null, 68, 'M', false, 2),
  ('j-xrcnu6', 'Lucía', 'Lucía Mamani Torres',
   'Usted es Lucía, de 52 años. Desde hace meses le cuesta leer de cerca y todavía no tiene cita.',
   'Pida una cita de oftalmología hablando con el asistente. Cuando le ofrezcan un cupo, acéptelo.',
   'voz', 'pide_cita', 'Oftalmología', null, null, null, null, 52, 'F', false, 3),
  ('j-a34yvp', 'Marco', 'Marco Salazar Vega',
   'Usted es Marco, de 61 años. Espera una cita de neurología desde hace 18 días y prefiere que lo llamen.',
   'Cuando el hospital lo llame con un cupo, acéptelo hablando.',
   'voz', 'acepta_oferta', 'Neurología', null, 'P1', 18,
   'Dolores de cabeza que empeoran desde hace semanas; su médico pidió verlo pronto.', 61, 'M', false, 4),
  ('j-g6ytk3', 'Óscar', 'Óscar Quispe Lima',
   'Usted es Óscar, de 39 años. Tiene una mancha en la piel que cambió de color y quiere que la revisen.',
   'Pida una cita de dermatología por chat. Cuando le ofrezcan un cupo, acéptelo.',
   'chat', 'pide_cita', 'Dermatología', null, null, null, null, 39, 'M', false, 5),
  ('j-5fsv23', 'Teresa', 'Teresa Flores Ccori',
   'Usted es Teresa, de 57 años. Está en la lista de espera de cirugía torácica desde hace 50 días.',
   'Cuando le llegue un mensaje con un cupo, acéptelo y confírmelo.',
   'chat', 'acepta_oferta', 'Cirugía Torácica', null, 'P2', 50,
   'Nódulo en el pulmón visto en una radiografía; en estudio.', 57, 'F', false, 6),
  ('j-8bv35u', 'Raúl', 'Raúl Vargas Soto',
   'Usted es Raúl, de 44 años. Tiene cita de gastroenterología el jueves 19 a las 10:40 y le llegó un recordatorio.',
   'Confirme su cita respondiendo el mensaje.',
   'chat', 'confirma', 'Gastroenterología', '10:40', null, null, null, 44, 'M', false, 7),
  ('j-uqpbrq', 'Sofía', 'Sofía Paredes Ruiz',
   'Usted es Sofía, de 33 años. Tiene cita de ginecología el jueves 19 a las 8:20.',
   'Confirme su cita por mensaje o pida que la llamen y confírmela hablando.',
   'voz_o_chat', 'confirma', 'Ginecología', '08:20', null, null, null, 33, 'F', false, 8);

-- ---------------------------------------------------------------- helpers
-- Start of the current demo: seed_v4() re-creates the seeded requests on every reset_demo(), so their
-- creation time marks the reset. The jury view only shows what happened after it.
create function public.jury_epoch() returns timestamptz
language sql stable set search_path = '' as $$
  select coalesce((select min(created_at) from public.requests where seeded and source = 'semilla'), '-infinity'::timestamptz)
$$;

-- Requests that belong to a card: its seeded request (acepta_oferta) or the ones registered in a chat
-- session the card opened (by chat or by voice; both write identity.contact_points.chat_session_id).
create function public.jury_card_requests(p_include_test boolean default true)
returns table (token text, request_id bigint)
language sql stable set search_path = '' as $$
  select c.token, r.id
  from public.jury_cards c
  join identity.persons p on p.patient_id = c.patient_id
  join public.requests r on r.person_id = p.id
  where c.patient_id is not null and (p_include_test or not c.is_test)
  union
  select v.token, r.id
  from public.jury_visits v
  join public.jury_cards c on c.token = v.token
  join identity.contact_points cp on cp.chat_session_id = v.chat_session_id
  join public.requests r on r.person_id = cp.person_id
  where v.chat_session_id is not null and (p_include_test or not c.is_test)
$$;

-- ---------------------------------------------------------------- make a card playable (idempotent)
-- cancela / confirma: a simulated phone (patients.token = card token) with its appointment on Thursday 19/10
-- and the 72 h reminder already on the phone. acepta_oferta: the phone plus a request already regulated
-- (seed data, like the rest of the waiting list). pide_cita: nothing (the person registers it live).
-- After reset_demo() (which deletes non-base appointments, requests and persons) this re-creates them.
create function public.jury_ensure(p_token text) returns jsonb
language plpgsql set search_path = '' as $$
declare c public.jury_cards; v_pid text; v_appt bigint; v_person uuid; v_now int; v_body text; p public.patients;
begin
  select * into c from public.jury_cards where token = p_token for update;
  if c.token is null then raise exception 'jury card not found'; end if;
  if c.kind = 'pide_cita' then
    return jsonb_build_object('token', c.token, 'kind', c.kind, 'patient', null);
  end if;
  v_pid := coalesce(c.patient_id, 'J' || upper(substr(md5(c.token), 1, 9)));
  insert into public.patients (id, full_name, first_name, short_name, sex, age, phone, token, demo_role, demo_label, demo_order)
  values (v_pid, c.full_name, c.character, public.short_name(c.full_name), c.sex, c.age, '', c.token, 'jurado', c.try_line, 100 + c.sort)
  on conflict (id) do nothing;
  if c.patient_id is distinct from v_pid then
    update public.jury_cards set patient_id = v_pid where token = c.token;
  end if;
  v_now := public.demo_now_min();

  if c.kind in ('cancela', 'confirma') then
    select id into v_appt from public.appointments
     where patient_id = v_pid and not is_base and origin = 'futura' order by id desc limit 1;
    if v_appt is null then
      v_appt := public.future_appointment(v_pid, c.specialty, date '2023-10-19', c.appt_time);
      select * into p from public.patients where id = v_pid;
      v_body := 'Hola ' || public.greeting_name(p) || ', le recordamos su cita de ' || c.specialty || ' en 3 días: el ' ||
                public.fmt_slot(date '2023-10-19', c.appt_time) ||
                '. ¿Podrá asistir? Si no puede, avísenos y el cupo pasará a otro paciente que lo espera.';
      insert into public.messages (patient_id, appointment_id, direction, kind, body, buttons, demo_min)
      values (v_pid, v_appt, 'saliente', 'recordatorio', v_body,
              '["Confirmo", "No podré asistir", "Reprogramar", "Hablar con una persona"]'::jsonb, v_now);
      update public.appointments
         set status = 'recordatorio_enviado', status_channel = 'mensaje', status_at = now(), reminder_at_min = v_now, updated_at = now()
       where id = v_appt;
      insert into public.events (appointment_id, patient_id, kind, from_status, to_status, channel, actor, detail, demo_min)
      values (v_appt, v_pid, 'estado', 'pendiente', 'recordatorio_enviado', 'mensaje', 'Sistema',
              'Recordatorio 72 h antes, por mensaje (cartilla del jurado)', v_now);
    end if;
  elsif c.kind = 'acepta_oferta' then
    select id into v_person from identity.persons where patient_id = v_pid order by created_at desc limit 1;
    if v_person is null then
      v_person := public.seed_person(c.full_name, c.age, c.sex, true, 'Villa El Salvador', v_pid);
      perform public.seed_request(v_person, c.specialty, c.category, c.wait_days, c.age, true, false, 'priorizada_sin_cupo', null,
        c.reason, null, null, false, false, case when c.channel = 'voz' then 'llamada' else 'mensaje' end, true);
    end if;
  end if;
  perform public.notify('appt', '{}'::bigint[], array[v_pid]);
  return jsonb_build_object('token', c.token, 'kind', c.kind, 'patient', v_pid);
end $$;

-- A card was opened (QR scanned): make it playable and record the visit (at most one per 20 s and session).
create function public.jury_open(p_token text, p_session uuid default null) returns jsonb
language plpgsql set search_path = '' as $$
declare v jsonb;
begin
  v := public.jury_ensure(p_token);
  if not exists (select 1 from public.jury_visits
                  where token = p_token and chat_session_id is not distinct from p_session
                    and created_at > now() - interval '20 seconds') then
    insert into public.jury_visits (token, chat_session_id) values (p_token, p_session);
  end if;
  perform public.hint('live');
  return v;
end $$;

-- Every printed card playable at once ("Preparar cartillas" in /demo, after a reset).
create function public.jury_prepare() returns int
language plpgsql set search_path = '' as $$
declare c record; n int := 0;
begin
  for c in select token from public.jury_cards where not is_test order by sort loop
    perform public.jury_ensure(c.token);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- staff actions on a card (one click in /demo)
-- Categorize a request registered by a jury member: the same regulate() the regulator uses. Only jury requests.
create function public.jury_categorize(p_request bigint, p_category text, p_actor text default 'Regulador')
returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.jury_card_requests(true) j where j.request_id = p_request) then
    raise exception 'not a jury request';
  end if;
  perform public.regulate(p_request, p_category, p_actor);
end $$;

-- Approve the offer of a card's slot (approve_offer_v51: the candidates in priority order, approved by a person).
--   cancela: the slot its appointment released (Carmen: the slot of scene 1, which goes to the first of the list);
--   pide_cita / acepta_oferta: a free agenda slot of the request's specialty in the zone its category can take
--   (P1-P2 near, P3 middle, P4 far). If the request is not among the candidates (others wait before it), the
--   transaction rolls back and nothing is created or sent.
create function public.jury_offer(p_token text, p_actor text default 'Admisión') returns bigint
language plpgsql set search_path = '' as $$
declare c public.jury_cards; v_slot bigint; v_req public.requests; v_date date; v_prop jsonb;
begin
  select * into c from public.jury_cards where token = p_token;
  if c.token is null then raise exception 'jury card not found'; end if;
  if c.kind = 'cancela' then
    select s.id into v_slot from public.slots s join public.appointments a on a.id = s.source_appointment_id
     where a.patient_id = c.patient_id and not a.is_base order by s.id desc limit 1;
    if v_slot is null then raise exception 'jury slot not released'; end if;
    return public.approve_offer_v51(v_slot, p_actor);
  end if;
  if c.kind = 'confirma' then raise exception 'jury card has no request'; end if;
  select r.* into v_req from public.jury_card_requests(true) j join public.requests r on r.id = j.request_id
   where j.token = c.token
     and r.state in ('priorizada_sin_cupo', 'en_espera_prioritaria', 'pendiente_regulacion', 'pendiente_informacion', 'con_oferta')
   order by r.id desc limit 1;
  if v_req.id is null then raise exception 'jury request missing'; end if;
  if v_req.category is null then raise exception 'jury request not regulated'; end if;
  if v_req.state = 'con_oferta' then raise exception 'there is already an open offer for this request'; end if;
  select s.id into v_slot from public.jury_slots j join public.slots s on s.id = j.slot_id
   where j.token = c.token and s.state = 'libre' and s.specialty = v_req.specialty order by s.id desc limit 1;
  if v_slot is null then
    v_date := public.demo_today() + case v_req.category when 'P1' then 2 when 'P2' then 2 when 'P3' then 8 else 21 end;
    insert into public.slots (specialty, date, time, origin, seeded)
    values (v_req.specialty, v_date, '12:00', 'agenda_libre', true) returning id into v_slot;
    insert into public.jury_slots (slot_id, token) values (v_slot, c.token);
  end if;
  v_prop := public.propose_candidates_v51(v_slot);
  if not exists (select 1 from jsonb_array_elements(v_prop->'candidates') x where (x->>'request_id')::bigint = v_req.id) then
    raise exception 'jury request is not a candidate';
  end if;
  return public.approve_offer_v51(v_slot, p_actor);
end $$;

-- Close the card's open offer now (close_offer_v51: the slot goes to the highest priority acceptor).
create function public.jury_close(p_token text, p_actor text default 'Admisión') returns bigint
language plpgsql set search_path = '' as $$
declare c public.jury_cards; v_offer bigint;
begin
  select * into c from public.jury_cards where token = p_token;
  if c.token is null then raise exception 'jury card not found'; end if;
  select o.id into v_offer from public.slot_offers o
   where o.state = 'enviada'
     and (o.slot_id in (select slot_id from public.jury_slots where token = c.token)
          or o.slot_id in (select s.id from public.slots s join public.appointments a on a.id = s.source_appointment_id
                            where a.patient_id = c.patient_id and not a.is_base))
   order by o.id desc limit 1;
  if v_offer is null then raise exception 'jury no open offer'; end if;
  return public.close_offer_v51(v_offer, p_actor);
end $$;

-- ---------------------------------------------------------------- re-arm a card without resetting the demo
-- Deletes ONLY what the card produced: its chat sessions, the requests registered in them (and the patient
-- rows ensure_patient created for them), its appointment and the slot it released, the slots opened for it,
-- its messages and calls. People outside the jury touched by the card (e.g. Tito, assigned Carmen's slot)
-- are put back first with revert_assignment(), and candidates of its open offers return to their resting state.
create function public.jury_clear(p_token text) returns void
language plpgsql set search_path = '' as $$
declare c public.jury_cards; v_sessions uuid[]; v_persons uuid[]; v_requests bigint[]; v_slots bigint[]; v_appts bigint[];
        v_rpat text[]; a record;
begin
  select * into c from public.jury_cards where token = p_token for update;
  if c.token is null then raise exception 'jury card not found'; end if;
  v_sessions := coalesce((select array_agg(distinct chat_session_id) from public.jury_visits
                           where token = c.token and chat_session_id is not null), '{}');
  v_persons := coalesce((select array_agg(distinct x.id) from (
                   select p.id from identity.persons p where c.patient_id is not null and p.patient_id = c.patient_id
                   union select cp.person_id from identity.contact_points cp where cp.chat_session_id = any (v_sessions)) x), '{}');
  v_requests := coalesce((select array_agg(id) from public.requests where person_id = any (v_persons)), '{}');
  v_appts := coalesce((select array_agg(id) from public.appointments
                        where c.patient_id is not null and patient_id = c.patient_id and not is_base), '{}');
  v_slots := coalesce((select array_agg(distinct x.id) from (
                 select slot_id as id from public.jury_slots where token = c.token
                 union select s.id from public.slots s where s.source_appointment_id = any (v_appts)) x), '{}');
  v_rpat := coalesce((select array_agg(distinct p.patient_id) from identity.persons p
                       where p.id = any (v_persons) and p.patient_id is not null
                         and p.patient_id is distinct from c.patient_id), '{}');

  -- people outside the card keep a coherent state
  for a in
    select x.id from public.assignments x
    where x.slot_id = any (v_slots) and not x.reverted and x.validation_state in ('pendiente', 'confirmada')
      and not (x.request_id = any (v_requests))
    order by x.id desc
  loop
    perform public.revert_assignment(a.id, 'Reinicio de la cartilla del jurado', 'Sistema');
  end loop;
  update public.requests r set state = public.rest_state(r.id), updated_at = now()
   where not (r.id = any (v_requests)) and r.state in ('con_oferta', 'en_espera_prioritaria')
     and r.id in (select unnest(o.candidate_ids) from public.slot_offers o where o.slot_id = any (v_slots));

  delete from public.calls
   where request_id = any (v_requests) or chat_session_id = any (v_sessions) or patient_id = any (v_rpat)
      or (c.patient_id is not null and patient_id = c.patient_id);
  delete from public.appointments where request_id = any (v_requests) and not is_base;
  delete from public.slots where id = any (v_slots);
  delete from public.messages where patient_id = any (v_rpat) or (c.patient_id is not null and patient_id = c.patient_id);
  delete from public.events where patient_id = any (v_rpat) or (c.patient_id is not null and patient_id = c.patient_id);
  delete from public.appointments where id = any (v_appts) or (patient_id = any (v_rpat) and not is_base);
  delete from identity.persons where id = any (v_persons);
  delete from public.patients where id = any (v_rpat) and demo_role is null and id like 'R%';
  delete from public.chat_sessions where id = any (v_sessions);
  delete from public.jury_visits where token = c.token;
  if c.patient_id is not null then
    update public.patients set last_seen_at = null, sound_ready = false where id = c.patient_id;
  end if;
  perform public.notify('bulk');
end $$;

create function public.jury_rearm(p_token text) returns jsonb
language plpgsql set search_path = '' as $$
begin
  perform public.jury_clear(p_token);
  return public.jury_ensure(p_token);
end $$;

-- Temporary test cards only: clear them and delete their phone and the card itself.
create function public.jury_drop_test(p_token text) returns void
language plpgsql set search_path = '' as $$
declare c public.jury_cards;
begin
  select * into c from public.jury_cards where token = p_token;
  if c.token is null then return; end if;
  if not c.is_test then raise exception 'only test cards can be dropped'; end if;
  perform public.jury_clear(p_token);
  if c.patient_id is not null then
    delete from public.calls where patient_id = c.patient_id;
    delete from public.messages where patient_id = c.patient_id;
    delete from public.events where patient_id = c.patient_id;
    update public.chat_sessions set linked_patient_id = null where linked_patient_id = c.patient_id;
    delete from public.patients where id = c.patient_id and demo_role = 'jurado';
  end if;
  delete from public.jury_cards where token = p_token;
end $$;

-- ---------------------------------------------------------------- the projector (read only)
-- Raw facts per card since the current demo started; src/lib/jury/overview.ts turns them into JuryOverview.
-- Fictitious characters only: no phone, document, insurance or district leaves this function.
create function public.jury_snapshot(p_include_test boolean default false) returns jsonb
language sql stable set search_path = '' as $$
  with ep as (select public.jury_epoch() as t),
  cards as (select c.* from public.jury_cards c where p_include_test or not c.is_test),
  appts as (
    select distinct on (c.token) c.token, a.id, a.specialty, a.date, a.time, a.status
    from cards c join public.appointments a on a.patient_id = c.patient_id and not a.is_base and a.origin = 'futura'
    order by c.token, a.id desc),
  reqs as (
    select j.token, r.id, r.code, r.specialty, r.category, r.state, r.source, r.seeded, r.created_at
    from public.jury_card_requests(p_include_test) j join public.requests r on r.id = j.request_id, ep
    where r.created_at >= ep.t),
  pos as (
    select x.id, row_number() over (partition by x.specialty
             order by (x.state = 'en_espera_prioritaria') desc, x.sort_key desc, x.first_attempt_at, x.id) as position
    from public.v_requests_v51 x
    where x.category is not null and x.state in ('priorizada_sin_cupo', 'en_espera_prioritaria', 'con_oferta')
      and x.specialty in (select specialty from reqs)),
  visits as (
    select v.token, min(v.created_at) as first_at from public.jury_visits v, ep where v.created_at >= ep.t group by v.token),
  appt_events as (
    select ap.token, e.to_status, e.channel, e.created_at as at
    from appts ap join public.events e on e.appointment_id = ap.id, ep
    where e.kind = 'estado' and e.to_status in ('confirmada', 'liberada', 'derivada_a_persona') and e.created_at >= ep.t),
  req_events as (
    select rq.token, rq.id as request_id, rq.specialty, ev.type, ev.payload, ev.at
    from reqs rq join public.request_events ev on ev.request_id = rq.id, ep
    where ev.at >= ep.t and ev.actor <> 'Semilla'
      and ev.type in ('recepcion', 'regulacion', 'oferta', 'respuesta_oferta', 'confirmacion', 'validacion_rechazada',
                      'espera_prioritaria', 'cierre')),
  card_calls as (
    select c.token, k.id, k.purpose, k.status, k.created_at, k.answered_at, k.ended_at
    from cards c join public.calls k
      on (c.patient_id is not null and k.patient_id = c.patient_id)
      or k.chat_session_id in (select v.chat_session_id from public.jury_visits v where v.token = c.token and v.chat_session_id is not null),
    ep
    where k.created_at >= ep.t),
  chats as (
    select v.token, min(m.created_at) as at
    from public.jury_visits v
    join public.conversations cv on cv.session_id = v.chat_session_id
    join public.chat_messages m on m.conversation_id = cv.id and m.direction = 'entrante', ep
    where m.created_at >= ep.t
    group by v.token),
  scene as (
    select c.token, s.id, s.specialty, s.date, s.time, s.state, s.created_at,
           exists (select 1 from public.slot_offers o where o.slot_id = s.id and o.state = 'enviada') as open_offer,
           (select jsonb_build_object('name', split_part(p.display_name, ' ', 1), 'state', a.validation_state, 'at', a.updated_at)
              from public.assignments a join public.requests r on r.id = a.request_id join identity.persons p on p.id = r.person_id
             where a.slot_id = s.id and not a.reverted and a.validation_state in ('pendiente', 'confirmada')
             order by a.id desc limit 1) as assignment
    from cards c join appts ap on ap.token = c.token join public.slots s on s.source_appointment_id = ap.id
    where c.scene)
  select jsonb_build_object(
    'epoch', (select t from ep),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object(
                'token', c.token, 'character', c.character, 'story', c.story, 'tryLine', c.try_line, 'channel', c.channel,
                'kind', c.kind, 'specialty', c.specialty, 'scene', c.scene, 'test', c.is_test, 'sort', c.sort,
                'appointment', (select to_jsonb(ap) - 'token' from appts ap where ap.token = c.token),
                'firstVisit', (select v.first_at from visits v where v.token = c.token)) order by c.sort, c.token), '[]'::jsonb)
              from cards c),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object(
                'token', rq.token, 'id', rq.id, 'code', rq.code, 'specialty', rq.specialty, 'category', rq.category,
                'state', rq.state, 'source', rq.source, 'seeded', rq.seeded, 'createdAt', rq.created_at,
                'position', (select pos.position from pos where pos.id = rq.id)) order by rq.id), '[]'::jsonb)
              from reqs rq),
    'apptEvents', (select coalesce(jsonb_agg(jsonb_build_object('token', token, 'toStatus', to_status, 'channel', channel, 'at', at)), '[]'::jsonb)
              from appt_events),
    'reqEvents', (select coalesce(jsonb_agg(jsonb_build_object('token', token, 'requestId', request_id, 'specialty', specialty,
                'type', type, 'payload', payload, 'at', at)), '[]'::jsonb) from req_events),
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('token', token, 'id', id, 'purpose', purpose, 'status', status,
                'createdAt', created_at, 'answeredAt', answered_at, 'endedAt', ended_at)), '[]'::jsonb) from card_calls),
    'chats', (select coalesce(jsonb_agg(jsonb_build_object('token', token, 'at', at)), '[]'::jsonb) from chats),
    'scene', (select jsonb_build_object('token', token, 'slotId', id, 'specialty', specialty, 'date', date, 'time', time,
                'state', state, 'openOffer', open_offer, 'releasedAt', created_at, 'assignment', assignment)
              from scene limit 1)
  )
$$;

-- ---------------------------------------------------------------- access: server key only (new objects only)
do $$
declare f text;
begin
  foreach f in array array[
    'public.jury_epoch()', 'public.jury_card_requests(boolean)', 'public.jury_ensure(text)', 'public.jury_open(text, uuid)',
    'public.jury_prepare()', 'public.jury_categorize(bigint, text, text)', 'public.jury_offer(text, text)',
    'public.jury_close(text, text)', 'public.jury_clear(text)', 'public.jury_rearm(text)', 'public.jury_drop_test(text)',
    'public.jury_snapshot(boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
