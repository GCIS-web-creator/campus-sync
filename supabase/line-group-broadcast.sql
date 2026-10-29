-- CampusSync: LINEグループ配信先と通知種別ごとの受信設定
-- Group IDはLINE Webhookから自動登録できます。列追加は何度実行しても安全です。
-- 時間割・電車時刻表は新規登録グループでON、その他の通知は初期状態OFFです。既存グループは下記の設定SQLで選択します。

create table if not exists public.line_group_chats (
  chat_id text primary key,
  chat_type text not null check (chat_type in ('group', 'room')),
  active boolean not null default true,
  receive_general_notifications boolean not null default false,
  receive_train_timetable boolean not null default true,
  receive_class_timetable boolean not null default true,
  receive_school_schedule boolean not null default true,
  receive_cafeteria_sold_out boolean not null default false,
  receive_assignment_updates boolean not null default false,
  receive_quick_notices boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_event_type text,
  created_at timestamptz not null default now()
);

-- Existing database migrations. These keep existing group rows and only add missing columns.
alter table public.line_group_chats
  add column if not exists receive_general_notifications boolean not null default false;
alter table public.line_group_chats
  add column if not exists receive_train_timetable boolean not null default true;
alter table public.line_group_chats
  add column if not exists receive_class_timetable boolean not null default true;
alter table public.line_group_chats
  add column if not exists receive_school_schedule boolean not null default true;
alter table public.line_group_chats
  add column if not exists receive_cafeteria_sold_out boolean not null default false;
alter table public.line_group_chats
  add column if not exists receive_assignment_updates boolean not null default false;
alter table public.line_group_chats
  add column if not exists receive_quick_notices boolean not null default false;

-- New LINE groups receive both timetable categories by default; unrelated categories remain opt-in.
alter table public.line_group_chats alter column receive_train_timetable set default true;
alter table public.line_group_chats alter column receive_class_timetable set default true;
alter table public.line_group_chats alter column receive_school_schedule set default true;

alter table public.line_group_chats enable row level security;
revoke all on table public.line_group_chats from anon, authenticated;
grant select, insert, update, delete on table public.line_group_chats to service_role;

-- Inspect registered group IDs and notification preferences.
select
  chat_id,
  chat_type,
  active,
  receive_general_notifications,
  receive_train_timetable,
  receive_class_timetable,
  receive_school_schedule,
  receive_cafeteria_sold_out,
  receive_assignment_updates,
  receive_quick_notices,
  last_seen_at,
  last_event_type
from public.line_group_chats
order by last_seen_at desc;

-- To enable all requested categories on one group, replace PASTE_GROUP_ID_HERE and
-- run this UPDATE separately. General notices remain OFF so unrelated notices won't mix in.
-- update public.line_group_chats
-- set active = true,
--     receive_train_timetable = true,
--     receive_class_timetable = true,
--     receive_school_schedule = true,
--     receive_cafeteria_sold_out = true,
--     receive_assignment_updates = true,
--     receive_quick_notices = true,
--     receive_general_notifications = false
-- where chat_id = 'PASTE_GROUP_ID_HERE';
