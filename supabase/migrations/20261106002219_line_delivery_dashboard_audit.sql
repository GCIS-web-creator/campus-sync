-- LINE配信ダッシュボード用の詳細監査ログ。再実行可能です。
create table if not exists public.line_delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_batch_id uuid,
  channel text not null check (channel in ('broadcast', 'push', 'reply')),
  destination_type text not null check (destination_type in ('official_account', 'group', 'room', 'user', 'unknown')),
  destination_id text,
  kind text not null default 'general',
  bot_slot smallint check (bot_slot is null or bot_slot between 0 and 3),
  status text not null check (status in ('success', 'failure')),
  http_status integer,
  line_request_id text,
  retry_key uuid,
  title text not null default '',
  alt_text text,
  message_count smallint not null default 1 check (message_count >= 0),
  bubble_count smallint not null default 0 check (bubble_count >= 0),
  message_text text not null default '',
  message_payload jsonb not null default '[]'::jsonb,
  response_summary text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists line_delivery_events_sent_at_idx on public.line_delivery_events (sent_at desc);
create index if not exists line_delivery_events_batch_idx on public.line_delivery_events (delivery_batch_id, sent_at desc);
create index if not exists line_delivery_events_kind_idx on public.line_delivery_events (kind, sent_at desc);
create index if not exists line_delivery_events_status_idx on public.line_delivery_events (status, sent_at desc);
create index if not exists line_delivery_events_channel_idx on public.line_delivery_events (channel, sent_at desc);
alter table public.line_delivery_events enable row level security;
revoke all on table public.line_delivery_events from anon, authenticated;
grant select, insert, update, delete on table public.line_delivery_events to service_role;
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'campussync-line-delivery-events-retention-14d';
select cron.schedule('campussync-line-delivery-events-retention-14d', '0 18 * * *',
  $cron$ delete from public.line_delivery_events where sent_at < now() - interval '14 days'; $cron$);
