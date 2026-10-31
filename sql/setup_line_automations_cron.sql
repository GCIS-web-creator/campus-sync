-- CampusSync LINE定期配信Cron（統合設定）
-- pg_cronの時刻はUTC。日本時間(JST)はUTC+9。
-- 月〜金 16:00 JST: 電車時刻表・明日の天気・学校行事カウントダウン。
-- 月〜木のみ、翌日の7組・8組時間割も同じFlexカルーセルに含めます。
-- 日曜 09:00 JST: 翌週の学校スケジュール＋月曜日の7組・8組時間割。
-- 毎日 21:00 JST: 翌日がBOT切替日の場合だけ、現在BOTの友だちへ予告（グループ配信なし）。
-- Vault Secret: campussync_push_reminders_cron_secret（既存Push Cronと共通）

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Vault Secretが未登録なら、スケジュールを作らず明示的に停止。
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'campussync_push_reminders_cron_secret'
  ) then
    raise exception 'Vault secret campussync_push_reminders_cron_secret が見つかりません。先に既存のPush Cron用Secretを登録してください。';
  end if;
end;
$$;

-- 統合配信へ置き換える旧「時刻表・時間割・行事カウントダウン」Cronのみ停止。
-- 課題期限通知とWeb Push Cronは停止しません。
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'campussync-hourly-train-timetable',
  'campussync-afternoon-train-timetable',
  'campussync-next-day-class-timetable',
  'campussync-school-event-countdowns'
)
or command ilike any (array[
  '%/api/line-train-timetable%',
  '%/api/line-class-timetable%',
  '%/api/line-school-event-countdowns%'
]);

-- 対象の3ジョブを同じ定義で作り直す。
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'campussync-daily-line-digest',
  'campussync-weekly-school-schedule',
  'campussync-bot-switch-reminder'
);

-- 平日16:00 JST = 月〜金 07:00 UTC
select cron.schedule(
  'campussync-daily-line-digest',
  '0 7 * * 1-5',
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
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $cron$
);

-- 日曜09:00 JST = 日曜00:00 UTC
select cron.schedule(
  'campussync-weekly-school-schedule',
  '0 0 * * 0',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-weekly-school-schedule',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'campussync_push_reminders_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $cron$
);

-- 毎日21:00 JST = 毎日12:00 UTC。API側で翌日が実際の切替日か確認します。
select cron.schedule(
  'campussync-bot-switch-reminder',
  '0 12 * * *',
  $cron$
    select net.http_post(
      url := 'https://campus-sync-mocha.vercel.app/api/line-bot-switch-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'campussync_push_reminders_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $cron$
);

-- 3つのジョブが登録されていることを確認。
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'campussync-daily-line-digest',
  'campussync-weekly-school-schedule',
  'campussync-bot-switch-reminder'
)
order by jobname;

-- 直近の実行履歴（初回実行前は0件です）。
select r.jobid, j.jobname, r.start_time, r.end_time, r.status, r.return_message
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname in (
  'campussync-daily-line-digest',
  'campussync-weekly-school-schedule',
  'campussync-bot-switch-reminder'
)
order by r.start_time desc
limit 15;
