-- CampusSync Phase 5: append-only chat audit trail for moderation and export.
-- Run after class-chat.sql, class-chat-phase2.sql, class-chat-phase3.sql and class-chat-phase4.sql.
-- This records new message events, edits, deletions, reports and report status changes.
-- Existing messages are imported once as baseline_snapshot; historical deletions before this migration cannot be reconstructed.

create table if not exists public.chat_audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  event_type text not null check (event_type in (
    'baseline_snapshot',
    'message_created',
    'message_updated',
    'message_deleted',
    'report_created',
    'report_status_changed',
    'admin_message_deleted',
    'admin_report_status_changed',
    'logs_exported'
  )),
  source_table text not null,
  record_id uuid,
  actor_user_id uuid,
  actor_label text not null default 'database_trigger',
  student_id text,
  student_name text,
  user_class text,
  scope text,
  scope_key text,
  body text,
  previous_body text,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  reason text,
  details text,
  status text,
  previous_status text,
  metadata jsonb not null default '{}'::jsonb
);

-- Recreate the check so rerunning a previously-applied draft also enables export events.
alter table public.chat_audit_logs drop constraint if exists chat_audit_logs_event_type_check;
alter table public.chat_audit_logs add constraint chat_audit_logs_event_type_check
  check (event_type in (
    'baseline_snapshot', 'message_created', 'message_updated', 'message_deleted',
    'report_created', 'report_status_changed', 'admin_message_deleted',
    'admin_report_status_changed', 'logs_exported'
  ));

-- A report retains a small snapshot of the message it refers to even if the message is later removed.
alter table public.chat_message_reports add column if not exists message_snapshot jsonb;
grant select, insert, update, delete on table public.class_chat_messages, public.school_chat_messages, public.chat_message_reports to service_role;

create index if not exists chat_audit_logs_time_idx
  on public.chat_audit_logs(occurred_at desc, id desc);
create index if not exists chat_audit_logs_record_idx
  on public.chat_audit_logs(source_table, record_id, occurred_at desc);
create index if not exists chat_audit_logs_actor_idx
  on public.chat_audit_logs(actor_user_id, occurred_at desc);

-- Backfill message snapshots for earlier reports while the target messages still exist.
update public.chat_message_reports r
set message_snapshot = jsonb_build_object(
  'id', m.id, 'message_table', 'class_chat_messages', 'student_id', m.student_id,
  'student_name', m.student_name, 'user_class', m.class_name, 'scope', 'class',
  'scope_key', m.class_name, 'body', m.body, 'created_at', m.created_at,
  'updated_at', m.updated_at, 'attachment_path', m.attachment_path,
  'attachment_name', m.attachment_name, 'attachment_mime', m.attachment_mime
)
from public.class_chat_messages m
where r.message_table = 'class_chat_messages' and r.message_id = m.id and r.message_snapshot is null;

update public.chat_message_reports r
set message_snapshot = jsonb_build_object(
  'id', m.id, 'message_table', 'school_chat_messages', 'student_id', m.student_id,
  'student_name', m.student_name, 'user_class', m.user_class, 'scope', m.scope,
  'scope_key', m.scope_key, 'body', m.body, 'created_at', m.created_at,
  'updated_at', m.updated_at, 'attachment_path', m.attachment_path,
  'attachment_name', m.attachment_name, 'attachment_mime', m.attachment_mime
)
from public.school_chat_messages m
where r.message_table = 'school_chat_messages' and r.message_id = m.id and r.message_snapshot is null;

alter table public.chat_audit_logs enable row level security;
revoke all on public.chat_audit_logs from public, anon, authenticated;
grant select, insert on public.chat_audit_logs to service_role;
revoke update, delete, truncate, references, trigger on public.chat_audit_logs from public, anon, authenticated, service_role;
grant usage, select on sequence public.chat_audit_logs_id_seq to service_role;

-- Baseline snapshot of currently-existing messages (idempotent on repeated migration runs).
create unique index if not exists chat_audit_baseline_once_idx
  on public.chat_audit_logs(source_table, record_id)
  where event_type = 'baseline_snapshot';

