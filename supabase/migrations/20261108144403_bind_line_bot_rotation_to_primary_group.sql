-- Bind LINE BOT handoff confirmation to the exact registered school group.
-- Preserve the current active BOT's sole group ID, without returning that ID to the browser.

begin;

alter table public.line_bot_rotation
  add column if not exists handoff_group_chat_id text;

update public.line_bot_rotation r
   set handoff_group_chat_id = candidates.chat_id,
       updated_at = now()
  from (
    select min(chat_id) as chat_id, bot_slot
      from public.line_group_chats
     where active = true
       and chat_type = 'group'
     group by bot_slot
    having count(*) = 1
  ) candidates
 where r.id = 1
   and candidates.bot_slot = r.active_bot_slot
   and r.handoff_group_chat_id is null;

revoke all on function public.campussync_manual_line_bot_switch(smallint, smallint, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.campussync_manual_line_bot_switch(
  p_expected_current_bot_slot smallint,
  p_expected_new_bot_slot smallint,
  p_expected_next_switch_at timestamptz,
  p_expected_group_chat_id text,
  p_group_confirmed_at timestamptz
)
returns table (
  event_id bigint,
  previous_bot_slot smallint,
  new_bot_slot smallint,
  effective_date date,
  next_switch_at timestamptz,
  notice_retry_key uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_previous_slot smallint;
  v_scheduled_at timestamptz;
  v_bound_group_id text;
  v_switch_date date;
  v_month_start date;
  v_days_in_month integer;
  v_day integer;
  v_period integer;
  v_expected_slot smallint;
  v_next_date date;
  v_next_switch timestamptz;
  v_event_id bigint;
  v_retry_key uuid;
begin
  if p_group_confirmed_at is null then
    raise exception 'グループの入退室確認が必要です。';
  end if;
  if p_expected_group_chat_id is null or btrim(p_expected_group_chat_id) = '' then
    raise exception '切替対象のグループが登録されていません。';
  end if;
  if p_expected_current_bot_slot not between 1 and 5
     or p_expected_new_bot_slot not between 1 and 5
     or p_expected_current_bot_slot = p_expected_new_bot_slot then
    raise exception 'BOT番号が正しくありません。';
  end if;

  select r.active_bot_slot, r.next_switch_at, r.handoff_group_chat_id
    into v_previous_slot, v_scheduled_at, v_bound_group_id
    from public.line_bot_rotation r
   where r.id = 1
   for update;

  if not found then
    raise exception 'BOTローテーション設定がありません。';
  end if;
  if v_previous_slot is distinct from p_expected_current_bot_slot
     or v_scheduled_at is distinct from p_expected_next_switch_at then
    raise exception '切替予定が更新されています。画面を再読み込みしてください。';
  end if;
  if v_bound_group_id is distinct from p_expected_group_chat_id then
    raise exception '切替対象グループが更新されています。画面を再読み込みしてください。';
  end if;
  if now() < v_scheduled_at - interval '24 hours' then
    raise exception '手動切替ボタンは予定時刻の24時間前から使用できます。';
  end if;

  if not exists (
    select 1
      from public.line_group_chats g
     where g.chat_id = v_bound_group_id
       and g.chat_type = 'group'
       and g.bot_slot = p_expected_new_bot_slot
       and g.active = true
  ) then
    raise exception '登録済みの同じグループで新BOTのWebhook記録を確認できません。';
  end if;
  if exists (
    select 1
      from public.line_group_chats g
     where g.chat_type = 'group'
       and g.active = true
       and (g.chat_id <> v_bound_group_id or g.bot_slot <> p_expected_new_bot_slot)
  ) then
    raise exception '別のBOTまたは別のグループが有効です。接続状態を確認してください。';
  end if;

  v_switch_date := (v_scheduled_at at time zone 'Asia/Tokyo')::date;
  v_month_start := date_trunc('month', v_switch_date::timestamp)::date;
  v_days_in_month := extract(day from (v_month_start + interval '1 month' - interval '1 day'))::integer;
  v_day := extract(day from v_switch_date)::integer;
  v_period := least(5, ceil(v_day * 5.0 / v_days_in_month)::integer);
  v_expected_slot := (((v_period + 1) % 5) + 1)::smallint;

  if p_expected_new_bot_slot is distinct from v_expected_slot then
    raise exception '次回予定のBOT番号と一致しません。';
  end if;

  if v_period < 5 then
    v_next_date := v_month_start + floor(v_period * v_days_in_month / 5.0)::integer;
  else
    v_next_date := (v_month_start + interval '1 month')::date;
  end if;
  v_next_switch := (v_next_date + time '09:00') at time zone 'Asia/Tokyo';
  v_retry_key := gen_random_uuid();

  update public.line_bot_rotation
     set active_bot_slot = p_expected_new_bot_slot,
         next_switch_at = v_next_switch,
         rotation_hold_until = null,
         last_switched_at = now(),
         updated_at = now()
   where id = 1;

  insert into public.line_bot_rotation_events (
    previous_bot_slot,
    new_bot_slot,
    effective_date,
    acknowledged_at,
    switch_mode,
    group_confirmed_at,
    notice_status,
    notice_retry_key
  ) values (
    v_previous_slot,
    p_expected_new_bot_slot,
    v_switch_date,
    now(),
    'manual',
    p_group_confirmed_at,
    'pending',
    v_retry_key
  )
  returning id into v_event_id;

  return query
    select v_event_id, v_previous_slot, p_expected_new_bot_slot,
           v_switch_date, v_next_switch, v_retry_key;
end;
$function$;

revoke all on function public.campussync_manual_line_bot_switch(smallint, smallint, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.campussync_manual_line_bot_switch(smallint, smallint, timestamptz, text, timestamptz)
  to service_role;

commit;
