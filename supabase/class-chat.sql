-- CampusSync Phase 1: private-by-class chat.
-- Run once in Supabase SQL Editor as project owner. Do not put service-role keys in the browser.

create table if not exists public.class_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null check (student_id ~ '^[0-9]{6}$'),
  student_name text not null check (char_length(btrim(student_name)) between 1 and 80),
  class_name text not null check (class_name ~ '^[1-3]-[1-8]$'),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_chat_messages_class_created_idx
  on public.class_chat_messages (class_name, created_at desc);

create table if not exists public.class_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.class_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null check (student_id ~ '^[0-9]{6}$'),
  class_name text not null check (class_name ~ '^[1-3]-[1-8]$'),
  emoji text not null check (emoji in ('👍', '❤️', '😂', '👀')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists class_chat_reactions_message_idx
  on public.class_chat_reactions (message_id);

-- Resolve identity from the signed-in school email and the existing profiles table.
-- SECURITY DEFINER is used so profiles RLS does not block the lookup; this only returns
-- the profile matching the caller's own 6-digit school email prefix.
create or replace function public.current_class_chat_profile()
returns table (student_id text, student_name text, user_class text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.student_id::text, coalesce(p.student_name::text, ''), p.user_class::text
  from public.profiles p
  where p.student_id::text = split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    and p.user_class::text ~ '^[1-3]-[1-8]$'
  order by p.student_id
  limit 1
$$;

revoke all on function public.current_class_chat_profile() from public;
grant execute on function public.current_class_chat_profile() to authenticated;

alter table public.class_chat_messages enable row level security;
alter table public.class_chat_reactions enable row level security;

revoke all on public.class_chat_messages from anon, public;
revoke all on public.class_chat_reactions from anon, public;
grant select, insert, update, delete on public.class_chat_messages to authenticated;
grant select, insert, delete on public.class_chat_reactions to authenticated;

drop policy if exists "Read messages from own class" on public.class_chat_messages;
create policy "Read messages from own class"
on public.class_chat_messages for select to authenticated
using (
  class_name = (select p.user_class from public.current_class_chat_profile() p limit 1)
);

drop policy if exists "Post messages as own profile in own class" on public.class_chat_messages;
create policy "Post messages as own profile in own class"
on public.class_chat_messages for insert to authenticated
with check (
  user_id = auth.uid()
  and student_id = (select p.student_id from public.current_class_chat_profile() p limit 1)
  and student_name = (select p.student_name from public.current_class_chat_profile() p limit 1)
  and class_name = (select p.user_class from public.current_class_chat_profile() p limit 1)
  and char_length(btrim(body)) between 1 and 500
);

drop policy if exists "Edit own messages in own class" on public.class_chat_messages;
create policy "Edit own messages in own class"
on public.class_chat_messages for update to authenticated
using (
  user_id = auth.uid()
  and class_name = (select p.user_class from public.current_class_chat_profile() p limit 1)
)
with check (
  user_id = auth.uid()
  and student_id = (select p.student_id from public.current_class_chat_profile() p limit 1)
  and student_name = (select p.student_name from public.current_class_chat_profile() p limit 1)
  and class_name = (select p.user_class from public.current_class_chat_profile() p limit 1)
  and char_length(btrim(body)) between 1 and 500
);

drop policy if exists "Delete own messages in own class" on public.class_chat_messages;
create policy "Delete own messages in own class"
on public.class_chat_messages for delete to authenticated
using (
  user_id = auth.uid()
  and class_name = (select p.user_class from public.current_class_chat_profile() p limit 1)
);

drop policy if exists "Read reactions from own class" on public.class_chat_reactions;
create policy "Read reactions from own class"
on public.class_chat_reactions for select to authenticated
using (
  class_name = (select p.user_class from public.current_class_chat_profile() p limit 1)
  and exists (
    select 1 from public.class_chat_messages m
    where m.id = class_chat_reactions.message_id
      and m.class_name = class_chat_reactions.class_name
  )
);

drop policy if exists "React in own class as own student" on public.class_chat_reactions;
create policy "React in own class as own student"
on public.class_chat_reactions for insert to authenticated
with check (
  user_id = auth.uid()
  and student_id = (select p.student_id from public.current_class_chat_profile() p limit 1)
  and class_name = (select p.user_class from public.current_class_chat_profile() p limit 1)
  and exists (
    select 1 from public.class_chat_messages m
    where m.id = class_chat_reactions.message_id
      and m.class_name = class_chat_reactions.class_name
  )
);

drop policy if exists "Remove own reaction in own class" on public.class_chat_reactions;
create policy "Remove own reaction in own class"
on public.class_chat_reactions for delete to authenticated
using (
  user_id = auth.uid()
  and student_id = (select p.student_id from public.current_class_chat_profile() p limit 1)
  and class_name = (select p.user_class from public.current_class_chat_profile() p limit 1)
);

alter table public.class_chat_messages replica identity full;
alter table public.class_chat_reactions replica identity full;

-- Enable Supabase Realtime for messages and reactions. This is safe to re-run.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'class_chat_messages'
    ) then
      alter publication supabase_realtime add table public.class_chat_messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'class_chat_reactions'
    ) then
      alter publication supabase_realtime add table public.class_chat_reactions;
    end if;
  end if;
end $$;
