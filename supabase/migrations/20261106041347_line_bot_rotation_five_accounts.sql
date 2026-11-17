-- Expand CampusSync LINE BOT rotation from 3 to 5 accounts.
-- Periods are balanced across the actual number of days in each JST month.
-- Examples: 30 days => 6 days each; 31 days => 6,6,6,6,7 days.

alter table public.line_bot_rotation
  drop constraint if exists line_bot_rotation_active_bot_slot_check;
alter table public.line_bot_rotation
  add constraint line_bot_rotation_active_bot_slot_check
  check (active_bot_slot between 1 and 5);

alter table public.line_bot_rotation_events
  drop constraint if exists line_bot_rotation_events_previous_bot_slot_check;
alter table public.line_bot_rotation_events
  add constraint line_bot_rotation_events_previous_bot_slot_check
  check (previous_bot_slot between 1 and 5);

alter table public.line_bot_rotation_events
  drop constraint if exists line_bot_rotation_events_new_bot_slot_check;
alter table public.line_bot_rotation_events
  add constraint line_bot_rotation_events_new_bot_slot_check
  check (new_bot_slot between 1 and 5);

alter table public.line_group_chats
  drop constraint if exists line_group_chats_bot_slot_check;
alter table public.line_group_chats
  add constraint line_group_chats_bot_slot_check
  check (bot_slot is null or bot_slot between 1 and 5) not valid;
alter table public.line_group_chats
  validate constraint line_group_chats_bot_slot_check;

alter table public.line_group_delivery_logs
  drop constraint if exists line_group_delivery_logs_bot_slot_check;
alter table public.line_group_delivery_logs
  add constraint line_group_delivery_logs_bot_slot_check
  check (bot_slot is null or bot_slot between 1 and 5) not valid;
alter table public.line_group_delivery_logs
  validate constraint line_group_delivery_logs_bot_slot_check;

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
    -- Preserve the previously configured one-time hold without changing the active account.
    v_slot := v_previous_slot;
    v_next_date := v_hold_until + 1;
  else
    -- Slot = ceil(day * 5 / days_in_month), so each BOT receives a near-equal block.
    v_slot := least(5, ceil(v_day * 5.0 / v_days_in_month)::integer)::smallint;

    if v_slot < 5 then
      -- First day of the next slot: floor(slot * days_in_month / 5) + 1.
      v_next_date := v_month_start + floor(v_slot * v_days_in_month / 5.0)::integer;
    else
      v_next_date := (v_month_start + interval '1 month')::date;
    end if;
  end if;

  v_next_switch := (v_next_date + time '09:00') at time zone 'Asia/Tokyo';

  if not found then
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

revoke all on function public.campussync_refresh_line_bot_rotation() from public, anon, authenticated;
grant execute on function public.campussync_refresh_line_bot_rotation() to service_role;

-- Keep the existing daily JST rotation job; reschedule through pg_cron APIs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-line-bot-rotation';

select cron.schedule(
  'campussync-line-bot-rotation',
  '55 23 * * *',
  $cron$
    select public.campussync_refresh_line_bot_rotation();
  $cron$
);
;
