create table if not exists public.study_material_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  parent_id uuid references public.study_material_folders(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists study_material_folders_sibling_name_uidx
  on public.study_material_folders (
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  );
create index if not exists study_material_folders_parent_idx
  on public.study_material_folders (parent_id, sort_order, lower(name));

alter table public.study_materials
  add column if not exists folder_id uuid
  references public.study_material_folders(id) on delete set null;
create index if not exists study_materials_folder_idx
  on public.study_materials (folder_id)
  where archived_at is null;

alter table public.study_material_folders enable row level security;
revoke all on table public.study_material_folders from public, anon, authenticated;
grant select, insert, update, delete on table public.study_material_folders to service_role;

comment on table public.study_material_folders is
  'Hierarchical folders for CampusSync school study materials. Access is mediated by server APIs using the service role.';

insert into public.study_material_folders (name, parent_id, sort_order)
select '学校資料', null, 0
where not exists (
  select 1 from public.study_material_folders where parent_id is null and lower(name) = lower('学校資料')
);

insert into public.study_material_folders (name, parent_id, sort_order)
select '教科別', root.id, 0
from public.study_material_folders root
where root.parent_id is null and root.name = '学校資料'
  and not exists (
    select 1 from public.study_material_folders f where f.parent_id = root.id and lower(f.name) = lower('教科別')
  );

insert into public.study_material_folders (name, parent_id, sort_order)
select subject.name, subject_root.id, subject.sort_order
from public.study_material_folders subject_root
cross join (values
  ('国語演習', 10), ('古典探求', 20), ('物理', 30), ('生物', 40), ('数３', 50), ('数C', 60),
  ('公共', 70), ('英コミュ', 80), ('論表', 90), ('情報', 100), ('保健', 110), ('その他', 120)
) as subject(name, sort_order)
where subject_root.parent_id = (
  select root.id from public.study_material_folders root
  where root.parent_id is null and root.name = '学校資料'
)
and subject_root.name = '教科別'
and not exists (
  select 1 from public.study_material_folders existing
  where existing.parent_id = subject_root.id and lower(existing.name) = lower(subject.name)
);

insert into public.study_material_folders (name, parent_id, sort_order)
select term.name, subject_folder.id, term.sort_order
from public.study_material_folders subject_folder
cross join (values
  ('1学期', 10), ('2学期', 20), ('3学期', 30), ('年間共通', 40), ('考査・過去問', 50)
) as term(name, sort_order)
where subject_folder.parent_id = (
  select department.id
  from public.study_material_folders department
  join public.study_material_folders root on root.id = department.parent_id
  where department.name = '教科別' and root.name = '学校資料' and root.parent_id is null
)
and not exists (
  select 1 from public.study_material_folders existing
  where existing.parent_id = subject_folder.id and lower(existing.name) = lower(term.name)
);

update public.study_materials material
set folder_id = subject_folder.id,
    updated_at = now()
from public.study_material_folders department
join public.study_material_folders root on root.id = department.parent_id
join public.study_material_folders subject_folder on subject_folder.parent_id = department.id
where root.name = '学校資料'
  and department.name = '教科別'
  and root.parent_id is null
  and lower(subject_folder.name) = lower(material.subject)
  and material.folder_id is null;
