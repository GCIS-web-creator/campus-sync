-- CampusSync: 翌日の7組・8組時間割を毎日21:00（日本時間）にLINE配信
-- Supabaseの標準UTCタイムゾーンを前提に、12:00 UTC = 21:00 JSTでスケジュールします。
-- 5分おきのPush Cronで認証成功しているSupabase VaultのSecretを再利用します。
-- VercelのCRON_SECRETを再表示したり、秘密値をSQLへ直接書いたりする必要はありません。
-- Vault secret name: campussync_push_reminders_cron_secret

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname in ('campussync-next-day-class-timetable', 'campussync-assignment-deadline-reminder');

select cron.schedule(
  'campussync-next-day-class-timetable',
  '0 12 * * *',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-class-timetable',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$
);

select cron.schedule(
  'campussync-assignment-deadline-reminder',
  '0 12 * * *',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-assignment-deadlines',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$
);

select jobid, jobname, schedule, active
from cron.job
where jobname in ('campussync-next-day-class-timetable', 'campussync-assignment-deadline-reminder');

-- 実行結果の確認
select r.jobid, r.start_time, r.end_time, r.status, r.return_message
from cron.job_run_details r
where r.jobid in (
  select jobid from cron.job
  where jobname in ('campussync-next-day-class-timetable', 'campussync-assignment-deadline-reminder')
)
order by r.start_time desc
limit 10;

select id, created, status_code, timed_out, error_msg
from net._http_response
order by created desc
limit 10;
