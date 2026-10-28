-- CampusSync: 鷹の台駅の時刻表を毎時00分にLINE Flex Messageで配信
-- 実行前に次の2か所を置換してください:
-- 1) YOUR-DEPLOYMENT.vercel.app -> 実際に公開しているVercelドメイン
-- 2) REPLACE_WITH_CRON_SECRET -> Vercel環境変数CRON_SECRETと同じ値
-- 秘密値をGitHubに保存したくない場合は、このSQLをSupabase SQL Editorで直接編集してから実行してください。

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-hourly-train-timetable';

select cron.schedule(
  'campussync-hourly-train-timetable',
  '0 * * * *',
  $cron$
    select net.http_post(
      url := 'https://YOUR-DEPLOYMENT.vercel.app/api/line-train-timetable',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer REPLACE_WITH_CRON_SECRET'
      ),
      body := '{}'::jsonb
    );
  $cron$
);

-- 登録確認:
select jobid, jobname, schedule, active
from cron.job
where jobname = 'campussync-hourly-train-timetable';
