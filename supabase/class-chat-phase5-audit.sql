-- CampusSync Phase 5: append-only chat audit trail for moderation and export.
-- Run after class-chat.sql, class-chat-phase2.sql and class-chat-phase3.sql.
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
    'admin_report_status_changed'
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

create index if not exists chat_audit_logs_time_idx
  on public.chat_audit_logs(occurred_at desc, id desc);
create index if not exists chat_audit_logs_record_idx
  on public.chat_audit_logs(source_table, record_id, occurred_at desc);
create index if not exists chat_audit_logs_actor_idx
  on public.chat_audit_logs(actor_user_id, occurred_at desc);

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
  actor_sub text;
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

  actor_sub := nullif(current_setting('request.jwt.claim.sub', true), '');
  if actor_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    actor_id := actor_sub::uuid;
    actor_text := 'authenticated_user';
  else
    actor_id := null;
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
    coalesce(actor_id, nullif(chosen_row ->> 'user_id', '')::uuid),
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

create or replace function public.audit_chat_report_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_sub text;
  actor_id uuid;
  actor_text text;
begin
  actor_sub := nullif(current_setting('request.jwt.claim.sub', true), '');
  if actor_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    actor_id := actor_sub::uuid;
    actor_text := 'authenticated_user';
  else
    actor_id := null;
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
      jsonb_build_object('message_id', new.message_id, 'message_table', new.message_table)
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
