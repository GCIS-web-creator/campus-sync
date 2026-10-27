-- CampusSync Phase 4: rich text and private chat attachments.
-- Run after class-chat.sql, class-chat-phase2.sql and class-chat-phase3.sql.
-- Attachments are private; read access follows the same class/grade/school scope as messages.
alter table public.class_chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text;
alter table public.school_chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Chat members upload own attachments" on storage.objects;
create policy "Chat members upload own attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Chat members read linked attachments" on storage.objects;
create policy "Chat members read linked attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    exists (
      select 1
      from public.class_chat_messages m
      where m.attachment_path = storage.objects.name
        and m.class_name = (
          select p.user_class from public.current_class_chat_profile() p limit 1
        )
    )
    or exists (
      select 1
      from public.school_chat_messages m
      where m.attachment_path = storage.objects.name
        and (
          m.scope = 'school'
          or (
            m.scope = 'grade'
            and m.scope_key = split_part((
              select p.user_class from public.current_class_chat_profile() p limit 1
            ), '-', 1)
          )
        )
    )
  )
);

drop policy if exists "Users delete own unlinked chat attachments" on storage.objects;
create policy "Users delete own unlinked chat attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (
    select 1 from public.class_chat_messages m where m.attachment_path = storage.objects.name
  )
  and not exists (
    select 1 from public.school_chat_messages m where m.attachment_path = storage.objects.name
  )
);
