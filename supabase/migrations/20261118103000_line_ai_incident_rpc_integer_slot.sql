drop function if exists public.begin_line_ai_group_delivery_incident(text, text, smallint, text, text, text);

create or replace function public.begin_line_ai_group_delivery_incident(
  p_chat_id text,
  p_chat_type text,
  p_bot_slot integer,
  p_incident_type text,
  p_failure_code text,
  p_failure_detail text default null
)
returns table (incident_id uuid, should_notify boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_id uuid;
begin
  if p_chat_id is null or length(p_chat_id) = 0 or length(p_chat_id) > 200 then
    raise exception 'Invalid chat id';
  end if;
  if p_chat_type not in ('group', 'room') then
    raise exception 'Invalid chat type';
  end if;
  if p_incident_type is null or length(p_incident_type) > 80 then
    raise exception 'Invalid incident type';
  end if;
  if p_bot_slot is not null and p_bot_slot not between 1 and 5 then
    raise exception 'Invalid bot slot';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_chat_id || ':' || p_incident_type));

  select i.incident_id
    into current_id
    from public.line_ai_group_delivery_incidents i
    where i.chat_id = p_chat_id
      and i.incident_type = p_incident_type
      and i.status = 'open'
    limit 1
    for update;

  if current_id is not null then
    update public.line_ai_group_delivery_incidents
      set last_seen_at = now(),
          failure_code = left(coalesce(p_failure_code, failure_code), 40),
          failure_detail = left(coalesce(p_failure_detail, failure_detail), 240)
      where line_ai_group_delivery_incidents.incident_id = current_id;
    return query select current_id, false;
    return;
  end if;

  insert into public.line_ai_group_delivery_incidents (
    chat_id, chat_type, bot_slot, incident_type, failure_code, failure_detail,
    notification_status, notification_attempted_at
  )
  values (
    p_chat_id, p_chat_type, p_bot_slot::smallint, p_incident_type,
    left(p_failure_code, 40), left(p_failure_detail, 240),
    'pending', now()
  )
  returning line_ai_group_delivery_incidents.incident_id into current_id;

  return query select current_id, true;
end;
$$;

revoke all on function public.begin_line_ai_group_delivery_incident(text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.begin_line_ai_group_delivery_incident(text, text, integer, text, text, text) to service_role;
