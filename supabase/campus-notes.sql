-- CampusSync Notes schema snapshot.
-- This schema has already been applied to the configured Supabase project.
-- Do not paste this file into an existing project unless you have reviewed its state.

create table if not exists public.campus_note_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  parent_id uuid references public.campus_note_folders(id) on delete set null,
  color text not null default 'slate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campus_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.campus_note_folders(id) on delete set null,
  title text not null default '無題のメモ' check (char_length(title) <= 240),
  content_html text not null default '',
  content_text text not null default '',
  tags text[] not null default '{}',
  color text not null default 'slate',
  icon text not null default '📝',
  template_key text not null default 'blank',
  is_pinned boolean not null default false,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  deleted_at timestamptz,
  linked_todo_id uuid,
  linked_assignment_id uuid references public.assignments(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private','shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campus_note_collaborators (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.campus_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer','editor')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(note_id,user_id)
);

create table if not exists public.campus_note_comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.campus_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campus_note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.campus_notes(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content_html text not null default '',
  content_text text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.campus_note_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.campus_notes(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  mime_type text not null,
  file_size bigint not null default 0 check (file_size >= 0),
  created_at timestamptz not null default now()
);

create index if not exists campus_notes_owner_updated_idx on public.campus_notes(owner_id,updated_at desc);
create index if not exists campus_notes_folder_updated_idx on public.campus_notes(folder_id,updated_at desc);
create index if not exists campus_notes_search_idx on public.campus_notes using gin(to_tsvector('simple',coalesce(title,'')||' '||coalesce(content_text,'')));
create index if not exists campus_note_collaborators_user_idx on public.campus_note_collaborators(user_id,note_id);
create index if not exists campus_note_comments_note_created_idx on public.campus_note_comments(note_id,created_at desc);
create index if not exists campus_note_versions_note_created_idx on public.campus_note_versions(note_id,created_at desc);
create index if not exists campus_note_attachments_note_idx on public.campus_note_attachments(note_id,created_at desc);
create index if not exists campus_note_folders_owner_idx on public.campus_note_folders(owner_id);
create index if not exists campus_note_folders_parent_idx on public.campus_note_folders(parent_id);
create index if not exists campus_notes_linked_assignment_idx on public.campus_notes(linked_assignment_id);
create index if not exists campus_note_collaborators_invited_by_idx on public.campus_note_collaborators(invited_by);
create index if not exists campus_note_comments_user_idx on public.campus_note_comments(user_id);
create index if not exists campus_note_versions_editor_idx on public.campus_note_versions(editor_id);
create index if not exists campus_note_attachments_uploader_idx on public.campus_note_attachments(uploader_id);

create or replace function public.set_campus_note_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

create or replace function public.prevent_campus_note_owner_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.owner_id<>old.owner_id then
    raise exception 'A note owner cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_campus_note_folder_owner()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.folder_id is not null and not exists(
    select 1 from public.campus_note_folders f where f.id=new.folder_id and f.owner_id=new.owner_id
  ) then
    raise exception 'A note can only be placed in its owner folder';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_campus_note_folder_parent_owner()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.parent_id is not null and not exists(
    select 1 from public.campus_note_folders f where f.id=new.parent_id and f.owner_id=new.owner_id
  ) then
    raise exception 'A folder parent must belong to the same owner';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_campus_note_editor_metadata()
returns trigger language plpgsql set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role'
    and auth.uid() is distinct from old.owner_id
    and (
    new.folder_id is distinct from old.folder_id
    or new.color is distinct from old.color
    or new.icon is distinct from old.icon
    or new.is_pinned is distinct from old.is_pinned
    or new.is_favorite is distinct from old.is_favorite
    or new.is_archived is distinct from old.is_archived
    or new.deleted_at is distinct from old.deleted_at
    or new.visibility is distinct from old.visibility
  ) then
    raise exception 'Only the note owner can change note organization and sharing settings';
  end if;
  return new;
end;
$$;

drop trigger if exists campus_note_folders_updated_at on public.campus_note_folders;
create trigger campus_note_folders_updated_at before update on public.campus_note_folders
for each row execute function public.set_campus_note_updated_at();
drop trigger if exists campus_notes_updated_at on public.campus_notes;
create trigger campus_notes_updated_at before update on public.campus_notes
for each row execute function public.set_campus_note_updated_at();
drop trigger if exists campus_note_comments_updated_at on public.campus_note_comments;
create trigger campus_note_comments_updated_at before update on public.campus_note_comments
for each row execute function public.set_campus_note_updated_at();

drop trigger if exists campus_notes_owner_immutable on public.campus_notes;
create trigger campus_notes_owner_immutable before update of owner_id on public.campus_notes
for each row execute function public.prevent_campus_note_owner_change();
drop trigger if exists campus_notes_folder_owner_guard on public.campus_notes;
create trigger campus_notes_folder_owner_guard before insert or update of folder_id,owner_id on public.campus_notes
for each row execute function public.enforce_campus_note_folder_owner();
drop trigger if exists campus_note_folders_parent_owner_guard on public.campus_note_folders;
create trigger campus_note_folders_parent_owner_guard before insert or update of parent_id,owner_id on public.campus_note_folders
for each row execute function public.enforce_campus_note_folder_parent_owner();
drop trigger if exists campus_notes_editor_metadata_guard on public.campus_notes;
create trigger campus_notes_editor_metadata_guard before update on public.campus_notes
for each row execute function public.enforce_campus_note_editor_metadata();

alter table public.campus_note_folders enable row level security;
alter table public.campus_notes enable row level security;
alter table public.campus_note_collaborators enable row level security;
alter table public.campus_note_comments enable row level security;
alter table public.campus_note_versions enable row level security;
alter table public.campus_note_attachments enable row level security;

revoke all on public.campus_note_folders,public.campus_notes,public.campus_note_collaborators,
  public.campus_note_comments,public.campus_note_versions,public.campus_note_attachments from anon,authenticated;
grant select,insert,update,delete on public.campus_note_folders to authenticated;
grant select,insert,update,delete on public.campus_notes to authenticated;
grant select on public.campus_note_collaborators to authenticated;
grant select,insert,update,delete on public.campus_note_comments to authenticated;
grant select,insert on public.campus_note_versions to authenticated;
grant select,insert,delete on public.campus_note_attachments to authenticated;

drop policy if exists campus_note_folders_select_owner on public.campus_note_folders;
create policy campus_note_folders_select_owner on public.campus_note_folders for select to authenticated
using(owner_id=(select auth.uid()));
drop policy if exists campus_note_folders_insert_owner on public.campus_note_folders;
create policy campus_note_folders_insert_owner on public.campus_note_folders for insert to authenticated
with check(owner_id=(select auth.uid()));
drop policy if exists campus_note_folders_update_owner on public.campus_note_folders;
create policy campus_note_folders_update_owner on public.campus_note_folders for update to authenticated
using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
drop policy if exists campus_note_folders_delete_owner on public.campus_note_folders;
create policy campus_note_folders_delete_owner on public.campus_note_folders for delete to authenticated
using(owner_id=(select auth.uid()));

drop policy if exists campus_notes_select_member on public.campus_notes;
create policy campus_notes_select_member on public.campus_notes for select to authenticated
using(owner_id=(select auth.uid()) or exists(
  select 1 from public.campus_note_collaborators c where c.note_id=campus_notes.id and c.user_id=(select auth.uid())
));
drop policy if exists campus_notes_insert_owner on public.campus_notes;
create policy campus_notes_insert_owner on public.campus_notes for insert to authenticated
with check(owner_id=(select auth.uid()));
drop policy if exists campus_notes_update_editor on public.campus_notes;
create policy campus_notes_update_editor on public.campus_notes for update to authenticated
using(owner_id=(select auth.uid()) or exists(
  select 1 from public.campus_note_collaborators c where c.note_id=campus_notes.id and c.user_id=(select auth.uid()) and c.role='editor'
))
with check(owner_id=(select auth.uid()) or exists(
  select 1 from public.campus_note_collaborators c where c.note_id=campus_notes.id and c.user_id=(select auth.uid()) and c.role='editor'
));
drop policy if exists campus_notes_delete_owner on public.campus_notes;
create policy campus_notes_delete_owner on public.campus_notes for delete to authenticated
using(owner_id=(select auth.uid()));

drop policy if exists campus_note_collaborators_select_member on public.campus_note_collaborators;
create policy campus_note_collaborators_select_member on public.campus_note_collaborators for select to authenticated
using(user_id=(select auth.uid()));
drop policy if exists campus_note_collaborators_insert_owner on public.campus_note_collaborators;
create policy campus_note_collaborators_insert_owner on public.campus_note_collaborators for insert to authenticated
with check(invited_by=(select auth.uid()) and exists(
  select 1 from public.campus_notes n where n.id=campus_note_collaborators.note_id and n.owner_id=(select auth.uid())
));
drop policy if exists campus_note_collaborators_delete_owner on public.campus_note_collaborators;
create policy campus_note_collaborators_delete_owner on public.campus_note_collaborators for delete to authenticated
using(exists(
  select 1 from public.campus_notes n where n.id=campus_note_collaborators.note_id and n.owner_id=(select auth.uid())
));

drop policy if exists campus_note_comments_select_member on public.campus_note_comments;
create policy campus_note_comments_select_member on public.campus_note_comments for select to authenticated
using(exists(
  select 1 from public.campus_notes n where n.id=campus_note_comments.note_id and (
    n.owner_id=(select auth.uid()) or exists(
      select 1 from public.campus_note_collaborators c where c.note_id=n.id and c.user_id=(select auth.uid())
    )
  )
));
drop policy if exists campus_note_comments_insert_member on public.campus_note_comments;
create policy campus_note_comments_insert_member on public.campus_note_comments for insert to authenticated
with check(user_id=(select auth.uid()) and exists(
  select 1 from public.campus_notes n where n.id=campus_note_comments.note_id and (
    n.owner_id=(select auth.uid()) or exists(
      select 1 from public.campus_note_collaborators c where c.note_id=n.id and c.user_id=(select auth.uid())
    )
  )
));
drop policy if exists campus_note_comments_update_own on public.campus_note_comments;
create policy campus_note_comments_update_own on public.campus_note_comments for update to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists campus_note_comments_delete_own_or_owner on public.campus_note_comments;
create policy campus_note_comments_delete_own_or_owner on public.campus_note_comments for delete to authenticated
using(user_id=(select auth.uid()) or exists(
  select 1 from public.campus_notes n where n.id=campus_note_comments.note_id and n.owner_id=(select auth.uid())
));

drop policy if exists campus_note_versions_select_member on public.campus_note_versions;
create policy campus_note_versions_select_member on public.campus_note_versions for select to authenticated
using(exists(
  select 1 from public.campus_notes n where n.id=campus_note_versions.note_id and (
    n.owner_id=(select auth.uid()) or exists(
      select 1 from public.campus_note_collaborators c where c.note_id=n.id and c.user_id=(select auth.uid())
    )
  )
));
drop policy if exists campus_note_versions_insert_editor on public.campus_note_versions;
create policy campus_note_versions_insert_editor on public.campus_note_versions for insert to authenticated
with check(editor_id=(select auth.uid()) and exists(
  select 1 from public.campus_notes n where n.id=campus_note_versions.note_id and (
    n.owner_id=(select auth.uid()) or exists(
      select 1 from public.campus_note_collaborators c where c.note_id=n.id and c.user_id=(select auth.uid()) and c.role='editor'
    )
  )
));

drop policy if exists campus_note_attachments_select_member on public.campus_note_attachments;
create policy campus_note_attachments_select_member on public.campus_note_attachments for select to authenticated
using(exists(
  select 1 from public.campus_notes n where n.id=campus_note_attachments.note_id and (
    n.owner_id=(select auth.uid()) or exists(
      select 1 from public.campus_note_collaborators c where c.note_id=n.id and c.user_id=(select auth.uid())
    )
  )
));
drop policy if exists campus_note_attachments_insert_editor on public.campus_note_attachments;
create policy campus_note_attachments_insert_editor on public.campus_note_attachments for insert to authenticated
with check(uploader_id=(select auth.uid()) and exists(
  select 1 from public.campus_notes n where n.id=campus_note_attachments.note_id and (
    n.owner_id=(select auth.uid()) or exists(
      select 1 from public.campus_note_collaborators c where c.note_id=n.id and c.user_id=(select auth.uid()) and c.role='editor'
    )
  )
));
drop policy if exists campus_note_attachments_delete_uploader_or_owner on public.campus_note_attachments;
create policy campus_note_attachments_delete_uploader_or_owner on public.campus_note_attachments for delete to authenticated
using(uploader_id=(select auth.uid()) or exists(
  select 1 from public.campus_notes n where n.id=campus_note_attachments.note_id and n.owner_id=(select auth.uid())
));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'campus-notes','campus-notes',false,31457280,
  array[
    'image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/markdown','text/csv',
    'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text','application/rtf','application/zip','application/octet-stream'
  ]
)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists campus_notes_storage_select_member on storage.objects;
create policy campus_notes_storage_select_member on storage.objects for select to authenticated
using(bucket_id='campus-notes' and exists(
  select 1 from public.campus_note_attachments a
  join public.campus_notes n on n.id=a.note_id
  where a.file_path=objects.name and (
    n.owner_id=(select auth.uid()) or exists(
      select 1 from public.campus_note_collaborators c where c.note_id=n.id and c.user_id=(select auth.uid())
    )
  )
));
drop policy if exists campus_notes_storage_insert_editor on storage.objects;
create policy campus_notes_storage_insert_editor on storage.objects for insert to authenticated
with check(bucket_id='campus-notes' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(
  select 1 from public.campus_notes n where n.id::text=(storage.foldername(name))[2] and (
    n.owner_id=(select auth.uid()) or exists(
      select 1 from public.campus_note_collaborators c where c.note_id=n.id and c.user_id=(select auth.uid()) and c.role='editor'
    )
  )
));
drop policy if exists campus_notes_storage_delete_uploader_or_owner on storage.objects;
create policy campus_notes_storage_delete_uploader_or_owner on storage.objects for delete to authenticated
using(bucket_id='campus-notes' and (
  (storage.foldername(name))[1]=(select auth.uid())::text or exists(
    select 1 from public.campus_note_attachments a
    join public.campus_notes n on n.id=a.note_id
    where a.file_path=objects.name and n.owner_id=(select auth.uid())
  )
));

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campus_notes') then
    alter publication supabase_realtime add table public.campus_notes;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campus_note_comments') then
    alter publication supabase_realtime add table public.campus_note_comments;
  end if;
end
$$;
