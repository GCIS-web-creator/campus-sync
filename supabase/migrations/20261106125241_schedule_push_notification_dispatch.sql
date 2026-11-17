-- Run after app/api/push/dispatch/route.ts is deployed.
-- Reuses the same CRON_SECRET already stored in Vault for the reminder endpoint.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'campussync_push_dispatch_url') then
    perform vault.create_secret(
      'https://campus-sync-mocha.vercel.app/api/push/dispatch',
      'campussync_push_dispatch_url'
    );
  end if;
end
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-push-dispatch-every-minute';

select cron.schedule(
  'campussync-push-dispatch-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'requested_at', now()),
      timeout_milliseconds := 15000
    ) as request_id;
  $job$
);
