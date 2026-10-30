-- 廃止済み：学校行事カウントダウンは16:00の日次まとめへ統合されました。
-- この旧セットアップSQLを再実行して個別配信を復活させないでください。
-- 日次配信設定は sql/setup_daily_line_digest_cron.sql を実行してください。
select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-school-event-countdowns'
   or command ilike '%/api/line-school-event-countdowns%';
