-- LINEグループ別受信設定のAdmin管理と、配信単位のグループ送信記録
-- 安全に再実行できる追加マイグレーションです。

alter table public.line_broadcast_history
  add column if not exists delivery_batch_id uuid;

create index if not exists line_broadcast_history_delivery_batch_idx
  on public.line_broadcast_history (delivery_batch_id);

create table if not exists public.line_group_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  delivery_batch_id uuid not null,
  kind text not null,
  chat_id text not null,
  chat_type text not null check (chat_type in ('group', 'room')),
  status text not null check (status in ('success', 'failure')),
  http_status integer,
  error_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (delivery_batch_id, chat_id)
);

create index if not exists line_group_delivery_logs_batch_idx
  on public.line_group_delivery_logs (delivery_batch_id, sent_at desc);

create index if not exists line_group_delivery_logs_sent_at_idx
  on public.line_group_delivery_logs (sent_at desc);

alter table public.line_group_delivery_logs enable row level security;
revoke all on table public.line_group_delivery_logs from anon, authenticated;
grant select, insert, update, delete on table public.line_group_delivery_logs to service_role;

-- 管理画面と配信APIは service_role 経由でのみ読み書きします。
