-- AsistIA E5, hito 4: waiting-list order of proposal v5.1 (section 3.5).
-- Order = clinical category first and, WITHIN it, the fraction of the maximum deadline already consumed since
-- the first attempt: R = min(days / deadline, 1), deadlines 30 / 90 / 180 / 360 days for P1-P4. NO bonuses
-- (v4 added 0.15 for a first visit and 0.10 for preferential care). Never uses insurance, sex or past no-shows.
--
-- ADDITIVE ONLY. The database is shared with the deployed demo (branch main) until the merge, so this file
-- creates NEW objects and does not alter, drop or replace anything main uses: `create function` and
-- `create view` (no `or replace`), so applying it twice, or over an existing name, FAILS instead of replacing.
-- public.v_requests, staff_requests(), propose_candidates(), close_offer() and assign_next() keep the v4 index.
--
-- breakeven_r (0.053 -> 0.052) is a row of public.params, i.e. data that production also shows: it is NOT
-- changed here. See supabase/data/20261107_breakeven_v51.sql.
-- Inverse: supabase/rollback/20261107020000_e5_v51_priority.down.sql

-- ---------------------------------------------------------------- the index
-- Its only inputs are the days waited and the deadline of the category: by construction it cannot read
-- insurance, sex, the no-show history or whether the person has an appointment.
create function public.priority_v51(p_days_waited int, p_deadline_days int) returns numeric
language sql immutable set search_path = '' as $$
  select case when p_deadline_days is null or p_deadline_days <= 0 then null
              else round(least(greatest(coalesce(p_days_waited, 0), 0)::numeric / p_deadline_days, 1), 4) end
$$;

-- ---------------------------------------------------------------- the list, with the v5.1 index
-- Same column names as public.v_requests (idx, reason, pct_deadline...) so a reader can switch by changing
-- only the source. Differences: idx is the deadline fraction; reason says only what orders the list
-- (category and % of the deadline); there is no grammar_sex column and identity.equity_attributes is not read.
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
       round(100 * least(b.days_waited::numeric / b.eff_deadline, 9.99))::int as pct_deadline,
       concat_ws(' · ',
         case when b.category is null then 'P3 provisional' else b.category end,
         round(100 * b.days_waited::numeric / b.eff_deadline)::int || ' % de su plazo') as reason
from base b;

-- ---------------------------------------------------------------- Admisión: waiting list (copy of staff_requests)
-- Same output as public.staff_requests(); order: open first, then category, then deadline fraction, then the
-- earliest first attempt (who waited longest when two have reached 100 %).
create function public.staff_requests_v51() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.ord, x.cat, x.idx desc, x.first_attempt_at, x.id), '[]') from (
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
    from public.v_requests_v51 r
    join identity.persons p on p.id = r.person_id
    left join public.patients pt on pt.id = p.patient_id and pt.demo_role is not null
    left join public.appointments ca on ca.id = r.current_appointment_id
  ) x
$$;

-- ---------------------------------------------------------------- free slot proposal (copy of propose_candidates)
-- Read-only (stable). Same eligibility filter, k and fill probability as public.propose_candidates(); only the
-- index it orders by is the v5.1 one. approve_offer() still calls the v4 function.
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

-- ---------------------------------------------------------------- access: server key only (new objects only)
revoke all on public.v_requests_v51 from anon, authenticated;
grant select on public.v_requests_v51 to service_role;

revoke all on function public.priority_v51(int, int) from public, anon, authenticated;
revoke all on function public.staff_requests_v51() from public, anon, authenticated;
revoke all on function public.propose_candidates_v51(bigint) from public, anon, authenticated;
grant execute on function public.priority_v51(int, int) to service_role;
grant execute on function public.staff_requests_v51() to service_role;
grant execute on function public.propose_candidates_v51(bigint) to service_role;
