-- CampusSync: LINEグループ配信先と通知種類の設定
-- Group IDは署名検証済みWebhookから自動登録されます。
-- 配信種類は最初はすべてOFF。必要なグループだけをSQLで明示的にONにします。

create table if not exists public.line_group_chats (
  chat_id text primary key,
  chat_type text not null check (chat_type in ('group', 'room')),
  active boolean not null default true,
  receive_general_notifications boolean not null default false,
  receive_train_timetable boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_event_type text,
  created_at timestamptz not null default now()
);

-- Existing deployments may have the earlier version of this table.
alter table public.line_group_chats
  add column if not exists receive_general_notifications boolean not null default false;
alter table public.line_group_chats
  add column if not exists receive_train_timetable boolean not null default false;

alter table public.line_group_chats enable row level security;
revoke all on table public.line_group_chats from anon, authenticated;
grant select, insert, update, delete on table public.line_group_chats to service_role;

-- 1) Run after the bot is added to a group and the group sends/receives an event.
-- This query lists IDs registered from LINE's verified webhook events.
select chat_id, chat_type, active, receive_general_notifications, receive_train_timetable, last_seen_at, last_event_type
from public.line_group_chats
order by last_seen_at desc;

-- 2) After identifying the one group that should receive hourly train timetables,
-- replace PASTE_GROUP_ID_HERE with that exact chat_id and run the following UPDATE separately:
-- update public.line_group_chats
-- set receive_train_timetable = (chat_id = 'PASTE_GROUP_ID_HERE'),
--     receive_general_notifications = false
-- where chat_type in ('group', 'room');
