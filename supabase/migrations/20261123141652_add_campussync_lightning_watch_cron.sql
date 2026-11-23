create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

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
where jobname = 'campussync-lightning-watch';

select cron.schedule(
  'campussync-lightning-watch',
  '*/10 21-23,0-10 * * *',
  $cron$
    select net.http_post(
      url := 'https://sgvhktudhxufluuaipwt.supabase.co/functions/v1/campussync-cron?task=lightning-watch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'campussync_supabase_publishable_key'
        ),
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'campussync_push_reminders_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
