alter table public.student_my_books
  add column if not exists cover_urls text[] not null default '{}';

alter table public.study_materials
  drop constraint if exists study_materials_storage_path_check;

alter table public.study_materials
  add constraint study_materials_storage_path_check
  check (storage_path ~ '^(uploads|submissions)/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$');

create table if not exists public.study_material_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null check (student_id ~ '^[0-9]{6}$'),
  student_name text not null default '' check (char_length(student_name) <= 120),
  user_class text not null check (user_class ~ '^[1-3]-[1-8]$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  subject text not null check (subject in ('国語演習','古典探求','物理','生物','数３','数C','公共','英コミュ','論表','情報','保健','その他')),
  material_type text not null check (material_type in ('lesson','assignment','answer','explanation','past_exam','other')),
  storage_path text not null unique check (storage_path ~ '^submissions/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$'),
  file_name text not null check (char_length(file_name) between 1 and 240),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg')),
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  status text not null default 'pending' check (status in ('pending','reviewing','approved','rejected')),
  review_note text,
  approved_material_id uuid references public.study_materials(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists study_material_submissions_user_created_idx
  on public.study_material_submissions (user_id, created_at desc);

create index if not exists study_material_submissions_status_created_idx
  on public.study_material_submissions (status, created_at asc);

alter table public.study_material_submissions enable row level security;
revoke all on table public.study_material_submissions from anon, authenticated;
grant all on table public.study_material_submissions to service_role;

comment on table public.study_material_submissions is
  'Student-submitted study materials. Private until reviewed and approved by an administrator.';
