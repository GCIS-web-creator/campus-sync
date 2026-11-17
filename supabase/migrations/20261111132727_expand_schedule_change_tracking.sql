create or replace function public.campussync_log_assignment_schedule_change()
returns trigger
language plpgsql
as $$
declare
  changed_parts text[] := array[]::text[];
  change_action text := 'updated';
begin
  if old.title is distinct from new.title then changed_parts := array_append(changed_parts, '課題名'); end if;
  if old.details is distinct from new.details then changed_parts := array_append(changed_parts, '課題内容'); end if;
  if old.source is distinct from new.source then changed_parts := array_append(changed_parts, '登録元'); end if;
  if old.type is distinct from new.type then changed_parts := array_append(changed_parts, '課題種別'); end if;
  if old.subject is distinct from new.subject then changed_parts := array_append(changed_parts, '教科'); end if;
  if old.subject_option is distinct from new.subject_option then changed_parts := array_append(changed_parts, '選択科目'); end if;
  if old.target_class is distinct from new.target_class then changed_parts := array_append(changed_parts, '対象クラス'); end if;
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
    jsonb_build_object('title', old.title, 'details', old.details, 'source', old.source, 'type', old.type, 'subject', old.subject, 'subject_option', old.subject_option, 'target_class', old.target_class, 'due_at', old.due_at, 'priority', old.priority, 'is_active', old.is_active),
    jsonb_build_object('title', new.title, 'details', new.details, 'source', new.source, 'type', new.type, 'subject', new.subject, 'subject_option', new.subject_option, 'target_class', new.target_class, 'due_at', new.due_at, 'priority', new.priority, 'is_active', new.is_active)
  );
  return new;
end;
$$;
alter function public.campussync_log_assignment_schedule_change() set search_path = '';

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
        jsonb_build_object('subject', new.subject, 'test_date', new.test_date, 'period', new.period, 'start_note', new.start_note, 'duration_minutes', new.duration_minutes, 'target_class', new.target_class, 'scope', new.scope, 'notes', new.notes, 'question_count', new.question_count, 'full_score', new.full_score, 'priority', new.priority)
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

  if old.subject is distinct from new.subject then changed_parts := array_append(changed_parts, '教科'); end if;
  if old.test_date is distinct from new.test_date then changed_parts := array_append(changed_parts, '実施日'); end if;
  if old.period is distinct from new.period then changed_parts := array_append(changed_parts, '時限'); end if;
  if old.start_note is distinct from new.start_note then changed_parts := array_append(changed_parts, '開始タイミング'); end if;
  if old.duration_minutes is distinct from new.duration_minutes then changed_parts := array_append(changed_parts, '所要時間'); end if;
  if old.title is distinct from new.title then changed_parts := array_append(changed_parts, 'テスト名'); end if;
  if old.scope is distinct from new.scope then changed_parts := array_append(changed_parts, '試験範囲'); end if;
  if old.notes is distinct from new.notes then changed_parts := array_append(changed_parts, '出題内容'); end if;
  if old.question_count is distinct from new.question_count then changed_parts := array_append(changed_parts, '問題数'); end if;
  if old.full_score is distinct from new.full_score then changed_parts := array_append(changed_parts, '満点'); end if;
  if old.target_class is distinct from new.target_class then changed_parts := array_append(changed_parts, '対象'); end if;
  if old.priority is distinct from new.priority then changed_parts := array_append(changed_parts, '重要度'); end if;
  if cardinality(changed_parts) = 0 then return new; end if;

  insert into public.campussync_schedule_change_events
    (entity_type, entity_id, action, title, subject, priority, summary, previous_value, next_value)
  values (
    'mini_test', new.id, change_action, new.title, new.subject, new.priority,
    array_to_string(changed_parts, '・') || 'しました。',
    jsonb_build_object('subject', old.subject, 'test_date', old.test_date, 'period', old.period, 'start_note', old.start_note, 'duration_minutes', old.duration_minutes, 'title', old.title, 'scope', old.scope, 'notes', old.notes, 'question_count', old.question_count, 'full_score', old.full_score, 'target_class', old.target_class, 'priority', old.priority, 'status', old.status),
    jsonb_build_object('subject', new.subject, 'test_date', new.test_date, 'period', new.period, 'start_note', new.start_note, 'duration_minutes', new.duration_minutes, 'title', new.title, 'scope', new.scope, 'notes', new.notes, 'question_count', new.question_count, 'full_score', new.full_score, 'target_class', new.target_class, 'priority', new.priority, 'status', new.status)
  );
  return new;
end;
$$;
alter function public.campussync_log_mini_test_schedule_change() set search_path = '';
