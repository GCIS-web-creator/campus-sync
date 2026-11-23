create table if not exists public.campussync_daily_digest_news (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  category text not null default 'news'
    check (category = any (array['news','notice','event','other']::text[])),
  icon text not null default '📰'
    check (char_length(icon) between 1 and 12),
  title text not null
    check (char_length(btrim(title)) between 1 and 120),
  body text not null default ''
    check (char_length(body) <= 800),
  url text null
    check (url is null or (char_length(url) <= 1000 and url ~ '^https://')),
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campussync_daily_digest_news_target_idx
  on public.campussync_daily_digest_news (target_date, created_at)
  where is_active;

alter table public.campussync_daily_digest_news enable row level security;
revoke all on public.campussync_daily_digest_news from anon, authenticated;
grant all on public.campussync_daily_digest_news to service_role;

create table if not exists public.campussync_lightning_events (
  source_id text primary key,
  city_name text not null check (city_name = any (array['小平市','国分寺市','東村山市','東大和市']::text[])),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  occurred_at timestamptz not null,
  source_properties jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  notified_at timestamptz null,
  delivery_batch_id uuid null
);

create index if not exists campussync_lightning_events_occurred_idx
  on public.campussync_lightning_events (occurred_at desc);
create index if not exists campussync_lightning_events_pending_idx
  on public.campussync_lightning_events (notified_at, occurred_at)
  where notified_at is null;

alter table public.campussync_lightning_events enable row level security;
revoke all on public.campussync_lightning_events from anon, authenticated;
grant all on public.campussync_lightning_events to service_role;
