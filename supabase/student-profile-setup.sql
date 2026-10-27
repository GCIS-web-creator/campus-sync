-- CampusSync initial student profile setup marker.
-- Run this once in Supabase SQL Editor before deploying the profile setup UI.
-- This makes every current profile complete the one-time setup after rollout.
-- Passwords are managed by Supabase Auth and must never be added to public.profiles.

alter table public.profiles
  add column if not exists setup_completed_at timestamptz;

comment on column public.profiles.setup_completed_at is
  'Timestamp when the student completed the required first-login profile and Supabase Auth password setup. This is not a password field.';
