-- CampusSync Web Push delivery pipeline.
-- Applied to project sgvhktudhxufluuaipwt on 2026-11-06.
-- This file is the repeatable source copy of the database objects.

begin;

alter table public.notifications
  add column if not exists category text not null default 'general',
  add column if not exists priority text not null default 'normal',
  add column if not exists is_pinned boolean not null default false,
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists expires_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_category_check,
  drop constraint if exists notifications_priority_check;
alter table public.notifications
  add constraint notifications_category_check
    check (category in ('general', 'school_closure', 'class_change', 'early_dismissal', 'disaster', 'emergency')),
  add constraint notifications_priority_check
    check (priority in ('normal', 'important', 'emergency'));

create index if not exists notifications_target_created_idx
  on public.notifications (target_user_id, created_at desc);

alter table public.push_subscriptions
  add column if not exists device_name text,
  add column if not exists user_agent text,
  add column if not exists last_seen_at timestamptz;

alter table public.push_reminder_preferences
  alter column notification_settings set default
    '{"todo_reminders":true,"chat_messages":true,"school_announcements":true,"transport_alerts":true,"cafeteria_updates":false,"activity_updates":true,"weather_alerts":true,"disaster_alerts":true}'::jsonb;

update public.push_reminder_preferences
set notification_settings =
  '{"todo_reminders":true,"chat_messages":true,"school_announcements":true,"transport_alerts":true,"cafeteria_updates":false,"activity_updates":true,"weather_alerts":true,"disaster_alerts":true}'::jsonb
  || coalesce(notification_settings, '{}'::jsonb);

create schema if not exists campus_private;
revoke all on schema campus_private from public, anon, authenticated;
grant usage on schema campus_private to service_role;

create table if not exists campus_private.push_notification_outbox (
  id bigint generated always as identity primary key,
  event_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null,
  category text not null check (category in (
    'chat_messages', 'school_announcements', 'transport_alerts',
    'cafeteria_updates', 'activity_updates', 'weather_alerts', 'disaster_alerts'
  )),
  title text not null,
  body text not null default '',
  url text not null default '/',
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  tag text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (event_key, user_id)
);

create index if not exists push_notification_outbox_pending_idx
  on campus_private.push_notification_outbox (available_at, priority, created_at)
  where status in ('pending', 'processing');

revoke all on campus_private.push_notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on campus_private.push_notification_outbox to service_role;
grant usage, select on sequence campus_private.push_notification_outbox_id_seq to service_role;

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
declare
  category_enabled boolean;
begin
  if p_user_id is null or p_event_key is null or p_category is null then return; end if;

  select case
    when p_category = 'cafeteria_updates' then coalesce((notification_settings ->> p_category)::boolean, false)
    else coalesce((notification_settings ->> p_category)::boolean, true)
  end
  into category_enabled
  from public.push_reminder_preferences
  where user_id = p_user_id;

  if not found then category_enabled := p_category <> 'cafeteria_updates'; end if;
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

create or replace function campus_private.queue_class_chat_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare recipient record; preview text;
begin
  preview := nullif(btrim(new.body), '');
  if preview is null then
    preview := case when new.attachment_name is not null then '添付ファイルが届きました。' else '新しいメッセージがあります。' end;
  end if;
  for recipient in
    select distinct p.auth_user_id, p.student_id
    from public.profiles p
    where p.auth_user_id is not null and p.auth_user_id <> new.user_id and p.user_class = new.class_name
  loop
    perform campus_private.enqueue_push_for_user(
      'class-chat:' || new.id::text, recipient.auth_user_id, recipient.student_id::text,
      'chat_messages', new.class_name || ' の新着メッセージ',
      coalesce(nullif(btrim(new.student_name), ''), 'クラスメイト') || '：' || left(preview, 150),
      '/#chat', 'normal'
    );
  end loop;
  return new;
end;
$function$;
drop trigger if exists campus_push_class_chat_insert on public.class_chat_messages;
create trigger campus_push_class_chat_insert
after insert on public.class_chat_messages
for each row execute function campus_private.queue_class_chat_push();

