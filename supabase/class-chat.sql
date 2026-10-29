-- CampusSync Phase 1: private-by-class chat.
-- Run this complete file in Supabase SQL Editor as project owner.
-- Safe to rerun. Never expose service-role keys in the browser.

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
 
-- Optional nickname shown in class chat; official student_name remains unchanged.
alter table public.profiles
  add column if not exists chat_display_name text;

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

-- Return only the signed-in user's own school profile.
-- Existing class values such as "1-A" are normalized to "1-1".
create or replace function public.current_class_chat_profile()
returns table (
  student_id text,
  student_name text,
  user_class text
)
language sql
stable
security definer
set search_path = public, auth
as $function$
  select
    p.student_id::text as student_id,
    coalesce(nullif(btrim(p.chat_display_name::text), ''), btrim(coalesce(p.student_name::text, ''))) as student_name,
    case
      when p.user_class::text ~ '^[1-3]-[1-8]$'
        then p.user_class::text
      when p.user_class::text ~* '^([1-3])[- ]([A-H])$'
        then substring(p.user_class::text from '^([1-3])') || '-' ||
             (ascii(upper(substring(p.user_class::text from '[A-H]'))) - 64)::text
      else null
    end as user_class
  from public.profiles as p
  where p.student_id::text = split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    and coalesce(auth.jwt() ->> 'email', '') ~* '^[0-9]{6}@tokyo\.soka\.ed\.jp$'
    and (p.auth_user_id = auth.uid() or p.auth_user_id is null)
  order by (p.auth_user_id = auth.uid()) desc nulls last
  limit 1
$function$;

revoke all on function public.current_class_chat_profile() from public;
revoke all on function public.current_class_chat_profile() from anon;
grant execute on function public.current_class_chat_profile() to authenticated;

-- Keep the author's older messages consistent with their latest chat display name.
create or replace function public.sync_class_chat_display_name_to_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  effective_name text;
begin
  effective_name := coalesce(
    nullif(btrim(new.chat_display_name::text), ''),
    btrim(coalesce(new.student_name::text, ''))
  );

  if new.auth_user_id is not null then
    update public.class_chat_messages
    set student_name = effective_name
    where user_id = new.auth_user_id
      and student_id = new.student_id::text
      and student_name is distinct from effective_name;
  end if;

  return new;
end
$function$;

revoke all on function public.sync_class_chat_display_name_to_messages() from public;

drop trigger if exists sync_class_chat_display_name_to_messages on public.profiles;
create trigger sync_class_chat_display_name_to_messages
after update of student_name, chat_display_name on public.profiles
for each row
when (
  old.student_name is distinct from new.student_name
  or old.chat_display_name is distinct from new.chat_display_name
)
execute function public.sync_class_chat_display_name_to_messages();

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
  class_name = (select p.user_class from public.current_class_chat_profile() as p limit 1)
);

drop policy if exists "Post messages as own profile in own class" on public.class_chat_messages;
create policy "Post messages as own profile in own class"
on public.class_chat_messages for insert to authenticated
with check (
  user_id = auth.uid()
  and student_id = (select p.student_id from public.current_class_chat_profile() as p limit 1)
  and student_name = (select p.student_name from public.current_class_chat_profile() as p limit 1)
  and class_name = (select p.user_class from public.current_class_chat_profile() as p limit 1)
  and char_length(btrim(body)) between 1 and 500
);

drop policy if exists "Edit own messages in own class" on public.class_chat_messages;
create policy "Edit own messages in own class"
on public.class_chat_messages for update to authenticated
using (
  user_id = auth.uid()
  and class_name = (select p.user_class from public.current_class_chat_profile() as p limit 1)
)
with check (
  user_id = auth.uid()
  and student_id = (select p.student_id from public.current_class_chat_profile() as p limit 1)
  and student_name = (select p.student_name from public.current_class_chat_profile() as p limit 1)
  and class_name = (select p.user_class from public.current_class_chat_profile() as p limit 1)
  and char_length(btrim(body)) between 1 and 500
);

drop policy if exists "Delete own messages in own class" on public.class_chat_messages;
create policy "Delete own messages in own class"
on public.class_chat_messages for delete to authenticated
using (
  user_id = auth.uid()
  and class_name = (select p.user_class from public.current_class_chat_profile() as p limit 1)
);

drop policy if exists "Read reactions from own class" on public.class_chat_reactions;
create policy "Read reactions from own class"
on public.class_chat_reactions for select to authenticated
using (
  class_name = (select p.user_class from public.current_class_chat_profile() as p limit 1)
  and exists (
    select 1 from public.class_chat_messages as m
    where m.id = class_chat_reactions.message_id
      and m.class_name = class_chat_reactions.class_name
  )
);

drop policy if exists "React in own class as own student" on public.class_chat_reactions;
create policy "React in own class as own student"
on public.class_chat_reactions for insert to authenticated
with check (
  user_id = auth.uid()
  and student_id = (select p.student_id from public.current_class_chat_profile() as p limit 1)
  and class_name = (select p.user_class from public.current_class_chat_profile() as p limit 1)
  and exists (
    select 1 from public.class_chat_messages as m
    where m.id = class_chat_reactions.message_id
      and m.class_name = class_chat_reactions.class_name
  )
);

drop policy if exists "Remove own reaction in own class" on public.class_chat_reactions;
create policy "Remove own reaction in own class"
on public.class_chat_reactions for delete to authenticated
using (
  user_id = auth.uid()
  and student_id = (select p.student_id from public.current_class_chat_profile() as p limit 1)
  and class_name = (select p.user_class from public.current_class_chat_profile() as p limit 1)
);

alter table public.class_chat_messages replica identity full;
alter table public.class_chat_reactions replica identity full;

-- Enable Supabase Realtime only if the standard publication exists. Safe to rerun.
do $realtime$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'class_chat_messages'
    ) then
      alter publication supabase_realtime add table public.class_chat_messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'class_chat_reactions'
    ) then
      alter publication supabase_realtime add table public.class_chat_reactions;
    end if;
  end if;
end
$realtime$;
