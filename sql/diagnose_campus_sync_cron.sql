-- CampusSync Cron diagnostic: run in Supabase SQL Editor.
-- This query does not reveal the actual CRON_SECRET value; it only checks whether a placeholder remains.

-- 1) Database timezone and extension versions
select
  current_setting('TimeZone') as database_timezone,
  (select extversion from pg_extension where extname = 'pg_cron') as pg_cron_version,
  (select extversion from pg_extension where extname = 'pg_net') as pg_net_version;

-- 2) Confirm the scheduler worker is running (no row may indicate a stopped worker).
select
  pid as process_id,
  usename as database_user,
  application_name,
  backend_start,
  state,
  backend_type
from pg_stat_activity
where application_name ilike 'pg_cron scheduler';

-- 3) Registered jobs. Do not select or share the raw command because it contains the authorization secret.
select
  jobid,
  jobname,
  schedule,
  active,
  command like '%REPLACE_WITH_CRON_SECRET%' as secret_placeholder_left,
  case
    when command like '%/api/line-train-timetable%' then 'train timetable'
    when command like '%/api/line-class-timetable%' then 'class timetable'
    when command like '%/api/line-assignment-deadlines%' then 'assignment deadline'
    when command like '%/api/push/reminders%' then 'web push reminders'
    else 'other'
  end as target
from cron.job
where jobname in (
  'campussync-hourly-train-timetable',
  'campussync-next-day-class-timetable',
  'campussync-assignment-deadline-reminder',
  'campussync-push-reminders-every-five-minutes'
)
order by jobname;

-- 4) Recent job execution results
select
  j.jobname,
  r.runid,
  r.status,
  r.return_message,
  r.start_time,
  r.end_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname in (
  'campussync-hourly-train-timetable',
  'campussync-next-day-class-timetable',
  'campussync-assignment-deadline-reminder',
  'campussync-push-reminders-every-five-minutes'
)
order by r.start_time desc
limit 40;

-- 5) Latest HTTP responses from pg_net (responses are retained for a limited time).
select
  id,
  created,
  status_code,
  timed_out,
  error_msg,
  left(content, 1000) as response_excerpt
from net._http_response
where created > now() - interval '2 days'
order by created desc
limit 40;
