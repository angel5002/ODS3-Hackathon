-- AsistIA v4: data model (docs/requisitos_v4.md section 2).
-- * identity schema: who the person is. Never reachable from the browser (no grants to anon/authenticated)
--   and only read inside server functions, for contact and the equity audit.
-- * public schema: operation (requests, slots, offers, assignments, tasks, chat, calls).
-- * From v4 on, the browser reads NOTHING with identity: every screen gets its data from our server
--   routes, which apply the role (the regulator gets the blind view only). The browser keeps read access
--   to demo_state and metrics (no personal data) and Realtime hints carry ids only, never content.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- lock the E1 tables
do $$
declare t text;
begin
  foreach t in array array['patients', 'appointments', 'waitlist', 'offers', 'messages', 'calls', 'events'] loop
    execute format('drop policy if exists "browser can read" on public.%I', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- identity
create schema if not exists identity;
revoke all on schema identity from public, anon, authenticated;
grant usage on schema identity to service_role;

create table identity.persons (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,          -- always fictitious in the demo
  birth_year int,
  patient_id text references public.patients (id) on delete set null, -- link to a simulated phone, if any
  seeded boolean not null default false,
  created_at timestamptz not null default now()
);
create index persons_patient_idx on identity.persons (patient_id);

create table identity.person_identifiers (
  id bigint generated always as identity primary key,
  person_id uuid not null references identity.persons (id) on delete cascade,
  type text not null check (type in ('dni', 'ce', 'pasaporte', 'otro', 'sin_documento')),
  value_masked text,                   -- the demo never stores a full number
  verified boolean not null default false
);

create table identity.contact_points (
  id bigint generated always as identity primary key,
  person_id uuid not null references identity.persons (id) on delete cascade,
  channel text not null check (channel in ('webchat', 'voz_navegador', 'simulado')),
  chat_session_id uuid,
  consent_at timestamptz,
  expires_at timestamptz
  -- no phone numbers, by design
);

create table identity.equity_attributes (
  person_id uuid primary key references identity.persons (id) on delete cascade,
  insurance boolean,                   -- has health insurance
  district text,
  origin_facility text,
  sex text check (sex in ('F', 'M'))
);

grant all on all tables in schema identity to service_role;
grant usage, select on all sequences in schema identity to service_role;
alter default privileges in schema identity grant all on tables to service_role;

-- ---------------------------------------------------------------- parameters (proposal 4.6 + demo)
create table public.params (
  key text primary key,
  value numeric not null,
  label text not null,
  unit text not null default '',
  sort int not null default 0
);

insert into public.params (key, value, label, unit, sort) values
  ('deadline_p1', 30, 'Plazo máximo P1', 'días', 1),
  ('deadline_p2', 90, 'Plazo máximo P2', 'días', 2),
  ('deadline_p3', 180, 'Plazo máximo P3', 'días', 3),
  ('deadline_p4', 360, 'Plazo máximo P4', 'días', 4),
  ('w_r', 0.75, 'Peso del plazo consumido (R)', '', 5),
  ('w_n', 0.15, 'Peso de primera consulta (N)', '', 6),
  ('w_e', 0.10, 'Peso de atención preferente (E)', '', 7),
  ('zone_near_min', 2, 'Zona cercana desde', 'días', 10),
  ('zone_near_max', 3, 'Zona cercana hasta', 'días', 11),
  ('zone_mid_max', 14, 'Zona media hasta', 'días', 12),
  ('protected_pct', 0.20, 'Cupos protegidos para P1 y P2 (próximos 3 días)', '%', 13),
  ('fill_target', 0.60, 'Probabilidad objetivo de llenado', '%', 14),
  ('k_max', 8, 'Tope de candidatos por oferta (k)', 'personas', 15),
  ('a_base', 0.10, 'Probabilidad de aceptar (a)', '%', 16),
  ('a_short', 0.25, 'Probabilidad de aceptar con poco aviso', '%', 17),
  ('offer_window_min', 120, 'Ventana de respuesta de la oferta', 'min de demo', 18),
  ('validation_timeout_min', 60, 'Plazo para validar una asignación', 'min de demo', 19),
  ('regulation_due_hours', 72, 'Plazo para regular una solicitud', 'horas', 20),
  ('s', 0, 'Escenario: s (inasistencias evitadas por recordar)', '%', 30),
  ('c', 0.3333, 'Escenario: c (inasistencias que avisan antes)', '%', 31),
  ('f', 0.30, 'Escenario: f (cupos liberados que se llenan)', '%', 32),
  ('annual_no_shows', 106100, 'Citas perdidas en 2023 (HMA)', 'citas', 33),
  ('breakeven_r', 0.053, 'Recuperación desde la que el hospital obtiene beneficio', '%', 34);

-- ---------------------------------------------------------------- demo calendar
-- The demo "today" is Monday 16/10/2023; demo minutes count from 00:00 of that day.
alter table public.demo_state add column if not exists demo_date date not null default '2023-10-16';
alter table public.demo_state alter column clock_base_min set default 480;

-- ---------------------------------------------------------------- appointments: v4 columns
alter table public.appointments add column if not exists uses_messaging boolean not null default true;
alter table public.appointments add column if not exists request_id bigint;
alter table public.appointments add column if not exists reschedule_to jsonb;       -- {"date": "...", "time": "..."}
alter table public.appointments add column if not exists reminder_24_at_min int;
alter table public.appointments alter column patient_id drop not null;
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check check (status in (
  'pendiente', 'recordatorio_enviado', 'confirmada', 'liberada', 'sin_respuesta', 'en_llamada',
  'derivada_a_persona', 'reasignada', 'reprogramacion_pendiente', 'validacion_pendiente'));
alter table public.appointments drop constraint if exists appointments_origin_check;
alter table public.appointments add constraint appointments_origin_check check (origin in (
  'agenda', 'lista_espera', 'futura', 'reprogramada'));
create index if not exists appointments_date_idx on public.appointments (date);

-- ---------------------------------------------------------------- requests (the whole demand)
create sequence public.request_code_seq start 1;

create table public.requests (
  id bigint generated always as identity primary key,
  code text not null unique,
  person_id uuid not null references identity.persons (id) on delete cascade,
  specialty text not null,
  modality text not null default 'presencial' check (modality in ('presencial', 'remota')),
  first_attempt_at date not null,      -- the waiting clock: never reset
  referral boolean not null default false,
  reason_text text,                    -- already scrubbed of names, numbers and e-mails
  age int not null,
  pregnant boolean not null default false,
  disability boolean not null default false,
  first_visit boolean not null default true,
  preferred_channel text not null default 'mensaje' check (preferred_channel in ('mensaje', 'llamada', 'chat')),
  short_notice_ok boolean not null default false,
  current_appointment_id bigint references public.appointments (id) on delete set null,
  category text check (category in ('P1', 'P2', 'P3', 'P4')),
  deadline_days int,
  due_date date,
  state text not null default 'registrada' check (state in (
    'registrada', 'pendiente_regulacion', 'pendiente_informacion', 'priorizada_sin_cupo', 'con_oferta',
    'en_espera_prioritaria', 'asignada_por_validar', 'con_cita', 'atendida', 'derivada_emergencia',
    'cerrada_con_causal')),
  priority_index numeric(5, 4),
  priority_reason text,
  source text not null default 'ventanilla' check (source in ('ventanilla', 'chat', 'voz', 'formulario', 'semilla')),
  sim_offer_reply text check (sim_offer_reply in ('acepta', 'declina', 'sin_respuesta')),
  last_moved_at date,                  -- last time the person was moved to an earlier date (max once a week)
  seeded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_specialty_idx on public.requests (specialty, state);
create index requests_person_idx on public.requests (person_id);
alter table public.appointments add constraint appointments_request_fk
  foreign key (request_id) references public.requests (id) on delete set null;

create table public.request_events (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.requests (id) on delete cascade,
  type text not null,                  -- indicacion, recepcion, pedido_informacion, regulacion, fecha_limite,
                                       -- primera_oferta, confirmacion, atencion, cierre, oferta, asignacion, ...
  at timestamptz not null default now(),
  demo_min int,
  actor text not null,
  payload jsonb not null default '{}'
);
create index request_events_request_idx on public.request_events (request_id, id);

-- ---------------------------------------------------------------- slots, offers, assignments
create table public.slots (
  id bigint generated always as identity primary key,
  specialty text not null,
  date date not null,
  time text not null,
  remote boolean not null default false,
  state text not null default 'libre' check (state in ('libre', 'retenido', 'ocupado')),
  appointment_id bigint references public.appointments (id) on delete set null,      -- the new appointment
  source_appointment_id bigint references public.appointments (id) on delete cascade, -- the one that freed it
  origin text not null default 'liberado' check (origin in ('liberado', 'domino', 'agenda_libre', 'cupo_del_dia')),
  protected boolean not null default false,
  round int not null default 0,        -- each round without takers moves the offer to the next zone
  seeded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index slots_source_unique on public.slots (source_appointment_id) where source_appointment_id is not null;

create table public.slot_offers (
  id bigint generated always as identity primary key,
  slot_id bigint not null references public.slots (id) on delete cascade,
  zone text not null check (zone in ('cercana', 'media', 'lejana')),
  k int not null,
  fill_probability numeric(5, 4) not null,
  candidate_ids bigint[] not null,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  sent_at timestamptz not null default now(),
  sent_min int not null,
  closes_min int not null,
  closed_at timestamptz,
  state text not null default 'enviada' check (state in ('borrador', 'enviada', 'cerrada', 'sin_aceptantes')),
  round int not null default 0
);
create index slot_offers_slot_idx on public.slot_offers (slot_id);

create table public.offer_responses (
  id bigint generated always as identity primary key,
  offer_id bigint not null references public.slot_offers (id) on delete cascade,
  request_id bigint not null references public.requests (id) on delete cascade,
  response text not null check (response in ('acepta', 'declina', 'sin_respuesta')),
  channel text not null,
  at timestamptz not null default now(),
  demo_min int,
  unique (offer_id, request_id)        -- idempotent: a repeated answer never duplicates
);

create table public.assignments (
  id bigint generated always as identity primary key,
  slot_id bigint not null references public.slots (id) on delete cascade,
  request_id bigint not null references public.requests (id) on delete cascade,
  offer_id bigint references public.slot_offers (id) on delete set null,
  rule text not null,
  origin text not null check (origin in ('liberado', 'domino', 'cupo_del_dia')),
  validation_state text not null default 'pendiente' check (validation_state in ('pendiente', 'confirmada', 'fallida', 'vencida')),
  validated_by text check (validated_by in ('mensaje', 'agente', 'persona')),
  validated_role text check (validated_role in ('paciente', 'cuidador')),
  validation_deadline_min int,
  attempts int not null default 0,
  previous_appointment_id bigint references public.appointments (id) on delete set null,
  new_appointment_id bigint references public.appointments (id) on delete set null,
  reverted boolean not null default false,
  revert_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_slot_idx on public.assignments (slot_id);
create index assignments_request_idx on public.assignments (request_id);

create table public.withdrawals (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.requests (id) on delete cascade,
  reason text not null check (reason in ('atendido_en_otro_lugar', 'ya_no_lo_necesita', 'duplicado', 'otro')),
  reason_text text,
  "user" text not null,
  at timestamptz not null default now(),
  check (reason <> 'otro' or coalesce(trim(reason_text), '') <> '')
);

create table public.staff_tasks (
  id bigint generated always as identity primary key,
  type text not null check (type in ('pide_persona', 'derivacion_clinica', 'validacion_fallida', 'p1_no_contactable', 'alarma')),
  request_id bigint references public.requests (id) on delete cascade,
  appointment_id bigint references public.appointments (id) on delete cascade,
  assignment_id bigint references public.assignments (id) on delete set null,
  chat_session_id uuid,
  state text not null default 'abierta' check (state in ('abierta', 'en_curso', 'cerrada')),
  outcome text check (outcome in ('confirmo', 'rechazo', 'no_contesto', 'pidio_otra_fecha', 'resuelta')),
  note text,
  source text not null default 'sistema',   -- chat, telefono, agente, regulador, sistema
  handled_by text,
  created_at timestamptz not null default now(),
  created_min int,
  closed_at timestamptz
);

-- ---------------------------------------------------------------- live web chat
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  alias text not null,                 -- fictitious alias shown to the operator
  topic text not null unique,          -- Realtime topic for content-free hints
  consent_at timestamptz,
  linked_patient_id text references public.patients (id) on delete set null,  -- "Vincular a personaje"
  linked_request_id bigint references public.requests (id) on delete set null,
  bot jsonb not null default '{"step": "consent"}',
  sound_ready boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

-- one conversation per session in the demo (kept separate so a pilot can have several)
create table public.conversations (
  id bigint generated always as identity primary key,
  session_id uuid not null unique references public.chat_sessions (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('saliente', 'entrante')),
  kind text not null default 'bot' check (kind in ('bot', 'oferta', 'validacion', 'recordatorio', 'info', 'usuario', 'sistema')),
  body text not null,
  buttons jsonb,
  ref jsonb,                           -- {"offer": 1} | {"assignment": 2} | {"appointment": 3}
  answered_with text,
  demo_min int,
  created_at timestamptz not null default now()
);
create index chat_messages_conv_idx on public.chat_messages (conversation_id, id);

-- ---------------------------------------------------------------- calls: v4 columns
alter table public.calls alter column appointment_id drop not null;
alter table public.calls alter column patient_id drop not null;
alter table public.calls add column if not exists purpose text not null default 'confirmacion'
  check (purpose in ('confirmacion', 'oferta', 'validacion', 'registro', 'prueba'));
alter table public.calls add column if not exists chat_session_id uuid references public.chat_sessions (id) on delete cascade;
alter table public.calls add column if not exists request_id bigint references public.requests (id) on delete cascade;
alter table public.calls add column if not exists offer_id bigint references public.slot_offers (id) on delete set null;
alter table public.calls add column if not exists assignment_id bigint references public.assignments (id) on delete set null;
alter table public.calls add column if not exists provider text;           -- elevenlabs | gemini | guion
alter table public.calls add column if not exists external_id text;        -- ElevenLabs conversation id
alter table public.calls add column if not exists summary text;
alter table public.calls add column if not exists actions jsonb not null default '[]';
alter table public.calls add column if not exists duration_s int;
alter table public.calls add column if not exists simulated boolean not null default false;
alter table public.calls drop constraint if exists calls_status_check;
alter table public.calls add constraint calls_status_check check (status in (
  'sonando', 'en_curso', 'finalizada', 'no_contesta', 'rechazada', 'fallo'));
create index if not exists calls_session_idx on public.calls (chat_session_id, id);
create index if not exists calls_request_idx on public.calls (request_id);

-- simulated phone messages may now belong to a request (offers, validations) instead of an appointment
alter table public.messages add column if not exists request_id bigint references public.requests (id) on delete cascade;
alter table public.messages add column if not exists slot_offer_id bigint references public.slot_offers (id) on delete cascade;
alter table public.messages add column if not exists assignment_id bigint references public.assignments (id) on delete cascade;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in (
  'recordatorio', 'oferta', 'info', 'respuesta', 'validacion', 'reprogramacion'));

-- E1 events: allow the new channel names
alter table public.events drop constraint if exists events_channel_check;
alter table public.events add constraint events_channel_check check (channel in ('panel', 'mensaje', 'voz', 'sistema', 'chat'));

-- ---------------------------------------------------------------- access for the new tables
do $$
declare t text;
begin
  foreach t in array array['params', 'requests', 'request_events', 'slots', 'slot_offers', 'offer_responses',
                           'assignments', 'withdrawals', 'staff_tasks', 'chat_sessions', 'conversations',
                           'chat_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select, update on all sequences in schema public to service_role;
