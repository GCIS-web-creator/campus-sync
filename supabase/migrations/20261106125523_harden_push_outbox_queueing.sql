
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
  if p_user_id is null or p_event_key is null or p_category is null then
    return;
  end if;

  select case
    when p_category = 'cafeteria_updates' then coalesce((notification_settings ->> p_category)::boolean, false)
    else coalesce((notification_settings ->> p_category)::boolean, true)
  end
  into category_enabled
  from public.push_reminder_preferences
  where user_id = p_user_id;

  if not found then
    category_enabled := p_category <> 'cafeteria_updates';
  end if;
  if category_enabled is not true then
    return;
  end if;

  if not exists (select 1 from public.push_subscriptions s where s.user_id = p_user_id) then
    return;
  end if;

  insert into campus_private.push_notification_outbox (
    event_key, user_id, student_id, category, title, body, url, priority, tag
  )
  values (
    left(p_event_key, 240),
    p_user_id,
    coalesce(p_student_id, ''),
    p_category,
    left(coalesce(nullif(btrim(p_title), ''), 'CampusSync'), 120),
    left(coalesce(p_body, ''), 400),
    case when p_url like '/%' then left(p_url, 500) else '/' end,
    case when p_priority in ('normal', 'high', 'urgent') then p_priority else 'normal' end,
    'cs-' || left(md5(p_event_key), 24)
  )
  on conflict (event_key, user_id) do nothing;
end;
$function$;

create or replace function campus_private.queue_bus_status_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare
  recipient record;
  was_alert boolean := false;
  is_alert boolean := false;
  event_stamp text;
  message_text text;
begin
  if tg_op = 'UPDATE' then
    was_alert := old.delay_minutes >= 5
      or old.congestion_status ~* '(遅延|運休|見合わせ|遅れ|運行停止)';
    if new.delay_minutes is not distinct from old.delay_minutes
      and new.congestion_status is not distinct from old.congestion_status then
      return new;
    end if;
  end if;

  is_alert := new.delay_minutes >= 5
    or new.congestion_status ~* '(遅延|運休|見合わせ|遅れ|運行停止)';
  if not is_alert and not was_alert then
    return new;
  end if;

  event_stamp := coalesce(new.updated_at, now())::text || ':' || new.congestion_status || ':' || new.delay_minutes::text;
  message_text := coalesce(new.station_name, new.station_id) || '：' || coalesce(new.congestion_status, '運行情報更新')
    || case when new.delay_minutes > 0 then '（約' || new.delay_minutes::text || '分）' else '' end;

  for recipient in
    select distinct s.user_id, s.student_id from public.push_subscriptions s
  loop
    perform campus_private.enqueue_push_for_user(
      'bus-status:' || new.station_id || ':' || md5(event_stamp),
      recipient.user_id,
      recipient.student_id,
      'transport_alerts',
      case when is_alert then '交通・バス運行情報' else '交通情報の更新' end,
      message_text,
      '/#bus',
      case when new.delay_minutes >= 10 or new.congestion_status ~* '(運休|見合わせ|運行停止)' then 'high' else 'normal' end
    );
  end loop;

  return new;
end;
$function$;

revoke all on function campus_private.enqueue_push_for_user(text, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function campus_private.queue_bus_status_push()
  from public, anon, authenticated;
