-- CampusSync initial student profile setup marker.
-- Run this once in Supabase SQL Editor before deploying the profile setup UI.
-- Existing profile rows will have a NULL marker and will be asked to complete setup on their next sign-in.
-- Once setup is saved, setup_completed_at prevents the form from being shown again.
-- Passwords are managed by Supabase Auth and must never be added to public.profiles.

alter table public.profiles
  add column if not exists setup_completed_at timestamptz;

comment on column public.profiles.setup_completed_at is
  'Timestamp when the student completed the required first-login profile and Supabase Auth password setup. This is not a password field.';
