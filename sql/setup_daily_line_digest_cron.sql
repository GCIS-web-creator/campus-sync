-- CampusSync: 毎日のLINE配信を16:00 JSTの1通に集約
-- 集約対象：鷹の台駅時刻表、翌日時間割、48時間以内の課題期限、学校行事カウントダウン
-- 日曜09:00 JSTの週間学校予定表（campussync-weekly-school-schedule）は維持します。
-- pg_cronはUTC基準：07:00 UTC = 16:00 JST。
-- 既存のPush Cronで設定済みのVault Secretを再利用します。
-- Vault secret name: campussync_push_reminders_cron_secret

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 旧時刻で動いていた日次LINE配信だけを停止。
-- 週間学校予定表やWeb Push（5分ごと）は停止しません。
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'campussync-hourly-train-timetable',
  'campussync-afternoon-train-timetable',
  'campussync-next-day-class-timetable',
  'campussync-assignment-deadline-reminder',
  'campussync-school-event-countdowns'
)
or command ilike any (array[
  '%/api/line-train-timetable%',
  '%/api/line-class-timetable%',
  '%/api/line-assignment-deadlines%',
  '%/api/line-school-event-countdowns%'
]);

-- この日次まとめジョブだけを作り直す（再実行しても重複しません）。
select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-daily-line-digest';

select cron.schedule(
  'campussync-daily-line-digest',
  '0 7 * * *',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'campussync_push_reminders_cron_secret'
        )
      ),
      body := jsonb_build_object('source', 'daily-digest'),
      timeout_milliseconds := 25000
    );
  $cron$
);

-- ここに daily digest と日曜09:00の週間予定表だけが表示されることを確認。
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'campussync-daily-line-digest',
  'campussync-weekly-school-schedule'
)
order by jobname;

-- 旧日次LINE配信ジョブが残っていないことを確認。
select jobid, jobname, schedule, active
from cron.job
where command ilike any (array[
  '%/api/line-train-timetable%',
  '%/api/line-class-timetable%',
  '%/api/line-assignment-deadlines%',
  '%/api/line-school-event-countdowns%'
]);
