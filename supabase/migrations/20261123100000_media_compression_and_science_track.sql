alter table public.student_my_books
  drop constraint if exists student_my_books_source_check;
alter table public.student_my_books
  add constraint student_my_books_source_check
  check (source = any (array['openlibrary','google-books','openbd','kirihara','ndl','keirinkan','kenkyusha','manual']::text[]));

alter table public.study_materials
  drop constraint if exists study_materials_storage_path_check,
  drop constraint if exists study_materials_mime_type_check;
alter table public.study_materials
  add constraint study_materials_storage_path_check
    check (storage_path ~ '^(uploads|submissions)/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|webp)$'),
  add constraint study_materials_mime_type_check
    check (mime_type = any (array['application/pdf','image/png','image/jpeg','image/webp']::text[]));

alter table public.study_material_submissions
  drop constraint if exists study_material_submissions_storage_path_check,
  drop constraint if exists study_material_submissions_mime_type_check;
alter table public.study_material_submissions
  add constraint study_material_submissions_storage_path_check
    check (storage_path ~ '^submissions/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|webp)$'),
  add constraint study_material_submissions_mime_type_check
    check (mime_type = any (array['application/pdf','image/png','image/jpeg','image/webp']::text[]));

update storage.buckets
set allowed_mime_types = array(
  select distinct value
  from unnest(coalesce(allowed_mime_types, array[]::text[]) || array['image/webp']::text[]) as value
)
where id in ('study-materials', 'school-notification-images');

create table if not exists public.student_learning_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  science_track text check (science_track in ('physics','biology')),
  updated_at timestamptz not null default now()
);
alter table public.student_learning_preferences enable row level security;
drop policy if exists "Students can view their own learning preferences" on public.student_learning_preferences;
create policy "Students can view their own learning preferences"
  on public.student_learning_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Students can insert their own learning preferences" on public.student_learning_preferences;
create policy "Students can insert their own learning preferences"
  on public.student_learning_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Students can update their own learning preferences" on public.student_learning_preferences;
create policy "Students can update their own learning preferences"
  on public.student_learning_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.student_learning_preferences to authenticated;
