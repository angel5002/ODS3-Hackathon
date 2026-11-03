-- service_role does not own the identity sequences: truncate without restarting them,
-- and allow setval on the sequence used for reassigned appointments.
create or replace function public.wipe_all() returns void
language plpgsql set search_path = '' as $$
begin
  truncate public.events, public.messages, public.calls, public.offers, public.appointment_outcomes,
           public.waitlist, public.appointments, public.patients, public.metrics cascade;
end $$;

revoke execute on function public.wipe_all() from public, anon, authenticated;
grant execute on function public.wipe_all() to service_role;
grant update on sequence public.appointment_extra_seq to service_role;
