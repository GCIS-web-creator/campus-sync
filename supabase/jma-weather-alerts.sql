-- CampusSync: 気象庁 防災気象情報XML（警報・注意報）保存先
-- Supabaseで一度だけ実行するDDL。同期処理はVercelのサーバーAPIからservice_roleで行う。

create table if not exists public.jma_weather_alert_events (
  source_id text primary key,
  feed_mode text not null check (feed_mode in ('high', 'long')),
  source_url text not null,
  product_code text,
  title text not null default '',
  headline text not null default '',
  publishing_office text,
  issued_at timestamptz,
  target_areas text[] not null default array[]::text[],
  parsed_alerts jsonb not null default '[]'::jsonb,
  raw_xml text,
  fetched_at timestamptz not null default now()
);

create table if not exists public.jma_weather_alerts (
  area_key text not null,
  area_name text not null,
  alert_key text not null,
  alert_code text,
  alert_name text not null,
  alert_family text not null,
  severity smallint not null default 0 check (severity between 0 and 5),
  status text not null,
  active boolean not null default true,
  details text,
  issued_at timestamptz,
  source_product_code text not null,
  source_id text not null,
  source_url text not null,
  updated_at timestamptz not null default now(),
  primary key (area_key, alert_key)
);

create index if not exists jma_weather_alerts_active_idx
  on public.jma_weather_alerts (active, severity desc, issued_at desc);

create table if not exists public.jma_weather_sync_state (
  id smallint primary key default 1 check (id = 1),
  high_last_success_at timestamptz,
  long_last_success_at timestamptz,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.jma_weather_sync_state (id)
values (1)
on conflict (id) do nothing;

alter table public.jma_weather_alert_events enable row level security;
alter table public.jma_weather_alerts enable row level security;
alter table public.jma_weather_sync_state enable row level security;

revoke all on table public.jma_weather_alert_events from anon, authenticated;
revoke all on table public.jma_weather_alerts from anon, authenticated;
revoke all on table public.jma_weather_sync_state from anon, authenticated;

grant select, insert, update, delete on table public.jma_weather_alert_events to service_role;
grant select, insert, update, delete on table public.jma_weather_alerts to service_role;
grant select, insert, update, delete on table public.jma_weather_sync_state to service_role;

comment on table public.jma_weather_alert_events is '気象庁PULL XMLから取得した警報・注意報関連の電文履歴';
comment on table public.jma_weather_alerts is '対象地域で現在有効な気象庁警報・注意報の状態';
comment on table public.jma_weather_sync_state is '気象庁XMLの同期状況と最終成功時刻';
