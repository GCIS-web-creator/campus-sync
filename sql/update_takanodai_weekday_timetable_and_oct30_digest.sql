-- CampusSync: 鷹の台駅・平日ダイヤ更新 + 2026-10-30 16:50の臨時配信設定
-- 対象は平日ダイヤのみ。土曜・日曜祝日の時刻表はこのSQLでは登録しません。
-- 2026-10-30 16:50 JST = 2026-10-30 07:50 UTC（pg_cronはUTC基準）
-- 16:50の1回配信後、臨時Cronは16:55に自動削除されます。
-- 10/31以降の日次まとめは従来どおり毎日16:00 JSTです。

begin;

delete from public.takanodai_timetable
where direction in ('kokubunji', 'higashimurayama');

insert into public.takanodai_timetable (direction, departure_time, service)
values
  ('kokubunji', '05:10', '各駅停車国分寺行き'),
  ('kokubunji', '05:31', '各駅停車国分寺行き'),
  ('kokubunji', '05:47', '各駅停車国分寺行き'),
  ('kokubunji', '06:02', '各駅停車国分寺行き'),
  ('kokubunji', '06:17', '各駅停車国分寺行き'),
  ('kokubunji', '06:27', '各駅停車国分寺行き'),
  ('kokubunji', '06:38', '各駅停車国分寺行き'),
  ('kokubunji', '06:48', '各駅停車国分寺行き'),
  ('kokubunji', '06:56', '各駅停車国分寺行き'),
  ('kokubunji', '07:05', '各駅停車国分寺行き'),
  ('kokubunji', '07:12', '各駅停車国分寺行き'),
  ('kokubunji', '07:20', '各駅停車国分寺行き'),
  ('kokubunji', '07:27', '各駅停車国分寺行き'),
  ('kokubunji', '07:35', '各駅停車国分寺行き'),
  ('kokubunji', '07:42', '各駅停車国分寺行き'),
  ('kokubunji', '07:51', '各駅停車国分寺行き'),
  ('kokubunji', '07:59', '各駅停車国分寺行き'),
  ('kokubunji', '08:06', '各駅停車国分寺行き'),
  ('kokubunji', '08:14', '各駅停車国分寺行き'),
  ('kokubunji', '08:21', '各駅停車国分寺行き'),
  ('kokubunji', '08:29', '各駅停車国分寺行き'),
  ('kokubunji', '08:36', '各駅停車国分寺行き'),
  ('kokubunji', '08:46', '各駅停車国分寺行き'),
  ('kokubunji', '08:54', '各駅停車国分寺行き'),
  ('kokubunji', '09:02', '各駅停車国分寺行き'),
  ('kokubunji', '09:13', '各駅停車国分寺行き'),
  ('kokubunji', '09:23', '各駅停車国分寺行き'),
  ('kokubunji', '09:33', '各駅停車国分寺行き'),
  ('kokubunji', '09:43', '各駅停車国分寺行き'),
  ('kokubunji', '09:53', '各駅停車国分寺行き'),
  ('kokubunji', '10:03', '各駅停車国分寺行き'),
  ('kokubunji', '10:13', '各駅停車国分寺行き'),
  ('kokubunji', '10:23', '各駅停車国分寺行き'),
  ('kokubunji', '10:33', '各駅停車国分寺行き'),
  ('kokubunji', '10:43', '各駅停車国分寺行き'),
  ('kokubunji', '10:53', '各駅停車国分寺行き'),
  ('kokubunji', '11:03', '各駅停車国分寺行き'),
  ('kokubunji', '11:13', '各駅停車国分寺行き'),
  ('kokubunji', '11:23', '各駅停車国分寺行き'),
  ('kokubunji', '11:33', '各駅停車国分寺行き'),
  ('kokubunji', '11:43', '各駅停車国分寺行き'),
  ('kokubunji', '11:53', '各駅停車国分寺行き'),
  ('kokubunji', '12:03', '各駅停車国分寺行き'),
  ('kokubunji', '12:13', '各駅停車国分寺行き'),
  ('kokubunji', '12:23', '各駅停車国分寺行き'),
  ('kokubunji', '12:33', '各駅停車国分寺行き'),
  ('kokubunji', '12:43', '各駅停車国分寺行き'),
  ('kokubunji', '12:53', '各駅停車国分寺行き'),
  ('kokubunji', '13:03', '各駅停車国分寺行き'),
  ('kokubunji', '13:13', '各駅停車国分寺行き'),
  ('kokubunji', '13:23', '各駅停車国分寺行き'),
  ('kokubunji', '13:33', '各駅停車国分寺行き'),
  ('kokubunji', '13:43', '各駅停車国分寺行き'),
  ('kokubunji', '13:53', '各駅停車国分寺行き'),
  ('kokubunji', '14:03', '各駅停車国分寺行き'),
  ('kokubunji', '14:13', '各駅停車国分寺行き'),
  ('kokubunji', '14:23', '各駅停車国分寺行き'),
  ('kokubunji', '14:33', '各駅停車国分寺行き'),
  ('kokubunji', '14:43', '各駅停車国分寺行き'),
  ('kokubunji', '14:53', '各駅停車国分寺行き'),
  ('kokubunji', '15:03', '各駅停車国分寺行き'),
  ('kokubunji', '15:13', '各駅停車国分寺行き'),
  ('kokubunji', '15:23', '各駅停車国分寺行き'),
  ('kokubunji', '15:33', '各駅停車国分寺行き'),
  ('kokubunji', '15:43', '各駅停車国分寺行き'),
  ('kokubunji', '15:53', '各駅停車国分寺行き'),
  ('kokubunji', '16:04', '各駅停車国分寺行き'),
  ('kokubunji', '16:14', '各駅停車国分寺行き'),
  ('kokubunji', '16:25', '各駅停車国分寺行き'),
  ('kokubunji', '16:34', '各駅停車国分寺行き'),
  ('kokubunji', '16:45', '各駅停車国分寺行き'),
  ('kokubunji', '16:55', '各駅停車国分寺行き'),
  ('kokubunji', '17:05', '各駅停車国分寺行き'),
  ('kokubunji', '17:15', '各駅停車国分寺行き'),
  ('kokubunji', '17:25', '各駅停車国分寺行き'),
  ('kokubunji', '17:35', '各駅停車国分寺行き'),
  ('kokubunji', '17:45', '各駅停車国分寺行き'),
  ('kokubunji', '17:55', '各駅停車国分寺行き'),
  ('kokubunji', '18:05', '各駅停車国分寺行き'),
  ('kokubunji', '18:15', '各駅停車国分寺行き'),
  ('kokubunji', '18:25', '各駅停車国分寺行き'),
  ('kokubunji', '18:35', '各駅停車国分寺行き'),
  ('kokubunji', '18:45', '各駅停車国分寺行き'),
  ('kokubunji', '18:55', '各駅停車国分寺行き'),
  ('kokubunji', '19:05', '各駅停車国分寺行き'),
  ('kokubunji', '19:15', '各駅停車国分寺行き'),
  ('kokubunji', '19:25', '各駅停車国分寺行き'),
  ('kokubunji', '19:35', '各駅停車国分寺行き'),
  ('kokubunji', '19:45', '各駅停車国分寺行き'),
  ('kokubunji', '19:55', '各駅停車国分寺行き'),
  ('kokubunji', '20:05', '各駅停車国分寺行き'),
  ('kokubunji', '20:15', '各駅停車国分寺行き'),
  ('kokubunji', '20:25', '各駅停車国分寺行き'),
  ('kokubunji', '20:35', '各駅停車国分寺行き'),
  ('kokubunji', '20:45', '各駅停車国分寺行き'),
  ('kokubunji', '20:55', '各駅停車国分寺行き'),
  ('kokubunji', '21:05', '各駅停車国分寺行き'),
  ('kokubunji', '21:15', '各駅停車国分寺行き'),
  ('kokubunji', '21:25', '各駅停車国分寺行き'),
  ('kokubunji', '21:36', '各駅停車国分寺行き'),
  ('kokubunji', '21:48', '各駅停車国分寺行き'),
  ('kokubunji', '22:06', '各駅停車国分寺行き'),
  ('kokubunji', '22:21', '各駅停車国分寺行き'),
  ('kokubunji', '22:37', '各駅停車国分寺行き'),
  ('kokubunji', '22:51', '各駅停車国分寺行き'),
  ('kokubunji', '23:07', '各駅停車国分寺行き'),
  ('kokubunji', '23:21', '各駅停車国分寺行き'),
  ('kokubunji', '23:36', '各駅停車国分寺行き'),
  ('kokubunji', '23:52', '各駅停車国分寺行き'),
  ('kokubunji', '00:10', '各駅停車国分寺行き'),
  ('higashimurayama', '05:25', '各駅停車東村山行き'),
  ('higashimurayama', '05:47', '各駅停車東村山行き'),
  ('higashimurayama', '06:02', '各駅停車東村山行き'),
  ('higashimurayama', '06:17', '各駅停車東村山行き'),
  ('higashimurayama', '06:33', '各駅停車東村山行き'),
  ('higashimurayama', '06:43', '各駅停車東村山行き'),
  ('higashimurayama', '06:56', '各駅停車東村山行き'),
  ('higashimurayama', '07:07', '各駅停車東村山行き'),
  ('higashimurayama', '07:12', '各駅停車東村山行き'),
  ('higashimurayama', '07:20', '各駅停車東村山行き'),
  ('higashimurayama', '07:27', '各駅停車東村山行き'),
  ('higashimurayama', '07:37', '各駅停車東村山行き'),
  ('higashimurayama', '07:44', '各駅停車東村山行き'),
  ('higashimurayama', '07:51', '各駅停車東村山行き'),
  ('higashimurayama', '07:59', '各駅停車東村山行き'),
  ('higashimurayama', '08:07', '各駅停車東村山行き'),
  ('higashimurayama', '08:14', '各駅停車東村山行き'),
  ('higashimurayama', '08:23', '各駅停車東村山行き'),
  ('higashimurayama', '08:29', '各駅停車東村山行き'),
  ('higashimurayama', '08:37', '各駅停車東村山行き'),
  ('higashimurayama', '08:45', '各駅停車東村山行き'),
  ('higashimurayama', '08:55', '各駅停車東村山行き'),
  ('higashimurayama', '09:01', '各駅停車東村山行き'),
  ('higashimurayama', '09:08', '各駅停車東村山行き'),
  ('higashimurayama', '09:18', '各駅停車東村山行き'),
  ('higashimurayama', '09:28', '各駅停車東村山行き'),
  ('higashimurayama', '09:38', '各駅停車東村山行き'),
  ('higashimurayama', '09:48', '各駅停車東村山行き'),
  ('higashimurayama', '09:58', '各駅停車東村山行き'),
  ('higashimurayama', '10:08', '各駅停車東村山行き'),
  ('higashimurayama', '10:18', '各駅停車東村山行き'),
  ('higashimurayama', '10:28', '各駅停車東村山行き'),
  ('higashimurayama', '10:38', '各駅停車東村山行き'),
  ('higashimurayama', '10:48', '各駅停車東村山行き'),
  ('higashimurayama', '10:58', '各駅停車東村山行き'),
  ('higashimurayama', '11:08', '各駅停車東村山行き'),
  ('higashimurayama', '11:18', '各駅停車東村山行き'),
  ('higashimurayama', '11:28', '各駅停車東村山行き'),
  ('higashimurayama', '11:38', '各駅停車東村山行き'),
  ('higashimurayama', '11:48', '各駅停車東村山行き'),
  ('higashimurayama', '11:58', '各駅停車東村山行き'),
  ('higashimurayama', '12:08', '各駅停車東村山行き'),
  ('higashimurayama', '12:18', '各駅停車東村山行き'),
  ('higashimurayama', '12:28', '各駅停車東村山行き'),
  ('higashimurayama', '12:38', '各駅停車東村山行き'),
  ('higashimurayama', '12:48', '各駅停車東村山行き'),
  ('higashimurayama', '12:58', '各駅停車東村山行き'),
  ('higashimurayama', '13:08', '各駅停車東村山行き'),
  ('higashimurayama', '13:18', '各駅停車東村山行き'),
  ('higashimurayama', '13:28', '各駅停車東村山行き'),
  ('higashimurayama', '13:38', '各駅停車東村山行き'),
  ('higashimurayama', '13:48', '各駅停車東村山行き'),
  ('higashimurayama', '13:58', '各駅停車東村山行き'),
  ('higashimurayama', '14:08', '各駅停車東村山行き'),
  ('higashimurayama', '14:18', '各駅停車東村山行き'),
  ('higashimurayama', '14:28', '各駅停車東村山行き'),
  ('higashimurayama', '14:38', '各駅停車東村山行き'),
  ('higashimurayama', '14:48', '各駅停車東村山行き'),
  ('higashimurayama', '14:58', '各駅停車東村山行き'),
  ('higashimurayama', '15:08', '各駅停車東村山行き'),
  ('higashimurayama', '15:18', '各駅停車東村山行き'),
  ('higashimurayama', '15:28', '各駅停車東村山行き'),
  ('higashimurayama', '15:38', '各駅停車東村山行き'),
  ('higashimurayama', '15:48', '各駅停車東村山行き'),
  ('higashimurayama', '15:58', '各駅停車東村山行き'),
  ('higashimurayama', '16:09', '各駅停車東村山行き'),
  ('higashimurayama', '16:19', '各駅停車東村山行き'),
  ('higashimurayama', '16:29', '各駅停車東村山行き'),
  ('higashimurayama', '16:39', '各駅停車東村山行き'),
  ('higashimurayama', '16:50', '各駅停車東村山行き'),
  ('higashimurayama', '17:00', '各駅停車東村山行き'),
  ('higashimurayama', '17:10', '各駅停車東村山行き'),
  ('higashimurayama', '17:20', '各駅停車東村山行き'),
  ('higashimurayama', '17:30', '各駅停車東村山行き'),
  ('higashimurayama', '17:40', '各駅停車東村山行き'),
  ('higashimurayama', '17:50', '各駅停車東村山行き'),
  ('higashimurayama', '18:00', '各駅停車東村山行き'),
  ('higashimurayama', '18:10', '各駅停車東村山行き'),
  ('higashimurayama', '18:20', '各駅停車東村山行き'),
  ('higashimurayama', '18:30', '各駅停車東村山行き'),
  ('higashimurayama', '18:40', '各駅停車東村山行き'),
  ('higashimurayama', '18:50', '各駅停車東村山行き'),
  ('higashimurayama', '19:00', '各駅停車東村山行き'),
  ('higashimurayama', '19:10', '各駅停車東村山行き'),
  ('higashimurayama', '19:20', '各駅停車東村山行き'),
  ('higashimurayama', '19:30', '各駅停車東村山行き'),
  ('higashimurayama', '19:40', '各駅停車東村山行き'),
  ('higashimurayama', '19:50', '各駅停車東村山行き'),
  ('higashimurayama', '20:00', '各駅停車東村山行き'),
  ('higashimurayama', '20:10', '各駅停車東村山行き'),
  ('higashimurayama', '20:20', '各駅停車東村山行き'),
  ('higashimurayama', '20:30', '各駅停車東村山行き'),
  ('higashimurayama', '20:40', '各駅停車東村山行き'),
  ('higashimurayama', '20:50', '各駅停車東村山行き'),
  ('higashimurayama', '21:00', '各駅停車東村山行き'),
  ('higashimurayama', '21:10', '各駅停車東村山行き'),
  ('higashimurayama', '21:20', '各駅停車東村山行き'),
  ('higashimurayama', '21:30', '各駅停車東村山行き'),
  ('higashimurayama', '21:42', '各駅停車東村山行き'),
  ('higashimurayama', '21:53', '各駅停車東村山行き'),
  ('higashimurayama', '22:06', '各駅停車東村山行き'),
  ('higashimurayama', '22:21', '各駅停車東村山行き'),
  ('higashimurayama', '22:36', '各駅停車東村山行き'),
  ('higashimurayama', '22:51', '各駅停車東村山行き'),
  ('higashimurayama', '23:06', '各駅停車東村山行き'),
  ('higashimurayama', '23:21', '各駅停車東村山行き'),
  ('higashimurayama', '23:36', '各駅停車東村山行き'),
  ('higashimurayama', '23:52', '各駅停車東村山行き'),
  ('higashimurayama', '00:10', '各駅停車東村山行き'),
  ('higashimurayama', '00:27', '各駅停車東村山行き');

