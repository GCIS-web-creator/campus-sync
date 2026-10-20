-- Run this only AFTER:
-- 1. deploying the app with app/api/push/reminders/route.ts,
-- 2. adding CRON_SECRET in Vercel environment variables,
-- 3. storing the same URL and secret in Supabase Vault.
-- Replace the placeholders and run once.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace the first placeholder with your deployed endpoint URL.
select vault.create_secret(
  'https://campus-sync-mocha.vercel.app/api/push/reminders',
  'campussync_push_reminders_url'
);

-- Replace the second placeholder with the exact same value as Vercel's CRON_SECRET.
-- Keep this value private. Do not commit this SQL file after replacing the placeholder.
select vault.create_secret(
  'REPLACE_WITH_THE_SAME_CRON_SECRET_CONFIGURED_IN_VERCEL',
  'campussync_push_reminders_cron_secret'
);

select cron.schedule(
  'campussync-push-reminders-every-five-minutes',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'requested_at', now()),
      timeout_milliseconds := 10000
    ) as request_id;
  $$
);
