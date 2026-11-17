-- Require a verified group membership handoff before switching the active LINE delivery BOT.
-- The old BOT remains active until the new BOT has joined and its signed webhook event
-- has updated line_group_chats. A manual Admin action then switches the delivery slot
-- and sends a completion notice to the new official account's friends only.

begin;

alter table public.line_bot_rotation_events
  add column if not exists switch_mode text not null default 'scheduled',
  add column if not exists group_confirmed_at timestamptz,
  add column if not exists notice_status text not null default 'not_required',
  add column if not exists notice_sent_at timestamptz,
  add column if not exists notice_error text,
  add column if not exists notice_retry_key uuid;

alter table public.line_bot_rotation_events
  drop constraint if exists line_bot_rotation_events_switch_mode_check;
alter table public.line_bot_rotation_events
  add constraint line_bot_rotation_events_switch_mode_check
  check (switch_mode in ('scheduled', 'manual'));

alter table public.line_bot_rotation_events
  drop constraint if exists line_bot_rotation_events_notice_status_check;
alter table public.line_bot_rotation_events
  add constraint line_bot_rotation_events_notice_status_check
  check (notice_status in ('not_required', 'pending', 'sent', 'failed'));

create unique index if not exists line_bot_rotation_events_notice_retry_key_uidx
  on public.line_bot_rotation_events (notice_retry_key)
  where notice_retry_key is not null;

create index if not exists line_bot_rotation_events_notice_pending_idx
  on public.line_bot_rotation_events (created_at desc)
  where switch_mode = 'manual' and notice_status in ('pending', 'failed');

-- Atomic state transition. This is callable only with service_role credentials.
create or replace function public.campussync_manual_line_bot_switch(
  p_expected_current_bot_slot smallint,
  p_expected_new_bot_slot smallint,
  p_expected_next_switch_at timestamptz,
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
  if p_expected_current_bot_slot not between 1 and 5
     or p_expected_new_bot_slot not between 1 and 5
     or p_expected_current_bot_slot = p_expected_new_bot_slot then
    raise exception 'BOT番号が正しくありません。';
  end if;

  select r.active_bot_slot, r.next_switch_at
    into v_previous_slot, v_scheduled_at
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
  if now() < v_scheduled_at - interval '24 hours' then
    raise exception '手動切替ボタンは予定時刻の24時間前から使用できます。';
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

revoke all on function public.campussync_manual_line_bot_switch(smallint, smallint, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.campussync_manual_line_bot_switch(smallint, smallint, timestamptz, timestamptz)
  to service_role;

-- Keep the active BOT unchanged when the scheduled rotation date arrives.
-- Admin's manual confirmation performs the slot transition only after the new
-- BOT's signed LINE webhook has confirmed group membership.
create or replace function public.campussync_refresh_line_bot_rotation()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_month_start date;
  v_days_in_month integer;
  v_day integer;
  v_period integer;
  v_slot smallint;
  v_next_date date;
  v_next_switch timestamptz;
  v_previous_slot smallint;
  v_hold_until date;
begin
  v_month_start := date_trunc('month', v_today::timestamp)::date;
  v_days_in_month := extract(day from (v_month_start + interval '1 month' - interval '1 day'))::integer;

  select active_bot_slot, rotation_hold_until
    into v_previous_slot, v_hold_until
    from public.line_bot_rotation
   where id = 1
   for update;

  v_day := extract(day from v_today)::integer;

  if v_hold_until is not null and v_today <= v_hold_until then
    v_slot := v_previous_slot;
    v_next_date := v_hold_until + 1;
  else
    v_period := least(5, ceil(v_day * 5.0 / v_days_in_month)::integer);
    if v_period < 5 then
      v_next_date := v_month_start + floor(v_period * v_days_in_month / 5.0)::integer;
    else
      v_next_date := (v_month_start + interval '1 month')::date;
    end if;
    v_slot := (((v_period + 1) % 5) + 1)::smallint;
  end if;

  v_next_switch := (v_next_date + time '09:00') at time zone 'Asia/Tokyo';

  if not found then
    insert into public.line_bot_rotation (
      id, active_bot_slot, next_switch_at, last_switched_at, updated_at
    ) values (
      1, v_slot, v_next_switch, now(), now()
    );
    insert into public.line_bot_rotation_events (
      previous_bot_slot, new_bot_slot, effective_date, switch_mode, notice_status
    ) values (
      null, v_slot, v_today, 'scheduled', 'not_required'
    );
    return;
  end if;

  if v_previous_slot is distinct from v_slot then
    -- Do not pre-emptively change the delivery BOT. Keep the due date visible in
    -- Admin until the operator confirms the old BOT left and the new BOT joined.
    update public.line_bot_rotation
       set rotation_hold_until = case
             when v_hold_until is not null and v_today > v_hold_until then null
             else v_hold_until
           end,
           updated_at = now()
     where id = 1;
    return;
  end if;

  update public.line_bot_rotation
     set next_switch_at = v_next_switch,
         rotation_hold_until = case
           when v_hold_until is not null and v_today > v_hold_until then null
           else v_hold_until
         end,
         updated_at = now()
   where id = 1;
end;
$function$;

revoke all on function public.campussync_refresh_line_bot_rotation() from public, anon, authenticated;
grant execute on function public.campussync_refresh_line_bot_rotation() to service_role;

commit;
