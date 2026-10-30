-- 廃止済み：翌日時間割と課題期限リマインダーは16:00の日次まとめへ統合されました。
-- この旧セットアップSQLを再実行して個別配信を復活させないでください。
-- 日次配信設定は sql/setup_daily_line_digest_cron.sql を実行してください。
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'campussync-next-day-class-timetable',
  'campussync-assignment-deadline-reminder'
)
or command ilike any (array[
  '%/api/line-class-timetable%',
  '%/api/line-assignment-deadlines%'
]);
