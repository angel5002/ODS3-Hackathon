-- E5 · final: pre-visit ("preconsulta", proposal v5.1 §3.1 and §4.1-4.2; pitch v7 scene 2).
-- A short chat before the appointment (motive, medicines and allergies, alarm signs) that reaches the doctor as a
-- summary "referido por el paciente". The state machine lives on the server (src/lib/preconsulta/machine.ts);
-- these tables only keep its state, the conversation (to audit the summary against it) and the doctor's edits.
--
-- ADDITIVE ONLY: three NEW tables and three NEW functions. Nothing existing is altered or replaced; create_task()
-- is only called (type 'alarma' / 'pide_persona', both already allowed). The browser never reads these tables:
-- RLS on, anon/authenticated revoked, service_role only. Every row expires after 24 h (preconsulta_purge).

create table if not exists public.preconsulta_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[a-f0-9]{32}$'),   -- the patient's capability (link /preconsulta/<token>)
  patient_alias text not null check (char_length(patient_alias) between 1 and 40),  -- always fictitious
  specialty text,
  appointment_time text check (appointment_time ~ '^\d{2}:\d{2}$'),  -- scheduled time, for the arrival window
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_curso', 'completa', 'derivada_emergencia', 'con_persona')),
  respondent text check (respondent in ('paciente', 'acompanante')),
  channel text not null default 'chat' check (channel in ('chat', 'voz')),
  source text not null default 'personal' check (source in ('personal', 'paciente', 'escena')),
  consent_at timestamptz,
  state jsonb not null default '{}'::jsonb,     -- machine state (src/lib/preconsulta/machine.ts)
  summary jsonb not null default '{}'::jsonb,   -- last summary for the doctor (PreconsultaSummary)
  version int not null default 0,               -- optimistic lock: a double submit never applies twice
  task_id bigint,                               -- staff task created by an alarm sign or "persona"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists preconsulta_sessions_updated on public.preconsulta_sessions (updated_at desc);

-- the conversation, turn by turn: the summary is audited against it
create table if not exists public.preconsulta_answers (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.preconsulta_sessions (id) on delete cascade,
  step text not null check (char_length(step) <= 30),
  who text not null check (who in ('ia', 'persona')),
  text text not null check (char_length(text) <= 600),
  interpreted jsonb,                            -- what the rules (or the model) understood, for the audit
  by text check (by in ('reglas', 'modelo')),
  at timestamptz not null default now()
);
create index if not exists preconsulta_answers_session on public.preconsulta_answers (session_id, id);

-- every correction by the doctor is recorded (proposal v5.1 §3.4)
create table if not exists public.preconsulta_edits (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.preconsulta_sessions (id) on delete cascade,
  field text not null check (field in ('motivo', 'inicio', 'alergias', 'medicamento', 'nota')),
  before jsonb,
  after jsonb,
  actor text not null default 'Médico',
  at timestamptz not null default now()
);
create index if not exists preconsulta_edits_session on public.preconsulta_edits (session_id, id);

alter table public.preconsulta_sessions enable row level security;
alter table public.preconsulta_answers enable row level security;
alter table public.preconsulta_edits enable row level security;
revoke all on public.preconsulta_sessions from anon, authenticated;
revoke all on public.preconsulta_answers from anon, authenticated;
revoke all on public.preconsulta_edits from anon, authenticated;
grant all on public.preconsulta_sessions to service_role;
grant all on public.preconsulta_answers to service_role;
grant all on public.preconsulta_edits to service_role;

-- One step of the interview, atomically: new state and summary only if nobody else advanced it (version), the
-- turns of the conversation, and at most one staff task (alarm sign → 'alarma', asked for a person → 'pide_persona').
create function public.preconsulta_apply(p_session uuid, p_version int, p_state jsonb, p_summary jsonb, p_status text,
                                         p_turns jsonb, p_task_type text default null, p_task_note text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare s public.preconsulta_sessions; v_task bigint; t jsonb;
begin
  select * into s from public.preconsulta_sessions where id = p_session for update;
  if s.id is null or s.expires_at < now() then raise exception 'preconsulta not found'; end if;
  if s.version <> p_version then return jsonb_build_object('ok', false, 'version', s.version); end if;
  if p_status not in ('pendiente', 'en_curso', 'completa', 'derivada_emergencia', 'con_persona') then raise exception 'invalid status'; end if;
  if p_task_type is not null then
    if p_task_type not in ('alarma', 'pide_persona') then raise exception 'invalid task'; end if;
    v_task := public.create_task(p_task_type, null, null, 'chat',
      left('Preconsulta de ' || s.patient_alias || ': ' || coalesce(p_task_note, ''), 300), p_session);
  end if;
  for t in select * from jsonb_array_elements(coalesce(p_turns, '[]'::jsonb)) loop
    insert into public.preconsulta_answers (session_id, step, who, text, interpreted, by)
    values (p_session, left(t->>'step', 30), t->>'who', left(t->>'text', 600), t->'interpreted', t->>'by');
  end loop;
  update public.preconsulta_sessions
     set state = p_state, summary = p_summary, status = p_status, version = version + 1, updated_at = now(),
         task_id = coalesce(v_task, task_id)
   where id = p_session;
  return jsonb_build_object('ok', true, 'version', s.version + 1, 'task_id', v_task);
end $$;

-- A correction by the doctor: the summary changes and the edit (before/after) is kept.
create function public.preconsulta_edit(p_session uuid, p_field text, p_before jsonb, p_after jsonb, p_summary jsonb,
                                        p_actor text default 'Médico')
returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.preconsulta_sessions where id = p_session and expires_at > now()) then
    raise exception 'preconsulta not found';
  end if;
  insert into public.preconsulta_edits (session_id, field, before, after, actor)
  values (p_session, p_field, p_before, p_after, left(coalesce(p_actor, 'Médico'), 40));
  update public.preconsulta_sessions set summary = p_summary, version = version + 1, updated_at = now() where id = p_session;
end $$;

-- 24 h at most (the same rule as the chat sessions)
create function public.preconsulta_purge()
returns int language sql set search_path = '' as $$
  with d as (delete from public.preconsulta_sessions where expires_at < now() returning 1) select count(*)::int from d
$$;

revoke all on function public.preconsulta_apply(uuid, int, jsonb, jsonb, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.preconsulta_edit(uuid, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.preconsulta_purge() from public, anon, authenticated;
grant execute on function public.preconsulta_apply(uuid, int, jsonb, jsonb, text, jsonb, text, text) to service_role;
grant execute on function public.preconsulta_edit(uuid, text, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.preconsulta_purge() to service_role;
