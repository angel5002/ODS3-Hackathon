-- E5 (hito 2): one voice session per call, heartbeats, capacity and a voice event log.
-- ADDITIVE ONLY: new tables and new functions. Nothing that the deployed `main` uses is altered; existing
-- functions (update_call, reset_demo, ...) are only called, never replaced. The database is shared with the
-- deployed demo until the merge.

create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  call_id bigint not null references public.calls (id) on delete cascade, -- reset_demo deletes calls: sessions go too
  owner_kind text not null check (owner_kind in ('telefono', 'chat')),
  state text not null default 'solicitando'
    check (state in ('en_cola', 'solicitando', 'conectando', 'activa', 'finalizada', 'abandonada', 'rechazada', 'error')),
  agent text,
  conversation_id text,             -- ElevenLabs conversation id (getId()), for the post-call webhook
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text
);
-- at most ONE live voice session per call: a second device or tab cannot open another one
create unique index if not exists voice_sessions_one_live_per_call
  on public.voice_sessions (call_id) where state in ('solicitando', 'conectando', 'activa');
create index if not exists voice_sessions_state_seen on public.voice_sessions (state, last_seen_at);
create index if not exists voice_sessions_conversation on public.voice_sessions (conversation_id);

create table if not exists public.voice_events (
  id bigint generated always as identity primary key,
  session_id uuid references public.voice_sessions (id) on delete cascade,
  call_id bigint,
  at timestamptz not null default now(),
  source text not null check (source in ('cliente', 'servidor', 'elevenlabs')),
  kind text not null check (char_length(kind) <= 40),
  detail jsonb not null default '{}'::jsonb   -- codes, states and reasons only: never names or transcripts
);
create index if not exists voice_events_at on public.voice_events (at desc);
create index if not exists voice_events_session on public.voice_events (session_id, at);

-- server only: the browser never reads or writes these tables
alter table public.voice_sessions enable row level security;
alter table public.voice_events enable row level security;
revoke all on public.voice_sessions from anon, authenticated;
revoke all on public.voice_events from anon, authenticated;
grant all on public.voice_sessions to service_role;
grant all on public.voice_events to service_role;
grant usage, select on sequence public.voice_events_id_seq to service_role;

-- ---------------------------------------------------------------- helpers

