-- CampusSync scheduled Push notifications and nationwide earthquake alerts.
-- Apply after the application routes are deployed. Safe to run more than once.

alter table campus_private.push_notification_outbox
  drop constraint if exists push_notification_outbox_category_check;
alter table campus_private.push_notification_outbox
  add constraint push_notification_outbox_category_check
  check (category in (
    'todo_reminders', 'chat_messages', 'school_announcements', 'transport_alerts',
    'cafeteria_updates', 'activity_updates', 'weather_alerts', 'disaster_alerts'
  ));

create or replace function campus_private.enqueue_push_for_user(
  p_event_key text,
  p_user_id uuid,
  p_student_id text,
  p_category text,
  p_title text,
  p_body text,
  p_url text default '/',
  p_priority text default 'normal'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare category_enabled boolean;
begin
  if p_user_id is null or p_event_key is null or p_category is null then return; end if;
  select coalesce((notification_settings ->> p_category)::boolean, true)
    into category_enabled
    from public.push_reminder_preferences
    where user_id = p_user_id;
  if not found then category_enabled := true; end if;
  if category_enabled is not true then return; end if;
  if not exists (select 1 from public.push_subscriptions s where s.user_id = p_user_id) then return; end if;

  insert into campus_private.push_notification_outbox (
    event_key, user_id, student_id, category, title, body, url, priority, tag
  )
  values (
    left(p_event_key, 240), p_user_id, coalesce(p_student_id, ''), p_category,
    left(coalesce(nullif(btrim(p_title), ''), 'CampusSync'), 120),
    left(coalesce(p_body, ''), 400),
    case when p_url like '/%' then left(p_url, 500) else '/' end,
    case when p_priority in ('normal', 'high', 'urgent') then p_priority else 'normal' end,
    'cs-' || left(md5(p_event_key), 24)
  )
  on conflict (event_key, user_id) do nothing;
end;
$function$;
revoke all on function campus_private.enqueue_push_for_user(text, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function campus_private.enqueue_push_for_user(text, uuid, text, text, text, text, text, text)
  to service_role;

create or replace function campus_private.queue_assignment_created_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare recipient record; due_label text; body_text text;
begin
  if new.is_active is not true then return new; end if;
  due_label := case when new.due_at is null then '期限未設定'
    else to_char(new.due_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI') end;
  body_text := '課題名：' || coalesce(new.title, '課題')
    || E'\n提出期限：' || due_label
    || case when coalesce(btrim(new.details), '') <> '' then E'\n' || left(btrim(new.details), 240) else '' end;
  for recipient in select distinct s.user_id, s.student_id from public.push_subscriptions s loop
    perform campus_private.enqueue_push_for_user(
      'assignment-created:' || new.id::text, recipient.user_id, recipient.student_id,
      'todo_reminders', '新しい課題が公開されました', body_text, '/#home', 'high'
    );
  end loop;
  return new;
end;
$function$;
drop trigger if exists campus_push_assignment_created on public.assignments;
create trigger campus_push_assignment_created
after insert on public.assignments
for each row execute function campus_private.queue_assignment_created_push();

create or replace function campus_private.queue_earthquake_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare push_title text; push_body text; push_priority text;
begin
  push_title := case
    when new.notification_kind like 'eew_cancelled%' then '緊急地震速報（解除）'
    when new.notification_kind like 'eew_%' then '緊急地震速報'
    when new.notification_kind = 'major_earthquake' then '全国で大きな地震を観測'
    when new.notification_kind = 'observed_intensity2_push' then '全国で震度2以上を観測'
    else '小平市周辺の地震情報'
  end;
  push_body := coalesce(nullif(new.payload->>'hypocenterName', ''), new.payload->>'headline', '気象庁から新しい地震情報が発表されました。');
  if new.payload->>'maxIntensity' is not null then push_body := push_body || ' 最大震度：' || new.payload->>'maxIntensity'; end if;
  if new.payload->>'kodairaIntensity' is not null then push_body := push_body || ' 小平市：' || new.payload->>'kodairaIntensity'; end if;
  push_priority := case
    when new.notification_kind like 'eew_%' or new.notification_kind = 'major_earthquake' then 'urgent'
    else 'high'
  end;
  perform campus_private.enqueue_push_for_user(
    'earthquake:' || new.event_key || ':' || new.notification_kind,
    s.user_id, s.student_id, 'disaster_alerts', push_title, push_body, '/#weather', push_priority
  ) from public.push_subscriptions s;
  return new;
end;
$function$;
drop trigger if exists campus_push_earthquake_insert on public.jma_earthquake_notifications;
create trigger campus_push_earthquake_insert
after insert on public.jma_earthquake_notifications
for each row execute function campus_private.queue_earthquake_push();

create or replace function public.push_enqueue_broadcast(
  p_event_key text,
  p_category text,
  p_title text,
  p_body text,
  p_url text default '/',
  p_priority text default 'normal'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare recipient record; recipient_count integer := 0;
begin
  if p_category not in (
    'todo_reminders', 'chat_messages', 'school_announcements', 'transport_alerts',
    'cafeteria_updates', 'activity_updates', 'weather_alerts', 'disaster_alerts'
  ) then raise exception 'Unsupported push notification category'; end if;
  for recipient in select distinct s.user_id, s.student_id from public.push_subscriptions s loop
    perform campus_private.enqueue_push_for_user(
      p_event_key, recipient.user_id, recipient.student_id,
      p_category, p_title, p_body, p_url, p_priority
    );
    recipient_count := recipient_count + 1;
  end loop;
  return recipient_count;
end;
$function$;
revoke all on function public.push_enqueue_broadcast(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.push_enqueue_broadcast(text, text, text, text, text, text)
  to service_role;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'campussync_push_daily_briefing_url') then
    perform vault.create_secret('https://campus-sync-mocha.vercel.app/api/push/daily-briefing', 'campussync_push_daily_briefing_url');
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'campussync_push_train_departure_url') then
    perform vault.create_secret('https://campus-sync-mocha.vercel.app/api/push/train-departure', 'campussync_push_train_departure_url');
  end if;
end
$$;

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'campussync-push-daily-briefing-every-day',
  'campussync-push-train-kokubunji-1604',
  'campussync-push-dispatch-every-minute',
  'campussync-push-dispatch-every-ten-seconds'
);

select cron.schedule(
  'campussync-push-daily-briefing-every-day',
  '0 22 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_daily_briefing_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'requested_at', now()),
      timeout_milliseconds := 25000
    );
  $job$
);

select cron.schedule(
  'campussync-push-train-kokubunji-1604',
  '49 6 * * 1-5',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_train_departure_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'requested_at', now()),
      timeout_milliseconds := 15000
    );
  $job$
);

select cron.schedule(
  'campussync-push-dispatch-every-ten-seconds',
  '10 seconds',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'campussync_push_reminders_cron_secret')
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'requested_at', now()),
      timeout_milliseconds := 9000
    );
  $job$
);
