-- Allow Pomodoro sessions to use a zero-minute break.
-- A zero break means there is no break-complete notification; only the focus end is queued.
create or replace function public.campussync_schedule_study_timer_notifications(
  p_schedule_id uuid,
  p_user_id uuid,
  p_student_id text,
  p_phase text,
  p_remaining_seconds integer,
  p_break_seconds integer default 0
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, campus_private
as $function$
declare
  v_enabled boolean := true;
  v_focus_at timestamptz;
  v_break_at timestamptz;
  v_event_key text;
  v_count integer := 0;
  v_rows integer := 0;
begin
  if p_schedule_id is null or p_user_id is null then raise exception 'Timer schedule owner and id are required'; end if;
  if p_phase not in ('focus', 'break') then raise exception 'Unsupported timer phase'; end if;
  if p_remaining_seconds < 1 or p_remaining_seconds > 21600 then raise exception 'Remaining time must be between 1 second and 6 hours'; end if;
  if p_break_seconds is null or p_break_seconds < 0 or p_break_seconds > 10800 then
    raise exception 'Break time must be between 0 seconds and 3 hours';
  end if;

  select coalesce((notification_settings ->> 'study_timer')::boolean, true)
  into v_enabled from public.push_reminder_preferences where user_id = p_user_id;
  if not found then v_enabled := true; end if;
  if v_enabled is not true then return 0; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = p_user_id) then return 0; end if;

  if p_phase = 'focus' then
    v_focus_at := clock_timestamp() + make_interval(secs => p_remaining_seconds);
    v_event_key := 'study-timer:' || p_schedule_id::text || ':focus';
    insert into campus_private.push_notification_outbox
      (event_key,user_id,student_id,category,title,body,url,priority,tag,available_at)
    values
      (v_event_key,p_user_id,coalesce(p_student_id,''),'study_timer','集中時間が終了しました',
       '集中セットが終わりました。少し休憩しましょう。','/#study','urgent',
       'cs-'||left(md5(v_event_key),24),v_focus_at)
    on conflict (event_key,user_id) do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;

    if p_break_seconds > 0 then
      v_break_at := v_focus_at + make_interval(secs => p_break_seconds);
      v_event_key := 'study-timer:' || p_schedule_id::text || ':break';
      insert into campus_private.push_notification_outbox
        (event_key,user_id,student_id,category,title,body,url,priority,tag,available_at)
      values
        (v_event_key,p_user_id,coalesce(p_student_id,''),'study_timer','休憩時間が終了しました',
         '休憩が終わりました。次の集中セットを始めましょう。','/#study','urgent',
         'cs-'||left(md5(v_event_key),24),v_break_at)
      on conflict (event_key,user_id) do nothing;
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
    end if;
  else
    v_break_at := clock_timestamp() + make_interval(secs => p_remaining_seconds);
    v_event_key := 'study-timer:' || p_schedule_id::text || ':break';
    insert into campus_private.push_notification_outbox
      (event_key,user_id,student_id,category,title,body,url,priority,tag,available_at)
    values
      (v_event_key,p_user_id,coalesce(p_student_id,''),'study_timer','休憩時間が終了しました',
       '休憩が終わりました。次の集中セットを始めましょう。','/#study','urgent',
       'cs-'||left(md5(v_event_key),24),v_break_at)
    on conflict (event_key,user_id) do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;

  return v_count;
end;
$function$;

revoke all on function public.campussync_schedule_study_timer_notifications(uuid,uuid,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.campussync_schedule_study_timer_notifications(uuid,uuid,text,text,integer,integer)
  to service_role;
