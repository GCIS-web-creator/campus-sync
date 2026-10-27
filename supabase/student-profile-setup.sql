-- CampusSync initial student profile setup marker.
-- Run this once in Supabase SQL Editor before deploying the profile setup UI.
-- Existing profile rows will have a NULL marker and will be asked to complete setup on their next sign-in.
-- Once setup is saved, setup_completed_at prevents the form from being shown again.
-- Passwords are managed by Supabase Auth and must never be added to public.profiles.

-- Columns used by the initial setup form and safe self-service profile linking.
alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists auth_user_id uuid;

create index if not exists profiles_auth_user_id_idx
  on public.profiles (auth_user_id)
  where auth_user_id is not null;


alter table public.profiles
  add column if not exists setup_completed_at timestamptz;

comment on column public.profiles.setup_completed_at is
  'Timestamp when the student completed the required first-login profile and Supabase Auth password setup. This is not a password field.';

-- Let a signed-in student read their own profile, link an unlinked row whose
-- student ID matches their verified school-email prefix, and update only that row.
-- These policies do not grant access to other students' profiles.
drop policy if exists profiles_self_select_initial_setup on public.profiles;
create policy profiles_self_select_initial_setup
  on public.profiles
  for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or (
      auth_user_id is null
      and student_id = split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1)
      and lower(coalesce(auth.jwt() ->> 'email', '')) ~ '^[0-9]{6}@tokyo[.]soka[.]ed[.]jp$'
    )
  );

drop policy if exists profiles_self_insert_initial_setup on public.profiles;
create policy profiles_self_insert_initial_setup
  on public.profiles
  for insert
  to authenticated
  with check (
    auth_user_id = auth.uid()
    and student_id = split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1)
    and lower(coalesce(auth.jwt() ->> 'email', '')) ~ '^[0-9]{6}@tokyo[.]soka[.]ed[.]jp$'
  );

drop policy if exists profiles_self_update_initial_setup on public.profiles;
create policy profiles_self_update_initial_setup
  on public.profiles
  for update
  to authenticated
  using (
    (
      auth_user_id = auth.uid()
      or (
        auth_user_id is null
        and student_id = split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1)
      )
    )
    and lower(coalesce(auth.jwt() ->> 'email', '')) ~ '^[0-9]{6}@tokyo[.]soka[.]ed[.]jp$'
  )
  with check (
    auth_user_id = auth.uid()
    and student_id = split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1)
    and lower(coalesce(auth.jwt() ->> 'email', '')) ~ '^[0-9]{6}@tokyo[.]soka[.]ed[.]jp$'
  );
