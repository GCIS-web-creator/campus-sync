-- CampusSync: 平日16:00 JSTの日次LINE配信
-- 月〜木：時刻表・天気・7組・8組・学校行事。金：時刻表・天気・学校行事。
-- 日曜週間配信・BOT切替予告を含む全ジョブの一括設定には setup_line_automations_cron.sql を実行してください。

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname='campussync-daily-line-digest';

select cron.schedule(
  'campussync-daily-line-digest',
  '0 7 * * 1-5',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-daily-digest',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name='campussync_push_reminders_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $cron$
);

select jobid,jobname,schedule,active
from cron.job
where jobname='campussync-daily-line-digest';