insert into public.chat_audit_logs (
  event_type, source_table, record_id, actor_label,
  student_id, student_name, user_class, scope, scope_key,
  body, attachment_path, attachment_name, attachment_mime, metadata
)
select
  'baseline_snapshot', 'class_chat_messages', m.id, 'migration_baseline',
  m.student_id, m.student_name, m.class_name, 'class', m.class_name,
  m.body, m.attachment_path, m.attachment_name, m.attachment_mime,
  jsonb_build_object('created_at', m.created_at, 'updated_at', m.updated_at)
from public.class_chat_messages m
where not exists (
  select 1 from public.chat_audit_logs a
  where a.event_type = 'baseline_snapshot'
    and a.source_table = 'class_chat_messages'
    and a.record_id = m.id
);

insert into public.chat_audit_logs (
  event_type, source_table, record_id, actor_label,
  student_id, student_name, user_class, scope, scope_key,
  body, attachment_path, attachment_name, attachment_mime, metadata
)
select
  'baseline_snapshot', 'school_chat_messages', m.id, 'migration_baseline',
  m.student_id, m.student_name, m.user_class, m.scope, m.scope_key,
  m.body, m.attachment_path, m.attachment_name, m.attachment_mime,
  jsonb_build_object('created_at', m.created_at, 'updated_at', m.updated_at)
from public.school_chat_messages m
where not exists (
  select 1 from public.chat_audit_logs a
  where a.event_type = 'baseline_snapshot'
    and a.source_table = 'school_chat_messages'
    and a.record_id = m.id
);

create or replace function public.audit_chat_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  before_row jsonb := '{}'::jsonb;
  after_row jsonb := '{}'::jsonb;
  chosen_row jsonb;
  event_name text;
  actor_id uuid;
  actor_text text;
  old_body text;
  new_body text;
  scope_name text;
  scope_value text;
  class_value text;
