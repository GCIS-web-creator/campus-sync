-- CampusSync: JMA earthquake observations and LINE notification outbox
-- Apply once in the Supabase project. The scheduled calls are configured separately
-- after the matching Vercel API route has been deployed.
create table if not exists public.jma_earthquakes (
  event_key text primary key,
  latest_source_id text not null,
  latest_source_url text not null,
  product_code text not null,
  title text not null default '',
  headline text not null default '',
  issued_at timestamptz not null,
  event_time timestamptz,
  hypocenter_name text,
  latitude double precision,
  longitude double precision,
  depth_km numeric(8,2),
  magnitude numeric(4,1),
  max_intensity text,
  max_intensity_rank smallint,
  kodaira_intensity text,
  kodaira_intensity_rank smallint,
  observed_areas jsonb not null default '[]'::jsonb,
  eew_targets jsonb not null default '[]'::jsonb,
  eew_kodaira_target boolean not null default false,
  eew_forecast_intensity text,
  is_eew boolean not null default false,
  is_eew_cancelled boolean not null default false,
  is_distant boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint jma_earthquakes_max_intensity_rank_check check (max_intensity_rank is null or max_intensity_rank between 1 and 9),
  constraint jma_earthquakes_kodaira_intensity_rank_check check (kodaira_intensity_rank is null or kodaira_intensity_rank between 1 and 9),
  constraint jma_earthquakes_magnitude_check check (magnitude is null or magnitude between 0 and 10)
);
create index if not exists jma_earthquakes_event_time_idx
  on public.jma_earthquakes (event_time desc nulls last, issued_at desc);
create index if not exists jma_earthquakes_updated_at_idx
  on public.jma_earthquakes (updated_at desc);

create table if not exists public.jma_earthquake_reports (
  source_id text primary key,
  event_key text not null,
  feed_mode text not null check (feed_mode in ('high', 'long')),
  product_code text not null,
  title text not null default '',
  source_url text not null,
  issued_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index if not exists jma_earthquake_reports_event_key_idx
  on public.jma_earthquake_reports (event_key, issued_at desc);
create index if not exists jma_earthquake_reports_fetched_at_idx
  on public.jma_earthquake_reports (fetched_at desc);

create table if not exists public.jma_earthquake_notifications (
  id bigint generated always as identity primary key,
  event_key text not null,
  notification_kind text not null
    check (notification_kind in ('eew_kodaira', 'kodaira_intensity2', 'eew_cancelled')),
  payload jsonb not null,
  official_sent_at timestamptz,
  groups_sent_at timestamptz,
  official_http_status integer,
  groups_result jsonb,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_key, notification_kind)
);
create index if not exists jma_earthquake_notifications_pending_idx
  on public.jma_earthquake_notifications (created_at)
  where official_sent_at is null or groups_sent_at is null;

create table if not exists public.jma_earthquake_sync_state (
  id smallint primary key default 1 check (id = 1),
  high_last_success_at timestamptz,
  long_last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  lock_token uuid,
  lock_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.jma_earthquake_sync_state (id) values (1)
on conflict (id) do nothing;

alter table public.jma_earthquakes enable row level security;
alter table public.jma_earthquake_reports enable row level security;
alter table public.jma_earthquake_notifications enable row level security;
alter table public.jma_earthquake_sync_state enable row level security;

revoke all on public.jma_earthquakes, public.jma_earthquake_reports,
  public.jma_earthquake_notifications, public.jma_earthquake_sync_state
  from public, anon, authenticated;
grant select on public.jma_earthquakes to anon, authenticated;
grant all on public.jma_earthquakes, public.jma_earthquake_reports,
  public.jma_earthquake_notifications, public.jma_earthquake_sync_state to service_role;
grant usage, select on sequence public.jma_earthquake_notifications_id_seq to service_role;

drop policy if exists "Public earthquake information is readable" on public.jma_earthquakes;
create policy "Public earthquake information is readable"
  on public.jma_earthquakes for select to anon, authenticated using (true);

comment on table public.jma_earthquakes is
  '気象庁の地震情報。一般利用者は読み取りのみ、同期・更新はサーバーservice_role限定。';
comment on table public.jma_earthquake_reports is
  '気象庁地震XMLの電文ID記録。重複取込防止用の内部テーブル。';
comment on table public.jma_earthquake_notifications is
  '小平市向け緊急地震速報・震度2以上・EEW取消のLINE配信outbox。';