create or replace function campus_private.queue_school_chat_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare recipient record; preview text; scope_title text;
begin
  preview := nullif(btrim(new.body), '');
  if preview is null then
    preview := case when new.attachment_name is not null then '添付ファイルが届きました。' else '新しいメッセージがあります。' end;
  end if;
  scope_title := case when new.scope = 'grade' then new.scope_key || '年生' else '全校' end;
  for recipient in
    select distinct p.auth_user_id, p.student_id
    from public.profiles p
    where p.auth_user_id is not null and p.auth_user_id <> new.user_id
      and (new.scope = 'school' or (new.scope = 'grade' and split_part(p.user_class, '-', 1) = new.scope_key))
  loop
    perform campus_private.enqueue_push_for_user(
      'school-chat:' || new.id::text, recipient.auth_user_id, recipient.student_id::text,
      'chat_messages', scope_title || 'チャットの新着メッセージ',
      coalesce(nullif(btrim(new.student_name), ''), '生徒') || '：' || left(preview, 150),
      '/#chat', 'normal'
    );
  end loop;
  return new;
end;
$function$;
drop trigger if exists campus_push_school_chat_insert on public.school_chat_messages;
create trigger campus_push_school_chat_insert
after insert on public.school_chat_messages
for each row execute function campus_private.queue_school_chat_push();

create or replace function campus_private.queue_school_notice_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare recipient record; push_category text; push_priority text;
begin
  push_category := case when new.category in ('disaster', 'emergency') then 'disaster_alerts' else 'school_announcements' end;
  push_priority := case when new.priority = 'emergency' then 'urgent' when new.priority = 'important' then 'high' else 'normal' end;
  for recipient in
    select distinct s.user_id, s.student_id from public.push_subscriptions s
    where new.target_user_id is null or s.user_id = new.target_user_id
  loop
    perform campus_private.enqueue_push_for_user(
      'school-notice:' || new.id::text, recipient.user_id, recipient.student_id,
      push_category,
      case when push_priority = 'urgent' then '緊急連絡｜' else '' end || new.title,
      new.body, '/#notifications', push_priority
    );
  end loop;
  return new;
end;
$function$;
drop trigger if exists campus_push_school_notice_insert on public.notifications;
create trigger campus_push_school_notice_insert
after insert on public.notifications
for each row execute function campus_private.queue_school_notice_push();

create or replace function campus_private.queue_bus_status_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare recipient record; was_alert boolean := false; is_alert boolean := false; event_stamp text; message_text text;
begin
  if tg_op = 'UPDATE' then
    was_alert := old.delay_minutes >= 5 or old.congestion_status ~* '(遅延|運休|見合わせ|遅れ|運行停止)';
    if new.delay_minutes is not distinct from old.delay_minutes
      and new.congestion_status is not distinct from old.congestion_status then return new; end if;
  end if;
  is_alert := new.delay_minutes >= 5 or new.congestion_status ~* '(遅延|運休|見合わせ|遅れ|運行停止)';
  if not is_alert and not was_alert then return new; end if;
  event_stamp := coalesce(new.updated_at, now())::text || ':' || new.congestion_status || ':' || new.delay_minutes::text;
  message_text := coalesce(new.station_name, new.station_id) || '：' || coalesce(new.congestion_status, '運行情報更新')
    || case when new.delay_minutes > 0 then '（約' || new.delay_minutes::text || '分）' else '' end;
  for recipient in select distinct s.user_id, s.student_id from public.push_subscriptions s
  loop
    perform campus_private.enqueue_push_for_user(
      'bus-status:' || new.station_id || ':' || md5(event_stamp),
      recipient.user_id, recipient.student_id, 'transport_alerts',
      case when is_alert then '交通・バス運行情報' else '交通情報の更新' end,
      message_text, '/#bus',
      case when new.delay_minutes >= 10 or new.congestion_status ~* '(運休|見合わせ|運行停止)' then 'high' else 'normal' end
    );
  end loop;
  return new;
end;
$function$;
drop trigger if exists campus_push_bus_status_change on public.bus_status;
create trigger campus_push_bus_status_change
after insert or update on public.bus_status
for each row execute function campus_private.queue_bus_status_push();

