-- CampusSync Web Push & deadline reminder schema
-- Run this complete script in Supabase SQL Editor before enabling notifications.

-- Explicit deadline timestamp. Existing human-readable values such as "明日まで" stay in todos.due;
-- set due_at for each task in the app's task-details modal to activate server reminders.
alter table public.todos add column if not exists due_at timestamptz;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_student_id_idx on public.push_subscriptions(student_id);

create table if not exists public.push_reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null,
  reminders_enabled boolean not null default true,
  reminder_times text[] not null default array['dayBefore','morningOf']::text[],
  allowed_days text[] not null default array['Mon','Tue','Wed','Thu','Fri']::text[],
  timezone text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_reminder_preferences_student_id_idx on public.push_reminder_preferences(student_id);

create table if not exists public.push_reminder_deliveries (
  reminder_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null,
  todo_id text not null,
  reminder_type text not null,
  due_at timestamptz not null,
  sent_at timestamptz not null default now()
);
create index if not exists push_reminder_deliveries_user_id_idx on public.push_reminder_deliveries(user_id);

alter table public.push_subscriptions enable row level security;
alter table public.push_reminder_preferences enable row level security;
alter table public.push_reminder_deliveries enable row level security;

-- Recreate policies safely if the script is run again.
drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can create own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions" on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can create own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own push subscriptions" on public.push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can read own push reminder preferences" on public.push_reminder_preferences;
drop policy if exists "Users can create own push reminder preferences" on public.push_reminder_preferences;
drop policy if exists "Users can update own push reminder preferences" on public.push_reminder_preferences;
create policy "Users can read own push reminder preferences" on public.push_reminder_preferences
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can create own push reminder preferences" on public.push_reminder_preferences
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own push reminder preferences" on public.push_reminder_preferences
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- push_reminder_deliveries intentionally has no authenticated policies; only server-side service-role code accesses it.
