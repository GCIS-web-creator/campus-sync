create table if not exists public.student_notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  subjects text[] not null default '{}'::text[] check (cardinality(subjects) > 0),
  purpose text not null default '課題' check (char_length(btrim(purpose)) between 1 and 80),
  custom_purpose text,
  notebook_size text not null default 'B5',
  total_pages integer not null default 60 check (total_pages between 1 and 2000),
  used_pages integer not null default 0 check (used_pages between 0 and total_pages),
  status text not null default 'unused' check (status in ('unused','in_use','stored','finished')),
  storage_location text, cover_image_path text, started_at date, last_used_at date, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_notebooks_user_updated_idx on public.student_notebooks (user_id, updated_at desc);
create index if not exists student_notebooks_subjects_gin_idx on public.student_notebooks using gin (subjects);
alter table public.student_notebooks enable row level security;
drop policy if exists "Students manage their own notebooks" on public.student_notebooks;
create policy "Students manage their own notebooks" on public.student_notebooks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.student_notebooks to authenticated;

create table if not exists public.student_notebook_usage_logs (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.student_notebooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  used_on date not null default current_date,
  page_start integer not null check (page_start >= 1),
  page_end integer not null check (page_end >= page_start),
  subject text, content text,
  created_at timestamptz not null default now()
);
create index if not exists student_notebook_usage_logs_owner_date_idx on public.student_notebook_usage_logs (user_id, used_on desc, created_at desc);
create index if not exists student_notebook_usage_logs_notebook_idx on public.student_notebook_usage_logs (notebook_id, used_on desc);
alter table public.student_notebook_usage_logs enable row level security;
drop policy if exists "Students read their own notebook usage logs" on public.student_notebook_usage_logs;
create policy "Students read their own notebook usage logs" on public.student_notebook_usage_logs
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Students insert their own notebook usage logs" on public.student_notebook_usage_logs;
create policy "Students insert their own notebook usage logs" on public.student_notebook_usage_logs
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.student_notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );
grant select, insert on public.student_notebook_usage_logs to authenticated;

create or replace function public.record_student_notebook_usage(
  p_notebook_id uuid, p_page_start integer, p_page_end integer,
  p_subject text default null, p_content text default null
)
returns public.student_notebook_usage_logs
language plpgsql security invoker set search_path = ''
as $function$
declare
  current_notebook public.student_notebooks;
  new_log public.student_notebook_usage_logs;
begin
  select * into current_notebook from public.student_notebooks
  where id = p_notebook_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Notebook was not found or access was denied.'; end if;
  if p_page_start is null or p_page_end is null or p_page_start < 1
    or p_page_end < p_page_start or p_page_end > current_notebook.total_pages then
    raise exception 'The page range is outside the notebook.';
  end if;
  update public.student_notebooks
  set used_pages = greatest(current_notebook.used_pages, p_page_end),
      status = case when p_page_end >= total_pages then 'finished' else 'in_use' end,
      last_used_at = current_date, updated_at = now()
  where id = p_notebook_id;
  insert into public.student_notebook_usage_logs (notebook_id,user_id,used_on,page_start,page_end,subject,content)
  values (p_notebook_id,(select auth.uid()),current_date,p_page_start,p_page_end,nullif(btrim(p_subject),''),nullif(btrim(p_content),''))
  returning * into new_log;
  return new_log;
end;
$function$;
revoke all on function public.record_student_notebook_usage(uuid,integer,integer,text,text) from public, anon;
grant execute on function public.record_student_notebook_usage(uuid,integer,integer,text,text) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('student-notebook-covers','student-notebook-covers',false,5242880,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Students read their notebook cover photos" on storage.objects;
create policy "Students read their notebook cover photos" on storage.objects for select to authenticated
  using (bucket_id='student-notebook-covers' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Students upload their notebook cover photos" on storage.objects;
create policy "Students upload their notebook cover photos" on storage.objects for insert to authenticated
  with check (bucket_id='student-notebook-covers' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Students delete their notebook cover photos" on storage.objects;
create policy "Students delete their notebook cover photos" on storage.objects for delete to authenticated
  using (bucket_id='student-notebook-covers' and (storage.foldername(name))[1]=(select auth.uid())::text);
