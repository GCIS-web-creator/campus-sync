
    create or replace function public.enforce_campus_note_editor_metadata()
    returns trigger
    language plpgsql
    set search_path = public
    as $$
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
  