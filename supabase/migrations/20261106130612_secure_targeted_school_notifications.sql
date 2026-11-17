begin;

alter table public.notifications enable row level security;

drop policy if exists public_read_notifications on public.notifications;
drop policy if exists public_insert_notifications on public.notifications;
drop policy if exists school_notifications_read_target on public.notifications;

create policy school_notifications_read_target
  on public.notifications
  for select
  to anon, authenticated
  using (
    target_user_id is null
    or target_user_id = (select auth.uid())
  );

grant select on public.notifications to anon, authenticated, service_role;
revoke insert, update, delete on public.notifications from public, anon, authenticated;
grant insert, update, delete on public.notifications to service_role;

commit;
;
