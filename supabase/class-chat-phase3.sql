-- CampusSync Phase 3: reporting, moderation groundwork and anti-spam.
-- Run after class-chat.sql and class-chat-phase2.sql in Supabase SQL Editor.
-- This migration does not change existing chat messages.

create table if not exists public.chat_message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null,
  message_table text not null check (message_table in ('class_chat_messages','school_chat_messages')),
  reason text not null check (reason in ('いじめ・嫌がらせ','個人情報','迷惑投稿・連投','不適切な内容','その他')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists chat_message_reports_status_created_idx
  on public.chat_message_reports(status, created_at desc);
create index if not exists chat_message_reports_reporter_idx
  on public.chat_message_reports(reporter_user_id, created_at desc);

alter table public.chat_message_reports enable row level security;
revoke all on public.chat_message_reports from anon, public;
grant select, insert on public.chat_message_reports to authenticated;

drop policy if exists "Students can report chat messages" on public.chat_message_reports;
create policy "Students can report chat messages"
on public.chat_message_reports for insert to authenticated
with check (
  reporter_user_id = auth.uid()
  and (
    (message_table = 'class_chat_messages' and exists (
      select 1 from public.class_chat_messages m where m.id = message_id
    ))
    or
    (message_table = 'school_chat_messages' and exists (
      select 1 from public.school_chat_messages m where m.id = message_id
    ))
  )
);

drop policy if exists "Students can view own chat reports" on public.chat_message_reports;
create policy "Students can view own chat reports"
on public.chat_message_reports for select to authenticated
using (reporter_user_id = auth.uid());

-- Database-side posting limits: at most 8 chat messages per user in 60 seconds.
create or replace function public.enforce_chat_message_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  recent_count integer;
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'Chat sender must match the authenticated user';
  end if;

  if tg_table_name = 'class_chat_messages' then
    select count(*) into recent_count
    from public.class_chat_messages m
    where m.user_id = auth.uid()
      and m.created_at > now() - interval '60 seconds';
  else
    select count(*) into recent_count
    from public.school_chat_messages m
    where m.user_id = auth.uid()
      and m.created_at > now() - interval '60 seconds';
  end if;

  if recent_count >= 8 then
    raise exception '投稿が多すぎます。1分ほど待ってから再投稿してください。';
  end if;

  return new;
end
$function$;

drop trigger if exists class_chat_message_rate_limit on public.class_chat_messages;
create trigger class_chat_message_rate_limit
before insert on public.class_chat_messages
for each row execute function public.enforce_chat_message_rate_limit();

drop trigger if exists school_chat_message_rate_limit on public.school_chat_messages;
create trigger school_chat_message_rate_limit
before insert on public.school_chat_messages
for each row execute function public.enforce_chat_message_rate_limit();

-- Only allow users to report each message once per message table.
create unique index if not exists chat_message_reports_once_idx
  on public.chat_message_reports(reporter_user_id, message_table, message_id);