create or replace function campus_private.queue_cafeteria_sold_out_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare was_sold_out boolean := false;
begin
  if tg_op = 'UPDATE' then was_sold_out := old.is_sold_out; end if;
  if new.is_sold_out is distinct from true or was_sold_out then return new; end if;
  perform campus_private.enqueue_push_for_user(
    'cafeteria-sold-out:' || new.menu_id || ':' || coalesce(new.updated_at, now())::text,
    s.user_id, s.student_id, 'cafeteria_updates', '学食の売切情報',
    '本日の学食メニューに売切情報が追加されました。', '/#food', 'normal'
  ) from public.push_subscriptions s;
  return new;
end;
$function$;
drop trigger if exists campus_push_cafeteria_sold_out on public.cafeteria_sold_out;
create trigger campus_push_cafeteria_sold_out
after insert or update of is_sold_out on public.cafeteria_sold_out
for each row execute function campus_private.queue_cafeteria_sold_out_push();

create or replace function campus_private.queue_cafeteria_announcement_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
begin
  if coalesce(btrim(new.message), '') = '' or not (new.show_banner or new.show_popup) then return new; end if;
  if tg_op = 'UPDATE' and new.message is not distinct from old.message then return new; end if;
  perform campus_private.enqueue_push_for_user(
    'cafeteria-announcement:' || new.id::text || ':' || md5(new.message || coalesce(new.updated_at, now())::text),
    s.user_id, s.student_id, 'cafeteria_updates', '学食からのお知らせ',
    left(new.message, 300), '/#food', 'normal'
  ) from public.push_subscriptions s;
  return new;
end;
$function$;
drop trigger if exists campus_push_cafeteria_announcement on public.cafeteria_announcements;
create trigger campus_push_cafeteria_announcement
after insert or update on public.cafeteria_announcements
for each row execute function campus_private.queue_cafeteria_announcement_push();

create or replace function campus_private.queue_club_note_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare recipient record;
begin
  for recipient in
    select distinct s.user_id, s.student_id from public.push_subscriptions s
    where new.author_user_id is null or s.user_id <> new.author_user_id
  loop
    perform campus_private.enqueue_push_for_user(
      'club-note:' || new.id::text, recipient.user_id, recipient.student_id,
      'activity_updates', coalesce(nullif(btrim(new.club_name), ''), '校内活動') || 'の新着投稿',
      left(coalesce(new.title, '') || case when coalesce(new.content, '') <> '' then '：' || new.content else '' end, 300),
      '/#club', 'normal'
    );
  end loop;
  return new;
end;
$function$;
drop trigger if exists campus_push_club_note_insert on public.club_notes;
create trigger campus_push_club_note_insert
after insert on public.club_notes
for each row execute function campus_private.queue_club_note_push();

create or replace function campus_private.queue_earthquake_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare push_title text; push_body text;
begin
  push_title := case
    when new.notification_kind = 'major_earthquake' then '全国で大きな地震を観測'
    when new.notification_kind like 'eew_%' then '緊急地震速報'
    else '小平市周辺の地震情報'
  end;
  push_body := coalesce(nullif(new.payload->>'hypocenterName', ''), new.payload->>'headline', '気象庁から新しい地震情報が発表されました。');
  if new.payload->>'maxIntensity' is not null then push_body := push_body || ' 最大震度：' || new.payload->>'maxIntensity'; end if;
  if new.payload->>'kodairaIntensity' is not null then push_body := push_body || ' 小平市：' || new.payload->>'kodairaIntensity'; end if;
  perform campus_private.enqueue_push_for_user(
    'earthquake:' || new.event_key || ':' || new.notification_kind,
    s.user_id, s.student_id, 'disaster_alerts', push_title, push_body, '/#weather', 'urgent'
  ) from public.push_subscriptions s;
  return new;
end;
$function$;
drop trigger if exists campus_push_earthquake_insert on public.jma_earthquake_notifications;
create trigger campus_push_earthquake_insert
after insert on public.jma_earthquake_notifications
for each row execute function campus_private.queue_earthquake_push();

