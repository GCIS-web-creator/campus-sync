-- CampusSync notification preferences (repeatable migration).
-- Run in Supabase SQL Editor. No secrets or message contents are stored here.

create table if not exists public.push_reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null,
  reminders_enabled boolean not null default true,
  reminder_times text[] not null default array['dayBefore', 'morningOf']::text[],
  allowed_days text[] not null default array['Mon', 'Tue', 'Wed', 'Thu', 'Fri']::text[],
  timezone text not null default 'Asia/Tokyo',
  notification_settings jsonb not null default
    '{"todo_reminders":true,"chat_messages":true,"school_announcements":true,"transport_alerts":true,"cafeteria_updates":false,"activity_updates":true}'::jsonb,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default time '21:00',
  quiet_hours_end time not null default time '07:00',
  updated_at timestamptz not null default now()
);

alter table public.push_reminder_preferences
  add column if not exists student_id text,
  add column if not exists reminders_enabled boolean not null default true,
  add column if not exists reminder_times text[] not null default array['dayBefore', 'morningOf']::text[],
  add column if not exists allowed_days text[] not null default array['Mon', 'Tue', 'Wed', 'Thu', 'Fri']::text[],
  add column if not exists timezone text not null default 'Asia/Tokyo',
  add column if not exists notification_settings jsonb not null default
    '{"todo_reminders":true,"chat_messages":true,"school_announcements":true,"transport_alerts":true,"cafeteria_updates":false,"activity_updates":true}'::jsonb,
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start time not null default time '21:00',
  add column if not exists quiet_hours_end time not null default time '07:00',
  add column if not exists updated_at timestamptz not null default now();

alter table public.push_reminder_preferences enable row level security;

drop policy if exists push_reminder_preferences_select_own on public.push_reminder_preferences;
create policy push_reminder_preferences_select_own
  on public.push_reminder_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_reminder_preferences_insert_own on public.push_reminder_preferences;
create policy push_reminder_preferences_insert_own
  on public.push_reminder_preferences for insert to authenticated
  with check (
    user_id = auth.uid()
    and student_id = split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1)
    and lower(coalesce(auth.jwt() ->> 'email', '')) ~ '^[0-9]{6}@tokyo[.]soka[.]ed[.]jp$'
  );

drop policy if exists push_reminder_preferences_update_own on public.push_reminder_preferences;
create policy push_reminder_preferences_update_own
  on public.push_reminder_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and student_id = split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1)
    and lower(coalesce(auth.jwt() ->> 'email', '')) ~ '^[0-9]{6}@tokyo[.]soka[.]ed[.]jp$'
  );

grant select, insert, update on public.push_reminder_preferences to authenticated;

comment on table public.push_reminder_preferences is
  'Per-user push notification preferences. Contains no notification secrets or message content.';
comment on column public.push_reminder_preferences.notification_settings is
  'Category switches: todo_reminders, chat_messages, school_announcements, transport_alerts, cafeteria_updates, activity_updates.';
