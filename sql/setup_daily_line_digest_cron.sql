-- CampusSync: 平日16:00 JSTの日次LINE配信
-- pg_cronの時刻はUTC。平日07:00 UTC = 16:00 JST。
-- 日曜週間配信・BOT切替予告を含む全ジョブの一括設定には setup_line_automations_cron.sql を実行してください。

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Edge Functionの独自Cron認証とSupabase API gateway用のキーをVaultから参照する。
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'campussync_push_reminders_cron_secret'
  ) then
    raise exception 'Vault secret campussync_push_reminders_cron_secret が見つかりません。';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'campussync_supabase_publishable_key'
  ) then
    raise exception 'Vault secret campussync_supabase_publishable_key が見つかりません。';
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-daily-line-digest';

select cron.schedule(
  'campussync-daily-line-digest',
  '0 7 * * 1-5',
  $cron$
    select net.http_post(
      url := 'https://sgvhktudhxufluuaipwt.supabase.co/functions/v1/campussync-line-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'campussync_supabase_publishable_key'
        ),
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'campussync_push_reminders_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

select jobid, jobname, schedule, active
from cron.job
where jobname = 'campussync-daily-line-digest';