create or replace function campus_private.queue_weather_alert_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare push_title text; push_body text; severity_value integer;
begin
  if new.notification_payload is null then return new; end if;
  if tg_op = 'UPDATE' and new.notification_payload is not distinct from old.notification_payload then return new; end if;
  severity_value := coalesce((new.notification_payload->>'severity')::integer, 3);
  if severity_value < 3 then return new; end if;
  push_title := coalesce(new.notification_payload->>'areaName', '小平市') || 'に気象警報';
  select string_agg(coalesce(alert->>'name', '警報'), '・') into push_body
  from jsonb_array_elements(coalesce(new.notification_payload->'alerts', '[]'::jsonb)) as alert;
  push_body := coalesce(nullif(push_body, ''), '気象庁から警報が発表されました。');
  perform campus_private.enqueue_push_for_user(
    'weather-alert:' || new.source_id,
    s.user_id, s.student_id, 'weather_alerts', push_title, push_body, '/#weather',
    case when severity_value >= 5 then 'urgent' else 'high' end
  ) from public.push_subscriptions s;
  return new;
end;
$function$;
drop trigger if exists campus_push_weather_alert_insert on public.jma_weather_alert_events;
create trigger campus_push_weather_alert_insert
after insert or update of notification_payload on public.jma_weather_alert_events
for each row execute function campus_private.queue_weather_alert_push();

create or replace function public.push_claim_notifications(p_limit integer default 50)
returns table (
  id bigint, user_id uuid, student_id text, category text, title text,
  body text, url text, priority text, tag text, attempts integer
)
language sql
security invoker
set search_path = pg_catalog, campus_private
as $function$
  with candidates as (
    select o.id
    from campus_private.push_notification_outbox o
    where (
      o.status = 'pending'
      or (o.status = 'processing' and o.locked_at < now() - interval '5 minutes')
    ) and o.available_at <= now()
    order by case o.priority when 'urgent' then 0 when 'high' then 1 else 2 end, o.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ),
  claimed as (
    update campus_private.push_notification_outbox o
    set status = 'processing', locked_at = now(), attempts = o.attempts + 1
    from candidates c
    where o.id = c.id
    returning o.id, o.user_id, o.student_id, o.category, o.title, o.body, o.url, o.priority, o.tag, o.attempts
  )
  select * from claimed;
$function$;

create or replace function public.push_finish_notification(p_id bigint, p_outcome text, p_error text default null)
returns void
language sql
security invoker
set search_path = pg_catalog, campus_private
as $function$
  update campus_private.push_notification_outbox o
  set status = case
        when p_outcome = 'sent' then 'sent'
        when p_outcome = 'skipped' then 'skipped'
        when o.attempts >= 5 then 'dead'
        else 'pending'
      end,
      sent_at = case when p_outcome = 'sent' then now() else o.sent_at end,
      last_error = case when p_outcome in ('sent', 'skipped') then null else left(coalesce(p_error, 'Push delivery failed'), 1000) end,
      available_at = case
        when p_outcome in ('sent', 'skipped') then o.available_at
        else now() + case when o.attempts <= 1 then interval '1 minute'
          when o.attempts = 2 then interval '5 minutes' else interval '20 minutes' end
      end,
      locked_at = null
  where o.id = p_id;
$function$;

create or replace function public.push_release_notification(p_id bigint, p_available_at timestamptz)
returns void
language sql
security invoker
set search_path = pg_catalog, campus_private
as $function$
  update campus_private.push_notification_outbox o
  set status = 'pending',
      attempts = greatest(o.attempts - 1, 0),
      available_at = greatest(coalesce(p_available_at, now() + interval '1 minute'), now() + interval '1 minute'),
      locked_at = null
  where o.id = p_id;
$function$;

revoke all on function public.push_claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.push_finish_notification(bigint, text, text) from public, anon, authenticated;
revoke all on function public.push_release_notification(bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.push_claim_notifications(integer) to service_role;
grant execute on function public.push_finish_notification(bigint, text, text) to service_role;
grant execute on function public.push_release_notification(bigint, timestamptz) to service_role;
-- Public notices remain readable, but targeted notices are visible only to their owner.
alter table public.notifications enable row level security;
drop policy if exists public_read_notifications on public.notifications;
drop policy if exists public_insert_notifications on public.notifications;
drop policy if exists school_notifications_read_target on public.notifications;
create policy school_notifications_read_target
  on public.notifications for select to anon, authenticated
  using (target_user_id is null or target_user_id = (select auth.uid()));
grant select on public.notifications to anon, authenticated, service_role;
revoke insert, update, delete on public.notifications from public, anon, authenticated;
grant insert, update, delete on public.notifications to service_role;

grant usage on schema campus_private to service_role;

commit;
