-- Reset deletes rows, so clients must reload everything instead of fetching only changed rows.
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
  perform public.notify('full'); -- rows were deleted: clients reload everything
end $$;

revoke execute on function public.reset_demo() from public, anon, authenticated;
grant execute on function public.reset_demo() to service_role;