commit;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 旧日次配信だけを停止。Web Push（5分ごと）と日曜09:00の週間予定表は残します。
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'campussync-hourly-train-timetable',
  'campussync-afternoon-train-timetable',
  'campussync-next-day-class-timetable',
  'campussync-assignment-deadline-reminder',
  'campussync-school-event-countdowns',
  'campussync-daily-line-digest',
  'campussync-daily-line-digest-once-20261030',
  'campussync-daily-line-digest-once-cleanup-20261030'
)
or command ilike any (array[
  '%/api/line-train-timetable%',
  '%/api/line-class-timetable%',
  '%/api/line-assignment-deadlines%',
  '%/api/line-school-event-countdowns%'
]);

-- 10/31以降の通常配信（毎日16:00 JST）。
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

-- 今日だけ16:50 JSTに臨時配信（2026-10-30 07:50 UTC）。
select cron.schedule(
  'campussync-daily-line-digest-once-20261030',
  '50 7 30 10 *',
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
      body := jsonb_build_object('source', 'daily-digest-one-time'),
      timeout_milliseconds := 25000
    );
  $cron$
);

-- 16:55 JSTに臨時ジョブ自身と、この後片付けジョブを削除する。
select cron.schedule(
  'campussync-daily-line-digest-once-cleanup-20261030',
  '55 7 30 10 *',
  $cron$
    select cron.unschedule(jobid)
    from cron.job
    where jobname in (
      'campussync-daily-line-digest-once-20261030',
      'campussync-daily-line-digest-once-cleanup-20261030'
    );
  $cron$
);

-- 設定確認。日次まとめ・臨時配信・週間予定表が確認できます。
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'campussync-daily-line-digest',
  'campussync-daily-line-digest-once-20261030',
  'campussync-daily-line-digest-once-cleanup-20261030',
  'campussync-weekly-school-schedule'
)
order by jobname;

-- 登録件数と時刻表の確認。
select direction, count(*) as departures,
       min(departure_time) as first_departure,
       max(departure_time) as last_departure
from public.takanodai_timetable
group by direction
order by direction;
