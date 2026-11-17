-- CampusSync: 学習プリント・資料室
-- ファイル本体は非公開 Storage bucket "study-materials" に保存する。
-- Storage bucket は初回の管理者アップロード時に Storage API 経由で作成される。

create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  subject text not null check (subject in ('国語演習','古典探求','物理','生物','数３','数C','公共','英コミュ','論表','情報','保健','その他')),
  material_type text not null check (material_type in ('lesson','assignment','answer','explanation','past_exam','other')),
  target_scope text not null default 'all' check (target_scope in ('all','grade','class')),
  target_value text,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 240),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg')),
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  is_published boolean not null default false,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_materials_target_value_check check (
    (target_scope = 'all' and target_value is null)
    or (target_scope = 'grade' and target_value ~ '^[1-3]$')
    or (target_scope = 'class' and target_value ~ '^[1-3]-[1-8]$')
  ),
  constraint study_materials_storage_path_check check (
    storage_path ~ '^uploads/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$'
  )
);

create index if not exists study_materials_published_idx
  on public.study_materials (published_at desc)
  where is_published = true and archived_at is null;

create index if not exists study_materials_subject_idx
  on public.study_materials (subject, material_type)
  where archived_at is null;

alter table public.study_materials enable row level security;
revoke all on table public.study_materials from anon, authenticated;
grant all on table public.study_materials to service_role;

comment on table public.study_materials is
  'CampusSync shared PDFs and printable image materials. Access is mediated by server APIs that verify admin sessions or student class membership.';
