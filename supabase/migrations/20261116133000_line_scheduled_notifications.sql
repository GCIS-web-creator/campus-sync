-- LINE CSAI delayed reminders. Access is server-only through the service role.
create table if not exists public.line_scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  bot_slot smallint not null check (bot_slot between 0 and 5),
  message text not null check (char_length(btrim(message)) between 1 and 300),
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts smallint not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists line_scheduled_notifications_due_idx
  on public.line_scheduled_notifications (scheduled_at, next_attempt_at)
  where status in ('pending', 'sending');

alter table public.line_scheduled_notifications enable row level security;
revoke all on table public.line_scheduled_notifications from anon, authenticated;
grant all on table public.line_scheduled_notifications to service_role;
