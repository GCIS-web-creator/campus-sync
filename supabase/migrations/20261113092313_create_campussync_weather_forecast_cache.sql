
create table if not exists public.campussync_weather_forecast_cache (
  cache_key text primary key,
  forecast jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.campussync_weather_forecast_cache enable row level security;
revoke all on table public.campussync_weather_forecast_cache from anon, authenticated;
grant select, insert, update on table public.campussync_weather_forecast_cache to service_role;
