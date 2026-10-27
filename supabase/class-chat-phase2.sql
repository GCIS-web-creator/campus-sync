-- CampusSync Phase 2: grade and school chat. Run after class-chat.sql.
create table if not exists public.school_chat_messages (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 student_id text not null check(student_id ~ '^[0-9]{6}$'),
 student_name text not null check(char_length(btrim(student_name)) between 1 and 80),
 user_class text not null check(user_class ~ '^[1-3]-[1-8]$'),
 scope text not null check(scope in ('grade','school')),
 scope_key text not null,
 body text not null check(char_length(btrim(body)) between 1 and 500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((scope='grade' and scope_key ~ '^[1-3]$') or (scope='school' and scope_key='all'))
);
create index if not exists school_chat_scope_created_idx on public.school_chat_messages(scope,scope_key,created_at desc);
alter table public.school_chat_messages enable row level security;
revoke all on public.school_chat_messages from anon,public;
grant select,insert,update,delete on public.school_chat_messages to authenticated;
drop policy if exists "Read own grade or school chat" on public.school_chat_messages;
create policy "Read own grade or school chat" on public.school_chat_messages for select to authenticated using (
 (scope='grade' and scope_key=split_part((select p.user_class from public.current_class_chat_profile() p limit 1),'-',1))
 or (scope='school' and scope_key='all')
);
drop policy if exists "Post to own grade or school chat" on public.school_chat_messages;
create policy "Post to own grade or school chat" on public.school_chat_messages for insert to authenticated with check (
 user_id=auth.uid()
 and student_id=(select p.student_id from public.current_class_chat_profile() p limit 1)
 and student_name=(select p.student_name from public.current_class_chat_profile() p limit 1)
 and user_class=(select p.user_class from public.current_class_chat_profile() p limit 1)
 and ((scope='grade' and scope_key=split_part((select p.user_class from public.current_class_chat_profile() p limit 1),'-',1)) or (scope='school' and scope_key='all'))
);
drop policy if exists "Edit own grade or school messages" on public.school_chat_messages;
create policy "Edit own grade or school messages" on public.school_chat_messages for update to authenticated using(user_id=auth.uid()) with check (
 user_id=auth.uid() and student_id=(select p.student_id from public.current_class_chat_profile() p limit 1)
 and student_name=(select p.student_name from public.current_class_chat_profile() p limit 1)
 and user_class=(select p.user_class from public.current_class_chat_profile() p limit 1)
 and ((scope='grade' and scope_key=split_part((select p.user_class from public.current_class_chat_profile() p limit 1),'-',1)) or (scope='school' and scope_key='all'))
);
drop policy if exists "Delete own grade or school messages" on public.school_chat_messages;
create policy "Delete own grade or school messages" on public.school_chat_messages for delete to authenticated using (
 user_id=auth.uid() and ((scope='grade' and scope_key=split_part((select p.user_class from public.current_class_chat_profile() p limit 1),'-',1)) or (scope='school' and scope_key='all'))
);
alter table public.school_chat_messages replica identity full;
do $realtime$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='school_chat_messages') then
  alter publication supabase_realtime add table public.school_chat_messages;
 end if;
end $realtime$;
