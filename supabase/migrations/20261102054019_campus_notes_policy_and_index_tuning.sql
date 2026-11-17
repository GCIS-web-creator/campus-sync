drop policy if exists campus_note_collaborators_select_member on public.campus_note_collaborators;
    create policy campus_note_collaborators_select_member on public.campus_note_collaborators
    for select to authenticated
    using (user_id = (select auth.uid()));

    create index if not exists campus_note_folders_owner_idx on public.campus_note_folders(owner_id);
    create index if not exists campus_note_folders_parent_idx on public.campus_note_folders(parent_id);
    create index if not exists campus_notes_linked_assignment_idx on public.campus_notes(linked_assignment_id);
    create index if not exists campus_note_collaborators_invited_by_idx on public.campus_note_collaborators(invited_by);
    create index if not exists campus_note_comments_user_idx on public.campus_note_comments(user_id);
    create index if not exists campus_note_versions_editor_idx on public.campus_note_versions(editor_id);
    create index if not exists campus_note_attachments_uploader_idx on public.campus_note_attachments(uploader_id);
  ;
