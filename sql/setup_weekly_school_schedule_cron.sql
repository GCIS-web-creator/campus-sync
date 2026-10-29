-- CampusSync: 毎週日曜日の09:00 JSTに、翌月曜〜日曜の学校予定表をLINE配信
-- Supabase pg_cronはUTC: 日曜00:00 UTC = 日曜09:00 JST。
-- 5分ごとのPush Cronで使用中のSupabase Vault Secretを再利用します。
-- Vault secret name: campussync_push_reminders_cron_secret

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-weekly-school-schedule';

select cron.schedule(
  'campussync-weekly-school-schedule',
  '0 0 * * 0',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-weekly-school-schedule',
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
where jobname = 'campussync-weekly-school-schedule';

select r.jobid, r.start_time, r.end_time, r.status, r.return_message
from cron.job_run_details r
where r.jobid in (select jobid from cron.job where jobname = 'campussync-weekly-school-schedule')
order by r.start_time desc
limit 12;
