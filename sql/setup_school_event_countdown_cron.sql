-- CampusSync: 毎日12:00 JSTにカウントダウン対象イベントをLINE配信
-- Supabase pg_cronはUTCで設定するため、03:00 UTC = 12:00 JSTです。
-- 既存のPush Cronで利用しているVault Secretを再利用します。
-- Vault secret name: campussync_push_reminders_cron_secret

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-school-event-countdowns';

select cron.schedule(
  'campussync-school-event-countdowns',
  '0 3 * * *',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-school-event-countdowns',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cron$
);

select jobid, jobname, schedule, active
from cron.job
where jobname = 'campussync-school-event-countdowns';

select r.jobid, r.start_time, r.end_time, r.status, r.return_message
from cron.job_run_details r
where r.jobid in (select jobid from cron.job where jobname = 'campussync-school-event-countdowns')
order by r.start_time desc
limit 12;
