-- Attach a shared file to a workspace task.
-- The planning API verifies that the file belongs to the same workspace.
alter table public.workspace_tasks
  add column if not exists attachment_file_id uuid
  references public.workspace_files(id) on delete set null;

create index if not exists workspace_tasks_attachment_file_id_idx
  on public.workspace_tasks (attachment_file_id)
  where attachment_file_id is not null;
