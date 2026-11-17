-- Store short-lived conversational context for LINE group AI.
-- Only service_role can access this table or consume the per-group daily budget.
create table if not exists public.line_ai_group_conversations (
  chat_id text primary key check (length(chat_id) between 1 and 200),
  chat_type text not null check (chat_type in ('group', 'room')),
  bot_slot smallint not null check (bot_slot between 0 and 5),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  usage_date date not null default ((now() at time zone 'Asia/Tokyo')::date),
  daily_requests integer not null default 0 check (daily_requests >= 0),
  last_request_at timestamptz,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

comment on table public.line_ai_group_conversations is
  'Temporary LINE group AI conversation context. Stores only the latest three exchanges and expires after 24 hours.';

alter table public.line_ai_group_conversations enable row level security;
revoke all on table public.line_ai_group_conversations from public, anon, authenticated;
grant select, insert, update, delete on table public.line_ai_group_conversations to service_role;

create index if not exists line_ai_group_conversations_expires_idx
  on public.line_ai_group_conversations (expires_at);

create or replace function public.consume_line_ai_group_request(
  p_chat_id text,
  p_chat_type text,
  p_bot_slot smallint,
  p_daily_limit integer default 100,
  p_min_interval_seconds integer default 5
)
returns table(allowed boolean, daily_requests integer, reason text)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Tokyo')::date;
  v_row public.line_ai_group_conversations%rowtype;
begin
  if p_chat_id is null or length(p_chat_id) < 1 or length(p_chat_id) > 200
     or p_chat_type not in ('group', 'room')
     or p_bot_slot is null or p_bot_slot < 0 or p_bot_slot > 5 then
    return query select false, 0, 'invalid_request'::text;
    return;
  end if;

  insert into public.line_ai_group_conversations (
    chat_id, chat_type, bot_slot, messages, usage_date, daily_requests, updated_at, expires_at
  )
  values (
    p_chat_id, p_chat_type, p_bot_slot, '[]'::jsonb, v_today, 0, pg_catalog.now(), pg_catalog.now() + interval '24 hours'
  )
  on conflict (chat_id) do nothing;

  select * into v_row
  from public.line_ai_group_conversations
  where chat_id = p_chat_id
  for update;

  if v_row.usage_date <> v_today then
    update public.line_ai_group_conversations
    set usage_date = v_today, daily_requests = 0, messages = '[]'::jsonb
    where chat_id = p_chat_id;
    v_row.daily_requests := 0;
    v_row.last_request_at := null;
  end if;

  if v_row.expires_at <= pg_catalog.now() then
    update public.line_ai_group_conversations
    set messages = '[]'::jsonb
    where chat_id = p_chat_id;
    v_row.messages := '[]'::jsonb;
  end if;

  if v_row.daily_requests >= greatest(1, least(coalesce(p_daily_limit, 100), 100)) then
    return query select false, v_row.daily_requests, 'daily_limit'::text;
    return;
  end if;

  if v_row.last_request_at is not null
     and v_row.last_request_at > pg_catalog.now() - pg_catalog.make_interval(secs => greatest(1, least(coalesce(p_min_interval_seconds, 5), 60))) then
    return query select false, v_row.daily_requests, 'cooldown'::text;
    return;
  end if;

  update public.line_ai_group_conversations
  set daily_requests = v_row.daily_requests + 1,
      chat_type = p_chat_type,
      bot_slot = p_bot_slot,
      last_request_at = pg_catalog.now(),
      updated_at = pg_catalog.now(),
      expires_at = pg_catalog.now() + interval '24 hours'
  where chat_id = p_chat_id;

  return query select true, v_row.daily_requests + 1, 'ok'::text;
end;
$function$;

revoke all on function public.consume_line_ai_group_request(text, text, smallint, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_line_ai_group_request(text, text, smallint, integer, integer) to service_role;
