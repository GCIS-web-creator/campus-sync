-- CampusSync: Supabase pg_cronから鷹の台駅の時刻表を毎時00分にLINE配信
-- Vercel HobbyのCronは毎時実行に対応していないため、Supabase側で実行します。
-- 5分おきのPush Cronですでに認証成功しているSupabase VaultのSecretを再利用します。
-- VercelのCRON_SECRETを見直したり、SQLへ秘密値を直接書いたりする必要はありません。
-- Vault secret name: campussync_push_reminders_cron_secret
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'campussync-hourly-train-timetable';
select cron.schedule(
  'campussync-hourly-train-timetable',
  '0 * * * *',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-train-timetable',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$
);
select jobid, jobname, schedule, active from cron.job where jobname = 'campussync-hourly-train-timetable';
select r.jobid, r.start_time, r.end_time, r.status, r.return_message
from cron.job_run_details r
where r.jobid in (select jobid from cron.job where jobname = 'campussync-hourly-train-timetable')
order by r.start_time desc limit 12;
select id, created, status_code, timed_out, error_msg from net._http_response order by created desc limit 20;
