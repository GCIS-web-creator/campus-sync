-- CampusSync: 2026-11-01のBOT切替を今回だけスキップ
-- 実行後はBOT 3を2026-11-10まで維持し、2026-11-11 09:00 JSTに通常ルールのBOT 2へ切り替えます。
-- 認証トークンやChannel Secretは扱いません。
-- 11月1日 08:55 JSTのCron実行より前に、Supabase SQL Editorで一度だけ実行してください。

alter table public.line_bot_rotation
  add column if not exists rotation_hold_until date;

create or replace function public.campussync_refresh_line_bot_rotation()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_day integer;
  v_slot smallint;
  v_next_date date;
  v_next_switch timestamptz;
  v_previous_slot smallint;
  v_hold_until date;
begin
  select active_bot_slot, rotation_hold_until
    into v_previous_slot, v_hold_until
    from public.line_bot_rotation
   where id = 1
   for update;

  if not found then
    v_day := extract(day from v_today)::integer;
    if v_day <= 10 then
      v_slot := 1;
      v_next_date := date_trunc('month', v_today)::date + 10;
    elsif v_day <= 20 then
      v_slot := 2;
      v_next_date := date_trunc('month', v_today)::date + 20;
    else
      v_slot := 3;
      v_next_date := (date_trunc('month', v_today) + interval '1 month')::date;
    end if;

    v_next_switch := (v_next_date + time '09:00') at time zone 'Asia/Tokyo';
    insert into public.line_bot_rotation (
      id, active_bot_slot, next_switch_at, last_switched_at, updated_at
    ) values (
      1, v_slot, v_next_switch, now(), now()
    );
    insert into public.line_bot_rotation_events (
      previous_bot_slot, new_bot_slot, effective_date
    ) values (
      null, v_slot, v_today
    );
    return;
  end if;

  if v_hold_until is not null and v_today <= v_hold_until then
    -- One-time exception: keep the current BOT through the configured date.
    v_slot := v_previous_slot;
    v_next_date := v_hold_until + 1;
  else
    v_day := extract(day from v_today)::integer;
    if v_day <= 10 then
      v_slot := 1;
      v_next_date := date_trunc('month', v_today)::date + 10;
    elsif v_day <= 20 then
      v_slot := 2;
      v_next_date := date_trunc('month', v_today)::date + 20;
    else
      v_slot := 3;
      v_next_date := (date_trunc('month', v_today) + interval '1 month')::date;
    end if;
  end if;

  v_next_switch := (v_next_date + time '09:00') at time zone 'Asia/Tokyo';

  if v_previous_slot is distinct from v_slot then
    update public.line_bot_rotation
       set active_bot_slot = v_slot,
           next_switch_at = v_next_switch,
           rotation_hold_until = case when v_hold_until is not null and v_today > v_hold_until then null else v_hold_until end,
           last_switched_at = now(),
           updated_at = now()
     where id = 1;

    insert into public.line_bot_rotation_events (
      previous_bot_slot, new_bot_slot, effective_date
    ) values (
      v_previous_slot, v_slot, v_today
    );
  else
    update public.line_bot_rotation
       set next_switch_at = v_next_switch,
           rotation_hold_until = case when v_hold_until is not null and v_today > v_hold_until then null else v_hold_until end,
           updated_at = now()
     where id = 1;
  end if;
end;
$function$;

do $$
declare
  v_current_slot smallint;
begin
  select active_bot_slot
    into v_current_slot
    from public.line_bot_rotation
   where id = 1
   for update;

  if v_current_slot is distinct from 3 then
    raise exception 'BOT切替延期を適用できません。現在のactive_bot_slotは3ではありません（現在値: %）。先にAdminパネルで現在のBOTを確認してください。', v_current_slot;
  end if;

  update public.line_bot_rotation
     set rotation_hold_until = date '2026-11-10',
         next_switch_at = (date '2026-11-11' + time '09:00') at time zone 'Asia/Tokyo',
         updated_at = now()
   where id = 1;
end;
$$;

select
  active_bot_slot,
  rotation_hold_until,
  next_switch_at,
  last_switched_at,
  updated_at
from public.line_bot_rotation
where id = 1;