create function public.voice_log(p_session uuid, p_call bigint, p_source text, p_kind text, p_detail jsonb default '{}'::jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare v_recent int;
begin
  -- rate limit: at most 60 events per session per minute (client diagnostics can't flood the table)
  if p_session is not null then
    select count(*) into v_recent from public.voice_events
     where session_id = p_session and at > now() - interval '1 minute';
    if v_recent >= 60 then return false; end if;
  end if;
  insert into public.voice_events (session_id, call_id, source, kind, detail)
  values (p_session, p_call, p_source, left(p_kind, 40), coalesce(p_detail, '{}'::jsonb));
  return true;
end $$;

-- conditional call status change (the voice code never overwrites a call that already moved on)
create function public.voice_call_status(p_call bigint, p_to text, p_result text default null)
returns boolean language plpgsql set search_path = '' as $$
declare c public.calls;
begin
  select * into c from public.calls where id = p_call for update;
  if c.id is null then return false; end if;
  if p_to = 'en_curso' and c.status not in ('sonando', 'en_curso') then return false; end if;
  if p_to in ('finalizada', 'fallo', 'rechazada', 'no_contesta') and c.status not in ('sonando', 'en_curso') then return false; end if;
  if p_to = 'en_curso' and c.status = 'en_curso' then return true; end if;
  perform public.update_call(p_call, p_to, p_result);
  return true;
end $$;

-- sessions without a heartbeat for 30 s are abandoned; their call is closed if nobody else is on it
create function public.voice_expire()
returns int language plpgsql set search_path = '' as $$
declare r record; v int := 0;
begin
  for r in
    update public.voice_sessions
       set state = 'abandonada', ended_at = now(), ended_reason = 'sin latido por 30 s'
     where state in ('en_cola', 'solicitando', 'conectando', 'activa') and last_seen_at < now() - interval '30 seconds'
    returning id, call_id, (connected_at is not null) as was_live
  loop
    v := v + 1;
    perform public.voice_log(r.id, r.call_id, 'servidor', 'sesion.vencida', jsonb_build_object('motivo', 'sin latido por 30 s'));
    if r.was_live and not exists (
      select 1 from public.voice_sessions s where s.call_id = r.call_id and s.state in ('solicitando', 'conectando', 'activa')
    ) then
      perform public.voice_call_status(r.call_id, 'finalizada', 'Se cortó la llamada (el navegador dejó de responder)');
    end if;
  end loop;
  return v;
end $$;

-- ---------------------------------------------------------------- claim / heartbeat / end

-- Atomically claims THE voice session of a call. Answers:
--   {ok: true, session_id}                              this device talks
--   {ok: false, reason: 'en_otro_dispositivo'}          another tab/device already has the live session
--   {ok: false, reason: 'ocupado', queue_id, position}  capacity reached: waits in a simple FIFO queue
--   {ok: false, reason: 'terminada'}                    the call is over
create function public.voice_claim(p_call bigint, p_owner_kind text, p_max int, p_queue uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare c public.calls; v_live int; v_ahead int; v_id uuid; q public.voice_sessions;
begin
  perform public.voice_expire();
  -- one claim at a time across the whole demo, so the capacity count and the queue order are exact
  perform pg_advisory_xact_lock(hashtext('asistia.voice_claim'));
  select * into c from public.calls where id = p_call for update;
  if c.id is null or c.status not in ('sonando', 'en_curso') then
    if p_queue is not null then
      update public.voice_sessions set state = 'finalizada', ended_at = now(), ended_reason = 'llamada terminada'
       where id = p_queue and state = 'en_cola';
    end if;
    return jsonb_build_object('ok', false, 'reason', 'terminada');
  end if;
  if exists (select 1 from public.voice_sessions s where s.call_id = p_call and s.state in ('solicitando', 'conectando', 'activa')) then
    perform public.voice_log(null, p_call, 'servidor', 'sesion.otro_dispositivo', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'en_otro_dispositivo');
  end if;

  if p_queue is not null then
    select * into q from public.voice_sessions where id = p_queue and call_id = p_call and state = 'en_cola';
  end if;
  select count(*) into v_live from public.voice_sessions where state in ('solicitando', 'conectando', 'activa');
  select count(*) into v_ahead from public.voice_sessions
   where state = 'en_cola' and (q.id is null or created_at < q.created_at) and id is distinct from q.id;

  if v_live >= greatest(p_max, 1) or v_ahead > 0 then
    if q.id is null then
      insert into public.voice_sessions (call_id, owner_kind, state) values (p_call, p_owner_kind, 'en_cola') returning * into q;
      perform public.voice_log(q.id, p_call, 'servidor', 'sesion.en_cola', jsonb_build_object('activas', v_live, 'maximo', p_max));
    else
      update public.voice_sessions set last_seen_at = now() where id = q.id;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'ocupado', 'queue_id', q.id, 'position', v_ahead + 1, 'active', v_live, 'max', p_max);
  end if;

  if q.id is not null then
    update public.voice_sessions set state = 'solicitando', last_seen_at = now() where id = q.id returning id into v_id;
  else
    insert into public.voice_sessions (call_id, owner_kind) values (p_call, p_owner_kind) returning id into v_id;
  end if;
  perform public.voice_log(v_id, p_call, 'servidor', 'sesion.reclamada', jsonb_build_object('activas', v_live + 1, 'maximo', p_max));
  return jsonb_build_object('ok', true, 'session_id', v_id);
end $$;

-- Heartbeat and state change of a session (conditional transitions). Returns {alive, state, call_status}.
-- p_state null = heartbeat only. Terminal states: finalizada, error, rechazada.
create function public.voice_update(p_session uuid, p_state text default null, p_conversation text default null,
                                               p_reason text default null, p_agent text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare s public.voice_sessions; v_call_status text; v_ok boolean := true;
begin
  perform public.voice_expire();
  select * into s from public.voice_sessions where id = p_session for update;
  if s.id is null then return jsonb_build_object('alive', false, 'state', 'desconocida'); end if;
  select status into v_call_status from public.calls where id = s.call_id;
  if s.state not in ('solicitando', 'conectando', 'activa') then
    return jsonb_build_object('alive', false, 'state', s.state, 'call_status', v_call_status);
  end if;
  if p_state is not null and p_state <> s.state then
    v_ok := case
      when p_state = 'conectando' then s.state = 'solicitando'
      when p_state = 'activa' then s.state in ('solicitando', 'conectando')
      when p_state in ('finalizada', 'error', 'rechazada') then true
      else false end;
  end if;
  update public.voice_sessions set
    last_seen_at = now(),
    conversation_id = coalesce(p_conversation, conversation_id),
    agent = coalesce(p_agent, agent),
    state = case when v_ok and p_state is not null then p_state else state end,
    connected_at = case when v_ok and p_state = 'activa' then coalesce(connected_at, now()) else connected_at end,
    ended_at = case when v_ok and p_state in ('finalizada', 'error', 'rechazada') then now() else ended_at end,
    ended_reason = case when v_ok and p_state in ('finalizada', 'error', 'rechazada') then left(coalesce(p_reason, p_state), 160) else ended_reason end
  where id = p_session
  returning * into s;
  if p_state is not null then
    perform public.voice_log(p_session, s.call_id, 'servidor', 'sesion.' || p_state,
      jsonb_build_object('aceptado', v_ok, 'motivo', left(coalesce(p_reason, ''), 160)));
  end if;
  -- the call itself can end elsewhere (other device, staff "Terminar", agent): the client must hang up
  if v_call_status not in ('sonando', 'en_curso') and s.state in ('solicitando', 'conectando', 'activa') then
    update public.voice_sessions set state = 'finalizada', ended_at = now(), ended_reason = 'la llamada terminó' where id = p_session;
    return jsonb_build_object('alive', false, 'state', 'finalizada', 'call_status', v_call_status);
  end if;
  return jsonb_build_object('alive', s.state in ('solicitando', 'conectando', 'activa'), 'state', s.state, 'call_status', v_call_status, 'accepted', v_ok);
end $$;

-- End of a session from the browser (hang up, pagehide beacon, unmount). With p_close_call the call is closed
-- too, unless another live session took over.
create function public.voice_end(p_session uuid, p_reason text, p_close_call boolean default false, p_result text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare s public.voice_sessions;
begin
  update public.voice_sessions
     set state = case when state = 'en_cola' then 'finalizada' else 'finalizada' end,
         ended_at = coalesce(ended_at, now()), ended_reason = left(coalesce(p_reason, 'fin'), 160), last_seen_at = now()
   where id = p_session and state in ('en_cola', 'solicitando', 'conectando', 'activa')
  returning * into s;
  if s.id is null then
    select * into s from public.voice_sessions where id = p_session;
    return jsonb_build_object('ended', false, 'state', coalesce(s.state, 'desconocida'));
  end if;
  perform public.voice_log(p_session, s.call_id, 'servidor', 'sesion.fin', jsonb_build_object('motivo', left(coalesce(p_reason, ''), 160)));
  if p_close_call and not exists (
    select 1 from public.voice_sessions x where x.call_id = s.call_id and x.state in ('solicitando', 'conectando', 'activa')
  ) then
    perform public.voice_call_status(s.call_id, 'finalizada', coalesce(p_result, 'Terminó la llamada'));
  end if;
  return jsonb_build_object('ended', true, 'call_id', s.call_id);
end $$;

-- Definitive close from the ElevenLabs post-call webhook (by conversation id).
create function public.voice_end_by_conversation(p_conversation text, p_reason text)
returns jsonb language plpgsql set search_path = '' as $$
declare s public.voice_sessions;
begin
  select * into s from public.voice_sessions where conversation_id = p_conversation order by created_at desc limit 1;
  if s.id is null then return jsonb_build_object('found', false); end if;
  perform public.voice_log(s.id, s.call_id, 'elevenlabs', 'webhook.fin', jsonb_build_object('motivo', left(coalesce(p_reason, ''), 160)));
  if s.state in ('solicitando', 'conectando', 'activa') then
    perform public.voice_end(s.id, coalesce(p_reason, 'webhook de fin de llamada'), true, 'Terminó la llamada');
  end if;
  return jsonb_build_object('found', true, 'session_id', s.id);
end $$;

-- What /demo shows: active sessions, queue and the latest voice events (no personal data).
create function public.voice_overview()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'active', (select count(*) from public.voice_sessions where state in ('solicitando', 'conectando', 'activa')),
    'queued', (select count(*) from public.voice_sessions where state = 'en_cola'),
    'sessions', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select left(id::text, 8) as id, call_id, owner_kind, state, agent, created_at, connected_at, ended_at, ended_reason,
               conversation_id is not null as has_conversation
          from public.voice_sessions order by created_at desc limit 20) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e order by e.at desc) from (
        select left(session_id::text, 8) as session, call_id, at, source, kind, detail
          from public.voice_events order by at desc limit 40) e), '[]'::jsonb)
  )
$$;

revoke all on function public.voice_log(uuid, bigint, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.voice_call_status(bigint, text, text) from public, anon, authenticated;
revoke all on function public.voice_expire() from public, anon, authenticated;
revoke all on function public.voice_claim(bigint, text, int, uuid) from public, anon, authenticated;
revoke all on function public.voice_update(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.voice_end(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.voice_end_by_conversation(text, text) from public, anon, authenticated;
revoke all on function public.voice_overview() from public, anon, authenticated;
grant execute on function public.voice_log(uuid, bigint, text, text, jsonb) to service_role;
grant execute on function public.voice_call_status(bigint, text, text) to service_role;
grant execute on function public.voice_expire() to service_role;
grant execute on function public.voice_claim(bigint, text, int, uuid) to service_role;
grant execute on function public.voice_update(uuid, text, text, text, text) to service_role;
grant execute on function public.voice_end(uuid, text, boolean, text) to service_role;
grant execute on function public.voice_end_by_conversation(text, text) to service_role;
grant execute on function public.voice_overview() to service_role;
