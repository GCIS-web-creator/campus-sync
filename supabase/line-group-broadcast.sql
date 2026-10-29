-- CampusSync: LINE公式アカウントが参加しているグループへの通知コピー先
-- グループIDは署名検証済みWebhookから自動登録されます。

create table if not exists public.line_group_chats (
  chat_id text primary key,
  chat_type text not null check (chat_type in ('group', 'room')),
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_event_type text,
  created_at timestamptz not null default now()
);

alter table public.line_group_chats enable row level security;
revoke all on table public.line_group_chats from anon, authenticated;
grant select, insert, update, delete on table public.line_group_chats to service_role;

-- Botをグループに招待後、ここに active=true のレコードが表示されることを確認
select chat_type, active, first_seen_at, last_seen_at, last_event_type
from public.line_group_chats
order by last_seen_at desc;
