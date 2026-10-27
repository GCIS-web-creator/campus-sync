-- CampusSync Phase 5 read-only preflight.
-- Run this FIRST in the Supabase SQL Editor. It does not modify data or schema.
-- Review every "要確認" row before running class-chat-phase5-audit.sql.

with checks(check_name, ok, details) as (
  select
    'Phase 1: class_chat_messages table',
    to_regclass('public.class_chat_messages') is not null,
    coalesce(to_regclass('public.class_chat_messages')::text, 'テーブルがありません')
  union all
  select
    'Phase 2: school_chat_messages table',
    to_regclass('public.school_chat_messages') is not null,
    coalesce(to_regclass('public.school_chat_messages')::text, 'テーブルがありません')
  union all
  select
    'Phase 3: chat_message_reports table',
    to_regclass('public.chat_message_reports') is not null,
    coalesce(to_regclass('public.chat_message_reports')::text, 'テーブルがありません')
  union all
  select
    'Phase 4: attachment columns on both message tables',
    to_regclass('public.class_chat_messages') is not null
      and to_regclass('public.school_chat_messages') is not null
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='class_chat_messages' and column_name='attachment_path')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='class_chat_messages' and column_name='attachment_name')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='class_chat_messages' and column_name='attachment_mime')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_chat_messages' and column_name='attachment_path')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_chat_messages' and column_name='attachment_name')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_chat_messages' and column_name='attachment_mime'),
    'attachment_path / attachment_name / attachment_mime'
  union all
  select
    'Phase 5: chat_audit_logs table',
    to_regclass('public.chat_audit_logs') is not null,
    coalesce(to_regclass('public.chat_audit_logs')::text, 'Phase 5未適用なら、まだ存在しなくて正常')
  union all
  select
    'Report snapshot column',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='chat_message_reports' and column_name='message_snapshot'),
    'chat_message_reports.message_snapshot'
  union all
  select
    'Audit table RLS enabled',
    exists (select 1 from pg_class where oid=to_regclass('public.chat_audit_logs') and relrowsecurity),
    'chat_audit_logs.relrowsecurity'
  union all
  select
    'Message audit triggers',
    (select count(*) = 2 from pg_trigger t where not t.tgisinternal and t.tgname in ('audit_class_chat_message_changes','audit_school_chat_message_changes') and t.tgrelid in (to_regclass('public.class_chat_messages'),to_regclass('public.school_chat_messages'))),
    'audit_class_chat_message_changes / audit_school_chat_message_changes'
  union all
  select
    'Reaction audit trigger',
    exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname='audit_class_chat_reaction_changes' and t.tgrelid=to_regclass('public.class_chat_reactions')),
    'audit_class_chat_reaction_changes'
  union all
  select
    'Report snapshot trigger',
    exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname='capture_chat_report_snapshot_before_write' and t.tgrelid=to_regclass('public.chat_message_reports')),
    'capture_chat_report_snapshot_before_write'
  union all
  select
    'Report audit trigger',
    exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname='audit_chat_report_changes' and t.tgrelid=to_regclass('public.chat_message_reports')),
    'audit_chat_report_changes'
  union all
  select
    'Atomic admin delete RPC',
    to_regprocedure('public.admin_delete_chat_message(uuid,text,text)') is not null,
    'public.admin_delete_chat_message(uuid,text,text)'
  union all
  select
    'Atomic admin report update RPC',
    to_regprocedure('public.admin_update_chat_report(uuid,text,text)') is not null,
    'public.admin_update_chat_report(uuid,text,text)'
  union all
  select
    'Service role can read audit table',
    case when to_regclass('public.chat_audit_logs') is not null and to_regrole('service_role') is not null
      then has_table_privilege('service_role','public.chat_audit_logs','SELECT')
      else false end,
    'service_role SELECT privilege'
  union all
  select
    'Service role can insert audit table',
    case when to_regclass('public.chat_audit_logs') is not null and to_regrole('service_role') is not null
      then has_table_privilege('service_role','public.chat_audit_logs','INSERT')
      else false end,
    'service_role INSERT privilege'
  union all
  select
    'Anonymous users cannot read audit table',
    case when to_regclass('public.chat_audit_logs') is not null and to_regrole('anon') is not null
      then not has_table_privilege('anon','public.chat_audit_logs','SELECT')
      else false end,
    'anon SELECT must be false'
)
select
  case when ok then 'OK' else '要確認' end as result,
  check_name,
  details
from checks
order by case when ok then 1 else 0 end, check_name;
