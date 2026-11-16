-- One private LINE user receives the weekday 16:00 digest failure alert and retry button.
-- line_bot_rotation is already RLS-protected and service_role-only.
alter table public.line_bot_rotation
  add column if not exists daily_digest_alert_user_id text;
comment on column public.line_bot_rotation.daily_digest_alert_user_id is
  'Single LINE user ID registered in the official-account 1:1 chat to receive private daily-digest failure alerts.';