begin
  if tg_op = 'INSERT' then
    after_row := to_jsonb(new);
    chosen_row := after_row;
    event_name := 'message_created';
  elsif tg_op = 'UPDATE' then
    before_row := to_jsonb(old);
    after_row := to_jsonb(new);
    chosen_row := after_row;
    event_name := 'message_updated';
  else
    before_row := to_jsonb(old);
    chosen_row := before_row;
    event_name := 'message_deleted';
  end if;

  actor_id := auth.uid();
  if actor_id is not null then
    actor_text := 'authenticated_user';
  else
    actor_text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'database_trigger');
  end if;

  old_body := before_row ->> 'body';
  new_body := after_row ->> 'body';
  if tg_table_name = 'class_chat_messages' then
    scope_name := 'class';
    scope_value := chosen_row ->> 'class_name';
    class_value := chosen_row ->> 'class_name';
  else
    scope_name := chosen_row ->> 'scope';
    scope_value := chosen_row ->> 'scope_key';
    class_value := chosen_row ->> 'user_class';
  end if;

  insert into public.chat_audit_logs (
    event_type, source_table, record_id, actor_user_id, actor_label,
    student_id, student_name, user_class, scope, scope_key,
    body, previous_body, attachment_path, attachment_name, attachment_mime, metadata
  ) values (
    event_name,
    tg_table_name,
    (chosen_row ->> 'id')::uuid,
    actor_id,
    actor_text,
    chosen_row ->> 'student_id',
    chosen_row ->> 'student_name',
    class_value,
    scope_name,
    scope_value,
    case when tg_op = 'DELETE' then old_body else new_body end,
    case when tg_op = 'UPDATE' and old_body is distinct from new_body then old_body else null end,
    chosen_row ->> 'attachment_path',
    chosen_row ->> 'attachment_name',
    chosen_row ->> 'attachment_mime',
    jsonb_build_object(
      'operation', tg_op,
      'created_at', chosen_row ->> 'created_at',
      'updated_at', chosen_row ->> 'updated_at',
      'body_changed', (tg_op = 'UPDATE' and old_body is distinct from new_body)
    )
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end
$function$;

drop trigger if exists audit_class_chat_message_changes on public.class_chat_messages;
create trigger audit_class_chat_message_changes
after insert or update or delete on public.class_chat_messages
for each row execute function public.audit_chat_message_change();

drop trigger if exists audit_school_chat_message_changes on public.school_chat_messages;
create trigger audit_school_chat_message_changes
after insert or update or delete on public.school_chat_messages
for each row execute function public.audit_chat_message_change();

create or replace function public.capture_chat_report_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Never let a client or later status update rewrite a report's original snapshot.
  if tg_op = 'UPDATE' and old.message_snapshot is not null then
    new.message_snapshot := old.message_snapshot;
    return new;
  end if;

  if new.message_table = 'class_chat_messages' then
    select jsonb_build_object(
      'id', m.id, 'message_table', 'class_chat_messages', 'student_id', m.student_id,
      'student_name', m.student_name, 'user_class', m.class_name, 'scope', 'class',
      'scope_key', m.class_name, 'body', m.body, 'created_at', m.created_at,
      'updated_at', m.updated_at, 'attachment_path', m.attachment_path,
      'attachment_name', m.attachment_name, 'attachment_mime', m.attachment_mime
    ) into new.message_snapshot
    from public.class_chat_messages m where m.id = new.message_id;
  else
    select jsonb_build_object(
      'id', m.id, 'message_table', 'school_chat_messages', 'student_id', m.student_id,
      'student_name', m.student_name, 'user_class', m.user_class, 'scope', m.scope,
      'scope_key', m.scope_key, 'body', m.body, 'created_at', m.created_at,
      'updated_at', m.updated_at, 'attachment_path', m.attachment_path,
      'attachment_name', m.attachment_name, 'attachment_mime', m.attachment_mime
    ) into new.message_snapshot
    from public.school_chat_messages m where m.id = new.message_id;
  end if;

  if new.message_snapshot is null then
    raise exception 'Reported chat message snapshot could not be captured';
  end if;
  return new;
end
$function$;

drop trigger if exists capture_chat_report_snapshot_before_write on public.chat_message_reports;
create trigger capture_chat_report_snapshot_before_write
before insert or update on public.chat_message_reports
for each row execute function public.capture_chat_report_snapshot();

create or replace function public.audit_chat_report_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid;
  actor_text text;
begin
  actor_id := auth.uid();
  if actor_id is not null then
    actor_text := 'authenticated_user';
  else
    actor_text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'database_trigger');
  end if;

  if tg_op = 'INSERT' then
    insert into public.chat_audit_logs (
      event_type, source_table, record_id, actor_user_id, actor_label,
      reason, details, status, metadata
    ) values (
      'report_created', 'chat_message_reports', new.id,
      coalesce(actor_id, new.reporter_user_id), actor_text,
      new.reason, new.details, new.status,
      jsonb_build_object('message_id', new.message_id, 'message_table', new.message_table, 'message_snapshot', new.message_snapshot)
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.chat_audit_logs (
      event_type, source_table, record_id, actor_user_id, actor_label,
      reason, details, status, previous_status, metadata
    ) values (
      'report_status_changed', 'chat_message_reports', new.id,
      actor_id, actor_text, new.reason, new.details, new.status, old.status,
      jsonb_build_object('message_id', new.message_id, 'message_table', new.message_table)
    );
  end if;
  return new;
end
$function$;

drop trigger if exists audit_chat_report_changes on public.chat_message_reports;
create trigger audit_chat_report_changes
after insert or update on public.chat_message_reports
for each row execute function public.audit_chat_report_change();


-- These moderation RPCs make the database change and its audit event atomic.
-- They are executable only by the server-side service role, never by browser users.
create or replace function public.admin_delete_chat_message(
  p_message_id uuid,
  p_message_table text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  message_row jsonb;
  occurred_time timestamptz := clock_timestamp();
begin
  if p_message_table not in ('class_chat_messages', 'school_chat_messages') then
    raise exception 'Invalid chat message table';
  end if;
  if nullif(btrim(p_reason), '') is null or char_length(btrim(p_reason)) > 500 then
    raise exception 'Deletion reason must contain 1 to 500 characters';
  end if;

  if p_message_table = 'class_chat_messages' then
    select to_jsonb(m) into message_row
    from public.class_chat_messages m where m.id = p_message_id for update;
  else
    select to_jsonb(m) into message_row
    from public.school_chat_messages m where m.id = p_message_id for update;
  end if;
  if message_row is null then raise exception 'Message not found'; end if;

  -- Triggers use this transaction-local marker to identify an admin API operation,
  -- instead of incorrectly attributing it to the original message author.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"campus_sync_admin_api"}', true);
  perform set_config('request.jwt.claim.role', 'campus_sync_admin_api', true);

  if p_message_table = 'class_chat_messages' then
    delete from public.class_chat_messages where id = p_message_id;
  else
    delete from public.school_chat_messages where id = p_message_id;
  end if;

  insert into public.chat_audit_logs (
    event_type, source_table, record_id, actor_user_id, actor_label,
    student_id, student_name, user_class, scope, scope_key,
    body, attachment_path, attachment_name, attachment_mime, reason, metadata
  ) values (
    'admin_message_deleted', p_message_table, p_message_id, null, 'admin_shared_password',
    message_row ->> 'student_id', message_row ->> 'student_name',
    coalesce(message_row ->> 'class_name', message_row ->> 'user_class'),
    case when p_message_table = 'class_chat_messages' then 'class' else message_row ->> 'scope' end,
    coalesce(message_row ->> 'class_name', message_row ->> 'scope_key'),
    message_row ->> 'body', message_row ->> 'attachment_path',
    message_row ->> 'attachment_name', message_row ->> 'attachment_mime',
    btrim(p_reason),
    jsonb_build_object('moderation_action', 'delete_message', 'deleted_at', occurred_time)
  );

  return jsonb_build_object('success', true, 'message_id', p_message_id, 'deleted_at', occurred_time);
end
$function$;

create or replace function public.admin_update_chat_report(
  p_report_id uuid,
  p_status text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_report public.chat_message_reports%rowtype;
  updated_report public.chat_message_reports%rowtype;
  note_text text := btrim(coalesce(p_note, ''));
  changed_time timestamptz := clock_timestamp();
begin
  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;
  if char_length(note_text) > 500 then raise exception 'Moderator note must be at most 500 characters'; end if;

  select * into old_report from public.chat_message_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"campus_sync_admin_api"}', true);
  perform set_config('request.jwt.claim.role', 'campus_sync_admin_api', true);

  update public.chat_message_reports
  set status = p_status,
      reviewed_at = case when p_status in ('resolved', 'dismissed') then changed_time else null end,
      reviewed_by = null
  where id = p_report_id
  returning * into updated_report;

  insert into public.chat_audit_logs (
    event_type, source_table, record_id, actor_user_id, actor_label,
    reason, details, status, previous_status, metadata
  ) values (
    'admin_report_status_changed', 'chat_message_reports', p_report_id, null,
    'admin_shared_password', '対応状態を変更: ' || p_status, nullif(note_text, ''),
    updated_report.status, old_report.status,
    jsonb_build_object(
      'message_id', updated_report.message_id,
      'message_table', updated_report.message_table,
      'reporter_user_id', updated_report.reporter_user_id,
      'report_reason', updated_report.reason
    )
  );

  return jsonb_build_object('report', to_jsonb(updated_report));
end
$function$;

revoke all on function public.capture_chat_report_snapshot() from public, anon, authenticated;
revoke all on function public.audit_chat_message_change() from public, anon, authenticated;
revoke all on function public.audit_chat_report_change() from public, anon, authenticated;
revoke all on function public.admin_delete_chat_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_chat_report(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_delete_chat_message(uuid, text, text) to service_role;
grant execute on function public.admin_update_chat_report(uuid, text, text) to service_role;
