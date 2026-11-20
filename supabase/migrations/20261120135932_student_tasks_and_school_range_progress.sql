begin;

-- Student-owned tasks are private to the authenticated student's profile.
alter table public.todos
  add column if not exists subject text not null default 'その他';

drop policy if exists public_read_todos on public.todos;
drop policy if exists public_insert_todos on public.todos;
drop policy if exists public_update_todos on public.todos;
drop policy if exists public_delete_todos on public.todos;

revoke all on public.todos from anon, public;
grant select, insert, update, delete on public.todos to authenticated;
grant all on public.todos to service_role;

drop policy if exists todos_owner_select on public.todos;
drop policy if exists todos_owner_insert on public.todos;
drop policy if exists todos_owner_update on public.todos;
drop policy if exists todos_owner_delete on public.todos;

create policy todos_owner_select
  on public.todos for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.student_id = todos.student_id
        and p.auth_user_id = (select auth.uid())
    )
  );

create policy todos_owner_insert
  on public.todos for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.student_id = todos.student_id
        and p.auth_user_id = (select auth.uid())
    )
  );

create policy todos_owner_update
  on public.todos for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.student_id = todos.student_id
        and p.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.student_id = todos.student_id
        and p.auth_user_id = (select auth.uid())
    )
  );

create policy todos_owner_delete
  on public.todos for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.student_id = todos.student_id
        and p.auth_user_id = (select auth.uid())
    )
  );

-- Give each published scope item a stable UUID and classify existing items as scope by default.
update public.school_test_ranges r
set range_sections = coalesce((
  select jsonb_agg(
    (
      case
        when jsonb_typeof(section_row.value) = 'object' then section_row.value
        else jsonb_build_object('title', '未分類項目', 'body', section_row.value::text)
      end
    )
    || jsonb_build_object(
      'section_id',
      coalesce(nullif(section_row.value->>'section_id', ''), gen_random_uuid()::text),
      'kind',
      case when section_row.value->>'kind' = 'notice' then 'notice' else 'range' end
    )
    order by section_row.ordinality
  )
  from jsonb_array_elements(r.range_sections) with ordinality as section_row(value, ordinality)
), '[]'::jsonb)
where jsonb_typeof(r.range_sections) = 'array';

create table if not exists public.student_school_range_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_test_range_id uuid not null references public.school_test_ranges(id) on delete cascade,
  section_id uuid not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_school_range_progress_unique
    unique (user_id, school_test_range_id, section_id)
);

create index if not exists student_school_range_progress_user_idx
  on public.student_school_range_progress (user_id, school_test_range_id);

alter table public.student_school_range_progress enable row level security;
revoke all on public.student_school_range_progress from anon, public;
grant select, insert, update, delete on public.student_school_range_progress to authenticated;
grant all on public.student_school_range_progress to service_role;

drop policy if exists student_school_range_progress_owner_select on public.student_school_range_progress;
drop policy if exists student_school_range_progress_owner_insert on public.student_school_range_progress;
drop policy if exists student_school_range_progress_owner_update on public.student_school_range_progress;
drop policy if exists student_school_range_progress_owner_delete on public.student_school_range_progress;

create policy student_school_range_progress_owner_select
  on public.student_school_range_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy student_school_range_progress_owner_insert
  on public.student_school_range_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy student_school_range_progress_owner_update
  on public.student_school_range_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy student_school_range_progress_owner_delete
  on public.student_school_range_progress for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
