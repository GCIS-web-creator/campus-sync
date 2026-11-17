-- Token for ownership-safe release of the JMA weather-feed initial-sync lock.
-- Recovered from the historical jma-weather-alerts.sql source change.
alter table public.jma_weather_sync_state
  add column if not exists sync_lock_token uuid;
