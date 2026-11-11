-- CampusSync assignment/exam/mini-test priority and scheduled change digest.
alter table public.assignments
  add column if not exists priority text not null default 'normal';
alter table public.assignment_suggestions
  add column if not exists priority text not null default 'normal';
alter table public.school_test_exams
  add column if not exists priority text not null default 'normal';
alter table public.mini_test_events
  add column if not exists priority text not null default 'normal';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_priority_check') then
    alter table public.assignments add constraint assignments_priority_check check (priority in ('normal','important','urgent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assignment_suggestions_priority_check') then
    alter table public.assignment_suggestions add constraint assignment_suggestions_priority_check check (priority in ('normal','important','urgent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_test_exams_priority_check') then
    alter table public.school_test_exams add constraint school_test_exams_priority_check check (priority in ('normal','important','urgent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mini_test_events_priority_check') then
    alter table public.mini_test_events add constraint mini_test_events_priority_check check (priority in ('normal','important','urgent'));
  end if;
end $$;

create table if not exists public.campussync_schedule_change_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('assignment','exam','mini_test')),
  entity_id uuid not null,
  action text not null check (action in ('created','updated','published','cancelled')),
  title text not null,
  subject text,
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  summary text not null,
  previous_value jsonb,
  next_value jsonb,
  reason text,
  created_at timestamptz not null default now(),
  digest_sent_at timestamptz
);

create index if not exists campussync_schedule_change_events_pending_idx
  on public.campussync_schedule_change_events (created_at desc)
  where digest_sent_at is null;
create index if not exists campussync_schedule_change_events_entity_idx
  on public.campussync_schedule_change_events (entity_type, entity_id, created_at desc);

alter table public.campussync_schedule_change_events enable row level security;
revoke all on public.campussync_schedule_change_events from anon, authenticated;
grant select, insert, update, delete on public.campussync_schedule_change_events to service_role;

create or replace function public.campussync_log_assignment_schedule_change()
returns trigger
language plpgsql
as $$
declare
  changed_parts text[] := array[]::text[];
  change_action text := 'updated';
begin
  if old.title is distinct from new.title then changed_parts := array_append(changed_parts, '課題名'); end if;
  if old.due_at is distinct from new.due_at then changed_parts := array_append(changed_parts, '提出期限'); end if;
  if old.priority is distinct from new.priority then changed_parts := array_append(changed_parts, '重要度'); end if;
  if old.is_active is distinct from new.is_active then
    changed_parts := array_append(changed_parts, case when new.is_active then '再公開' else '非公開' end);
    if not new.is_active then change_action := 'cancelled'; end if;
  end if;
  if cardinality(changed_parts) = 0 then return new; end if;

  insert into public.campussync_schedule_change_events
    (entity_type, entity_id, action, title, subject, priority, summary, previous_value, next_value)
  values (
    'assignment', new.id, change_action, new.title, new.subject, new.priority,
    array_to_string(changed_parts, '・') || 'を変更しました。',
    jsonb_build_object('title', old.title, 'due_at', old.due_at, 'priority', old.priority, 'is_active', old.is_active),
    jsonb_build_object('title', new.title, 'due_at', new.due_at, 'priority', new.priority, 'is_active', new.is_active)
  );
  return new;
end;
$$;

create or replace function public.campussync_log_exam_schedule_change()
returns trigger
language plpgsql
as $$
declare
  changed_parts text[] := array[]::text[];
begin
  if tg_op = 'INSERT' then
    insert into public.campussync_schedule_change_events
      (entity_type, entity_id, action, title, priority, summary, next_value)
    values (
      'exam', new.id, 'created', new.exam_type, new.priority,
      new.school_year::text || '年度・' || new.term::text || '学期の' || new.exam_type || '日程を登録しました。',
      jsonb_build_object('school_year', new.school_year, 'term', new.term, 'exam_type', new.exam_type, 'start_date', new.start_date, 'end_date', new.end_date)
    );
    return new;
  end if;

  if old.start_date is distinct from new.start_date then changed_parts := array_append(changed_parts, '開始日'); end if;
  if old.end_date is distinct from new.end_date then changed_parts := array_append(changed_parts, '終了日'); end if;
  if old.exam_type is distinct from new.exam_type then changed_parts := array_append(changed_parts, '考査種別'); end if;
  if old.priority is distinct from new.priority then changed_parts := array_append(changed_parts, '重要度'); end if;
  if cardinality(changed_parts) = 0 then return new; end if;

  insert into public.campussync_schedule_change_events
    (entity_type, entity_id, action, title, priority, summary, previous_value, next_value)
  values (
    'exam', new.id, 'updated', new.exam_type, new.priority,
    array_to_string(changed_parts, '・') || 'を変更しました。',
    jsonb_build_object('school_year', old.school_year, 'term', old.term, 'exam_type', old.exam_type, 'start_date', old.start_date, 'end_date', old.end_date, 'priority', old.priority),
    jsonb_build_object('school_year', new.school_year, 'term', new.term, 'exam_type', new.exam_type, 'start_date', new.start_date, 'end_date', new.end_date, 'priority', new.priority)
  );
  return new;
end;
$$;

create or replace function public.campussync_log_mini_test_schedule_change()
returns trigger
language plpgsql
as $$
declare
  changed_parts text[] := array[]::text[];
  change_action text := 'updated';
begin
  if tg_op = 'INSERT' then
    if new.audience = 'school' and new.status = 'published' then
      insert into public.campussync_schedule_change_events
        (entity_type, entity_id, action, title, subject, priority, summary, next_value)
      values (
        'mini_test', new.id, 'published', new.title, new.subject, new.priority,
        '新しい小テストを公開しました。',
        jsonb_build_object('test_date', new.test_date, 'period', new.period, 'start_note', new.start_note, 'target_class', new.target_class, 'scope', new.scope)
      );
    end if;
    return new;
  end if;

  if new.audience <> 'school' then return new; end if;
  if old.status <> 'published' and new.status = 'published' then
    change_action := 'published';
    changed_parts := array_append(changed_parts, '公開');
  elsif old.status = 'published' and new.status = 'cancelled' then
    change_action := 'cancelled';
    changed_parts := array_append(changed_parts, '中止');
  elsif old.status <> 'published' and new.status <> 'published' then
    return new;
  end if;

  if old.test_date is distinct from new.test_date then changed_parts := array_append(changed_parts, '実施日'); end if;
  if old.period is distinct from new.period then changed_parts := array_append(changed_parts, '時限'); end if;
  if old.start_note is distinct from new.start_note then changed_parts := array_append(changed_parts, '開始タイミング'); end if;
  if old.title is distinct from new.title then changed_parts := array_append(changed_parts, 'テスト名'); end if;
  if old.scope is distinct from new.scope then changed_parts := array_append(changed_parts, '試験範囲'); end if;
  if old.priority is distinct from new.priority then changed_parts := array_append(changed_parts, '重要度'); end if;
  if cardinality(changed_parts) = 0 then return new; end if;

  insert into public.campussync_schedule_change_events
    (entity_type, entity_id, action, title, subject, priority, summary, previous_value, next_value)
  values (
    'mini_test', new.id, change_action, new.title, new.subject, new.priority,
    array_to_string(changed_parts, '・') || 'しました。',
    jsonb_build_object('test_date', old.test_date, 'period', old.period, 'start_note', old.start_note, 'title', old.title, 'scope', old.scope, 'priority', old.priority, 'status', old.status),
    jsonb_build_object('test_date', new.test_date, 'period', new.period, 'start_note', new.start_note, 'title', new.title, 'scope', new.scope, 'priority', new.priority, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists campussync_assignments_schedule_change on public.assignments;
create trigger campussync_assignments_schedule_change
  after update on public.assignments
  for each row execute function public.campussync_log_assignment_schedule_change();

drop trigger if exists campussync_exam_schedule_change on public.school_test_exams;
create trigger campussync_exam_schedule_change
  after insert or update on public.school_test_exams
  for each row execute function public.campussync_log_exam_schedule_change();

drop trigger if exists campussync_mini_test_schedule_change on public.mini_test_events;
create trigger campussync_mini_test_schedule_change
  after insert or update on public.mini_test_events
  for each row execute function public.campussync_log_mini_test_schedule_change();

revoke all on function public.campussync_log_assignment_schedule_change() from public, anon, authenticated;
revoke all on function public.campussync_log_exam_schedule_change() from public, anon, authenticated;
revoke all on function public.campussync_log_mini_test_schedule_change() from public, anon, authenticated;
grant execute on function public.campussync_log_assignment_schedule_change() to service_role;
grant execute on function public.campussync_log_exam_schedule_change() to service_role;
grant execute on function public.campussync_log_mini_test_schedule_change() to service_role;
