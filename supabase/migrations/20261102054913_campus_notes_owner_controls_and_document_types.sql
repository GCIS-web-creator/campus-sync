
    create or replace function public.enforce_campus_note_folder_owner()
    returns trigger
    language plpgsql
    set search_path = public
    as $$
    begin
      if new.folder_id is not null and not exists (
        select 1 from public.campus_note_folders f
        where f.id = new.folder_id and f.owner_id = new.owner_id
      ) then
        raise exception 'A note can only be placed in its owner folder';
      end if;
      return new;
    end;
    $$;

    drop trigger if exists campus_notes_folder_owner_guard on public.campus_notes;
    create trigger campus_notes_folder_owner_guard
    before insert or update of folder_id, owner_id on public.campus_notes
    for each row execute function public.enforce_campus_note_folder_owner();

    create or replace function public.enforce_campus_note_folder_parent_owner()
    returns trigger
    language plpgsql
    set search_path = public
    as $$
    begin
      if new.parent_id is not null and not exists (
        select 1 from public.campus_note_folders f
        where f.id = new.parent_id and f.owner_id = new.owner_id
      ) then
        raise exception 'A folder parent must belong to the same owner';
      end if;
      return new;
    end;
    $$;

    drop trigger if exists campus_note_folders_parent_owner_guard on public.campus_note_folders;
    create trigger campus_note_folders_parent_owner_guard
    before insert or update of parent_id, owner_id on public.campus_note_folders
    for each row execute function public.enforce_campus_note_folder_parent_owner();

    create or replace function public.enforce_campus_note_editor_metadata()
    returns trigger
    language plpgsql
    set search_path = public
    as $$
    begin
      if auth.uid() is distinct from old.owner_id and (
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

    drop trigger if exists campus_notes_editor_metadata_guard on public.campus_notes;
    create trigger campus_notes_editor_metadata_guard
    before update on public.campus_notes
    for each row execute function public.enforce_campus_note_editor_metadata();

    update storage.buckets
    set public = false,
        file_size_limit = 31457280,
        allowed_mime_types = array[
          'image/png','image/jpeg','image/webp','image/gif',
          'application/pdf','text/plain','text/markdown','text/csv',
          'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.oasis.opendocument.text','application/rtf','application/zip',
          'application/octet-stream'
        ]
    where id = 'campus-notes';
  