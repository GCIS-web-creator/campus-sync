begin;
alter table public.line_bot_rotation
  add column if not exists handoff_test_bot_slot smallint,
  add column if not exists handoff_test_next_switch_at timestamptz,
  add column if not exists handoff_test_status text not null default 'not_started',
  add column if not exists handoff_test_sent_at timestamptz,
  add column if not exists handoff_test_error text,
  add column if not exists handoff_test_retry_key uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.line_bot_rotation'::regclass
      and conname = 'line_bot_rotation_handoff_test_status_check'
  ) then
    alter table public.line_bot_rotation
      add constraint line_bot_rotation_handoff_test_status_check
      check (handoff_test_status in ('not_started', 'sending', 'sent', 'failed'));
  end if;
end;
$$;

comment on column public.line_bot_rotation.handoff_test_status is
  'BOT switch test-notice state. A successful test is required before the manual BOT switch.';
comment on column public.line_bot_rotation.handoff_test_retry_key is
  'LINE retry key used only for the next BOT Official Account broadcast test.';

create or replace function public.campussync_prepare_line_bot_handoff_test(
  p_expected_current_bot_slot smallint,
  p_expected_new_bot_slot smallint,
  p_expected_next_switch_at timestamptz,
  p_expected_group_chat_id text
)
returns table (test_retry_key uuid, already_sent boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_current_slot smallint;
  v_scheduled_at timestamptz;
  v_bound_group_id text;
  v_test_slot smallint;
  v_test_switch_at timestamptz;
  v_test_status text;
  v_test_sent_at timestamptz;
  v_test_retry_key uuid;
  v_switch_date date;
  v_month_start date;
  v_days_in_month integer;
  v_day integer;
  v_period integer;
  v_expected_slot smallint;
begin
  if p_expected_current_bot_slot not between 1 and 5
     or p_expected_new_bot_slot not between 1 and 5
     or p_expected_current_bot_slot = p_expected_new_bot_slot then
    raise exception 'BOT番号が正しくありません。';
  end if;
  if p_expected_group_chat_id is null or btrim(p_expected_group_chat_id) = '' then
    raise exception '切替対象のグループが登録されていません。';
  end if;

  select r.active_bot_slot, r.next_switch_at, r.handoff_group_chat_id,
         r.handoff_test_bot_slot, r.handoff_test_next_switch_at,
         r.handoff_test_status, r.handoff_test_sent_at, r.handoff_test_retry_key
    into v_current_slot, v_scheduled_at, v_bound_group_id,
         v_test_slot, v_test_switch_at, v_test_status, v_test_sent_at, v_test_retry_key
    from public.line_bot_rotation r
   where r.id = 1
   for update;

  if not found then
    raise exception 'BOTローテーション設定がありません。';
  end if;
  if v_current_slot is distinct from p_expected_current_bot_slot
     or v_scheduled_at is distinct from p_expected_next_switch_at then
    raise exception '切替予定が更新されています。画面を再読み込みしてください。';
  end if;
  if v_bound_group_id is distinct from p_expected_group_chat_id then
    raise exception '切替対象グループが更新されています。画面を再読み込みしてください。';
  end if;
  if now() < v_scheduled_at - interval '24 hours' then
    raise exception '公式アカウント通知テストは切替予定の24時間前から利用できます。';
  end if;

  if not exists (
    select 1 from public.line_group_chats g
     where g.chat_id = v_bound_group_id
       and g.chat_type = 'group'
       and g.bot_slot = p_expected_new_bot_slot
       and g.active = true
  ) then
    raise exception '登録済みグループでBOT % の参加記録を確認できません。先にグループ参加状態を更新してください。', p_expected_new_bot_slot;
  end if;
  if exists (
    select 1 from public.line_group_chats g
     where g.chat_type = 'group'
       and g.active = true
       and (g.chat_id <> v_bound_group_id or g.bot_slot <> p_expected_new_bot_slot)
  ) then
    raise exception '別のBOTまたは別のグループが有効です。グループ状態を確認してください。';
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

  if v_test_status = 'sent'
     and v_test_slot = p_expected_new_bot_slot
     and v_test_switch_at = v_scheduled_at
     and v_test_sent_at is not null
     and v_test_retry_key is not null then
    return query select v_test_retry_key, true;
    return;
  end if;

  if v_test_slot is distinct from p_expected_new_bot_slot
     or v_test_switch_at is distinct from v_scheduled_at
     or v_test_retry_key is null then
    v_test_retry_key := gen_random_uuid();
  end if;

  update public.line_bot_rotation
     set handoff_test_bot_slot = p_expected_new_bot_slot,
         handoff_test_next_switch_at = v_scheduled_at,
         handoff_test_status = 'sending',
         handoff_test_sent_at = null,
         handoff_test_error = null,
         handoff_test_retry_key = v_test_retry_key,
         updated_at = now()
   where id = 1;

  return query select v_test_retry_key, false;
end;
$function$;

revoke all on function public.campussync_prepare_line_bot_handoff_test(smallint, smallint, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.campussync_prepare_line_bot_handoff_test(smallint, smallint, timestamptz, text)
  to service_role;

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
  v_test_slot smallint;
  v_test_switch_at timestamptz;
  v_test_status text;
  v_test_sent_at timestamptz;
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

  select r.active_bot_slot, r.next_switch_at, r.handoff_group_chat_id,
         r.handoff_test_bot_slot, r.handoff_test_next_switch_at,
         r.handoff_test_status, r.handoff_test_sent_at
    into v_previous_slot, v_scheduled_at, v_bound_group_id,
         v_test_slot, v_test_switch_at, v_test_status, v_test_sent_at
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
    select 1 from public.line_group_chats g
     where g.chat_id = v_bound_group_id
       and g.chat_type = 'group'
       and g.bot_slot = p_expected_new_bot_slot
       and g.active = true
  ) then
    raise exception '登録済みの同じグループで新BOTのWebhook記録を確認できません。';
  end if;
  if exists (
    select 1 from public.line_group_chats g
     where g.chat_type = 'group'
       and g.active = true
       and (g.chat_id <> v_bound_group_id or g.bot_slot <> p_expected_new_bot_slot)
  ) then
    raise exception '別のBOTまたは別のグループが有効です。接続状態を確認してください。';
  end if;

  if v_test_status is distinct from 'sent'
     or v_test_slot is distinct from p_expected_new_bot_slot
     or v_test_switch_at is distinct from v_scheduled_at
     or v_test_sent_at is null then
    raise exception '切替先BOTの公式アカウント通知テストが未完了です。先にテスト通知を送信してください。';
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
         handoff_test_bot_slot = null,
         handoff_test_next_switch_at = null,
         handoff_test_status = 'not_started',
         handoff_test_sent_at = null,
         handoff_test_error = null,
         handoff_test_retry_key = null,
         updated_at = now()
   where id = 1;

  insert into public.line_bot_rotation_events (
    previous_bot_slot, new_bot_slot, effective_date, acknowledged_at,
    switch_mode, group_confirmed_at, notice_status, notice_retry_key
  ) values (
    v_previous_slot, p_expected_new_bot_slot, v_switch_date, now(),
    'manual', p_group_confirmed_at, 'pending', v_retry_key
  )
  returning id into v_event_id;

  return query select v_event_id, v_previous_slot, p_expected_new_bot_slot,
    v_switch_date, v_next_switch, v_retry_key;
end;
$function$;

revoke all on function public.campussync_manual_line_bot_switch(smallint, smallint, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.campussync_manual_line_bot_switch(smallint, smallint, timestamptz, text, timestamptz)
  to service_role;

commit;
