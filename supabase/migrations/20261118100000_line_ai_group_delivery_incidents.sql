create table if not exists public.line_ai_group_delivery_incidents (
  incident_id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  chat_type text not null check (chat_type in ('group', 'room')),
  bot_slot smallint check (bot_slot is null or (bot_slot between 1 and 5)),
  incident_type text not null default 'conversation_ai',
  status text not null default 'open' check (status in ('open', 'resolved')),
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'failed')),
  failure_code text,
  failure_detail text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  notification_attempted_at timestamptz,
  notification_sent_at timestamptz,
  resolved_at timestamptz
);

create unique index if not exists line_ai_group_delivery_incidents_open_idx
  on public.line_ai_group_delivery_incidents (chat_id, incident_type)
  where status = 'open';

create index if not exists line_ai_group_delivery_incidents_recent_idx
  on public.line_ai_group_delivery_incidents (last_seen_at desc);

alter table public.line_ai_group_delivery_incidents enable row level security;
revoke all on public.line_ai_group_delivery_incidents from anon, authenticated;
grant all on public.line_ai_group_delivery_incidents to service_role;

create or replace function public.begin_line_ai_group_delivery_incident(
  p_chat_id text,
  p_chat_type text,
  p_bot_slot smallint,
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
    p_chat_id, p_chat_type, p_bot_slot, p_incident_type,
    left(p_failure_code, 40), left(p_failure_detail, 240),
    'pending', now()
  )
  returning line_ai_group_delivery_incidents.incident_id into current_id;

  return query select current_id, true;
end;
$$;

revoke all on function public.begin_line_ai_group_delivery_incident(text, text, smallint, text, text, text) from public, anon, authenticated;
grant execute on function public.begin_line_ai_group_delivery_incident(text, text, smallint, text, text, text) to service_role;

comment on table public.line_ai_group_delivery_incidents is
  'Tracks active LINE group conversation-AI delivery incidents; one notification is sent per continuous incident and the incident closes after a successful reply.';
