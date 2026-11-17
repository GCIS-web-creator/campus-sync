
alter table public.jma_weather_alert_events
  add column if not exists notification_payload jsonb,
  add column if not exists official_sent_at timestamptz,
  add column if not exists groups_sent_at timestamptz,
  add column if not exists official_http_status integer,
  add column if not exists groups_result jsonb,
  add column if not exists notification_last_error text,
  add column if not exists notification_last_attempt_at timestamptz;

create index if not exists jma_weather_alert_events_pending_notifications_idx
  on public.jma_weather_alert_events (fetched_at)
  where notification_payload is not null
    and (official_sent_at is null or groups_sent_at is null);

comment on column public.jma_weather_alert_events.notification_payload is
  '小平市の新規警報・特別警報を配信するためのLINE通知 outbox payload。注意報は保存しない。';
comment on column public.jma_weather_alert_events.official_sent_at is
  'LINE公式アカウントへの警報通知を受理した時刻。';
comment on column public.jma_weather_alert_events.groups_sent_at is
  '登録済みLINEグループへの警報通知を完了した時刻。';
