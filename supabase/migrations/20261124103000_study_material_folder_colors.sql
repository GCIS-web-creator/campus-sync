alter table public.study_material_folders
  add column if not exists color text not null default '#f59e0b';

alter table public.study_material_folders
  drop constraint if exists study_material_folders_color_check;

alter table public.study_material_folders
  add constraint study_material_folders_color_check
  check (color ~ '^#[0-9A-Fa-f]{6}$');

update public.study_material_folders
set color = '#f59e0b'
where color is null or color !~ '^#[0-9A-Fa-f]{6}$';

comment on column public.study_material_folders.color is
  '管理者が設定したフォルダー表示色（6桁HEX）。';
