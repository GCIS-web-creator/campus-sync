create table if not exists public.student_pomodoro_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 16000),
  updated_at timestamptz not null default now()
);

alter table public.student_pomodoro_states enable row level security;

drop policy if exists "Students can read their own pomodoro state" on public.student_pomodoro_states;
create policy "Students can read their own pomodoro state"
  on public.student_pomodoro_states
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Students can create their own pomodoro state" on public.student_pomodoro_states;
create policy "Students can create their own pomodoro state"
  on public.student_pomodoro_states
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update their own pomodoro state" on public.student_pomodoro_states;
create policy "Students can update their own pomodoro state"
  on public.student_pomodoro_states
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own pomodoro state" on public.student_pomodoro_states;
create policy "Students can delete their own pomodoro state"
  on public.student_pomodoro_states
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.student_pomodoro_states to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'student_pomodoro_states'
     ) then
    alter publication supabase_realtime add table public.student_pomodoro_states;
  end if;
end;
$$;
