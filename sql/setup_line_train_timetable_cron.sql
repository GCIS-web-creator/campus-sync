-- 廃止済み：鷹の台駅時刻表は16:00の日次まとめへ統合されました。
-- この旧セットアップSQLを再実行して個別配信を復活させないでください。
-- 日次配信設定は sql/setup_daily_line_digest_cron.sql を実行してください。
select cron.unschedule(jobid)
from cron.job
where jobname in ('campussync-hourly-train-timetable', 'campussync-afternoon-train-timetable')
   or command ilike '%/api/line-train-timetable%';
