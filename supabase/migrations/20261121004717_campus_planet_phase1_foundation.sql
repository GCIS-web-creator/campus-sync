-- Phase 1: complete the CampusSync planet data foundation.
-- Additive-only migration: preserves existing planet, growth, XP and study records.
-- student_study_sessions is read-only evidence for verified learning activity.

alter table public.campus_planets
  add constraint campus_planets_id_user_unique unique (id, user_id);

alter table public.campus_planet_growth
  add column technical_level smallint not null default 0 check (technical_level between 0 and 5),
  add column social_level smallint not null default 0 check (social_level between 0 and 5),
  add column research_level smallint not null default 0 check (research_level between 0 and 5),
  add column nature_level smallint not null default 0 check (nature_level between 0 and 5),
  add column civilization_score bigint not null default 0 check (civilization_score >= 0),
  add column recalculated_at timestamptz;

alter table public.campus_planet_growth
  add constraint campus_planet_growth_planet_owner_fkey
  foreign key (planet_id, user_id)
  references public.campus_planets (id, user_id)
  on delete cascade;

alter table public.campus_xp_ledger
  add column entry_kind text not null default 'award'
    check (entry_kind in ('award', 'reversal', 'adjustment')),
  add column adjustment_direction text
    check (adjustment_direction is null or adjustment_direction in ('increase', 'decrease')),
  add column rule_version integer not null default 1
    check (rule_version > 0),
  add column reverses_entry_id uuid;

alter table public.campus_xp_ledger
  add constraint campus_xp_ledger_entry_shape_check
  check (
    (entry_kind = 'award'
      and adjustment_direction is null
      and reverses_entry_id is null)
    or
    (entry_kind = 'reversal'
      and amount > 0
      and adjustment_direction is null
      and reverses_entry_id is not null)
    or
    (entry_kind = 'adjustment'
      and amount > 0
      and adjustment_direction in ('increase', 'decrease')
      and reverses_entry_id is null)
  );

alter table public.campus_xp_ledger
  add constraint campus_xp_ledger_reverses_entry_fkey
  foreign key (reverses_entry_id)
  references public.campus_xp_ledger (id)
  on delete restrict;

alter table public.campus_xp_ledger
  add constraint campus_xp_ledger_planet_owner_fkey
  foreign key (planet_id, user_id)
  references public.campus_planets (id, user_id)
  on delete cascade;

create unique index campus_xp_ledger_reverses_entry_unique
  on public.campus_xp_ledger (reverses_entry_id)
  where reverses_entry_id is not null;

create index campus_xp_ledger_owner_type_date_idx
  on public.campus_xp_ledger (user_id, xp_type, source_date desc);

create table public.campus_planet_unlocks (
  id uuid primary key default gen_random_uuid(),
  planet_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  unlock_key text not null check (char_length(trim(unlock_key)) between 1 and 120),
  unlock_type text not null check (unlock_type in ('building', 'technology', 'landscape')),
  unlocked_at timestamptz not null default now(),
  rule_version integer not null default 1 check (rule_version > 0),
  source_snapshot jsonb not null default '{}'::jsonb,
  constraint campus_planet_unlocks_planet_key_unique unique (planet_id, unlock_key),
  constraint campus_planet_unlocks_planet_owner_fkey
    foreign key (planet_id, user_id)
    references public.campus_planets (id, user_id)
    on delete cascade
);

create index campus_planet_unlocks_user_time_idx
  on public.campus_planet_unlocks (user_id, unlocked_at desc);

create table public.campus_planet_events (
  id uuid primary key default gen_random_uuid(),
  planet_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(trim(event_key)) between 1 and 160),
  event_type text not null check (event_type in ('civilization_stage_up', 'unlock', 'milestone')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint campus_planet_events_planet_key_unique unique (planet_id, event_key),
  constraint campus_planet_events_planet_owner_fkey
    foreign key (planet_id, user_id)
    references public.campus_planets (id, user_id)
    on delete cascade
);

create index campus_planet_events_user_time_idx
  on public.campus_planet_events (user_id, occurred_at desc);

create table public.campus_planet_nature_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planet_id uuid not null,
  activity_date date not null,
  qualifying_focus_seconds integer not null check (qualifying_focus_seconds >= 600),
  trigger_session_id uuid not null,
  rule_version integer not null default 1 check (rule_version > 0),
  created_at timestamptz not null default now(),
  constraint campus_planet_nature_ledger_user_date_unique unique (user_id, activity_date),
  constraint campus_planet_nature_ledger_user_session_unique unique (user_id, trigger_session_id),
  constraint campus_planet_nature_ledger_planet_owner_fkey
    foreign key (planet_id, user_id)
    references public.campus_planets (id, user_id)
    on delete cascade
);

create index campus_planet_nature_ledger_planet_date_idx
  on public.campus_planet_nature_ledger (planet_id, activity_date desc);

alter table public.campus_planets enable row level security;
alter table public.campus_planet_growth enable row level security;
alter table public.campus_xp_ledger enable row level security;
alter table public.campus_planet_unlocks enable row level security;
alter table public.campus_planet_events enable row level security;
alter table public.campus_planet_nature_ledger enable row level security;

revoke all on table public.campus_planets from anon, authenticated, service_role;
revoke all on table public.campus_planet_growth from anon, authenticated, service_role;
revoke all on table public.campus_xp_ledger from anon, authenticated, service_role;
revoke all on table public.campus_planet_unlocks from anon, authenticated, service_role;
revoke all on table public.campus_planet_events from anon, authenticated, service_role;
revoke all on table public.campus_planet_nature_ledger from anon, authenticated, service_role;

revoke all on table public.campus_planets from public;
revoke all on table public.campus_planet_growth from public;
revoke all on table public.campus_xp_ledger from public;
revoke all on table public.campus_planet_unlocks from public;
revoke all on table public.campus_planet_events from public;
revoke all on table public.campus_planet_nature_ledger from public;

grant select on table public.campus_planets to authenticated;
grant select on table public.campus_planet_growth to authenticated;
grant select on table public.campus_xp_ledger to authenticated;
grant select on table public.campus_planet_unlocks to authenticated;
grant select on table public.campus_planet_events to authenticated;
grant select on table public.campus_planet_nature_ledger to authenticated;

grant select, insert, update on table public.campus_planets to service_role;
grant select, insert, update on table public.campus_planet_growth to service_role;
grant select, insert on table public.campus_xp_ledger to service_role;
grant select, insert on table public.campus_planet_unlocks to service_role;
grant select, insert on table public.campus_planet_events to service_role;
grant select, insert on table public.campus_planet_nature_ledger to service_role;

drop policy if exists campus_planet_unlocks_owner_read on public.campus_planet_unlocks;
create policy campus_planet_unlocks_owner_read on public.campus_planet_unlocks
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists campus_planet_events_owner_read on public.campus_planet_events;
create policy campus_planet_events_owner_read on public.campus_planet_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists campus_planet_nature_ledger_owner_read on public.campus_planet_nature_ledger;
create policy campus_planet_nature_ledger_owner_read on public.campus_planet_nature_ledger
  for select to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.campus_planet_unlocks is
  'CampusSync惑星で解放された建物・技術・景観。生徒は本人分を読むだけ。';
comment on table public.campus_planet_events is
  'CampusSync惑星の段階変化・解放イベント履歴。XP台帳の正本ではない。';
comment on table public.campus_planet_nature_ledger is
  'Tokyo日付ごとの有効学習日。自然成長値の正本台帳。';
comment on column public.campus_planet_growth.civilization_score is
  '学習XP + 学校貢献XP + 知識XP + 自然成長値 * 5 の派生スコア。';
comment on column public.campus_xp_ledger.entry_kind is
  'award/reversal/adjustment。修正も元行を変更せず追記する。';

create or replace function public.campus_rebuild_planet_growth(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_planet_id uuid;
  v_old_stage smallint;
  v_stage smallint;
  v_final_stage smallint;
  v_learning_xp bigint;
  v_contribution_xp bigint;
  v_knowledge_xp bigint;
  v_nature_growth bigint;
  v_technical_level smallint;
  v_social_level smallint;
  v_research_level smallint;
  v_nature_level smallint;
  v_civilization_score bigint;
  v_stage_number integer;
begin
  if p_user_id is null then
    raise exception 'ユーザーを確認できません。';
  end if;

  select p.id, p.civilization_stage
    into v_planet_id, v_old_stage
  from public.campus_planets p
  where p.user_id = p_user_id
  for update;

  if not found then
    raise exception '惑星データが見つかりません。';
  end if;

  select
    greatest(0, coalesce(sum(
      case when l.xp_type = 'learning' then
        case
          when l.entry_kind = 'award' then l.amount::bigint
          when l.entry_kind = 'reversal' then -l.amount::bigint
          when l.entry_kind = 'adjustment' and l.adjustment_direction = 'increase' then l.amount::bigint
          when l.entry_kind = 'adjustment' and l.adjustment_direction = 'decrease' then -l.amount::bigint
          else 0::bigint
        end
      else 0::bigint end
    ), 0))::bigint,
    greatest(0, coalesce(sum(
      case when l.xp_type = 'contribution' then
        case
          when l.entry_kind = 'award' then l.amount::bigint
          when l.entry_kind = 'reversal' then -l.amount::bigint
          when l.entry_kind = 'adjustment' and l.adjustment_direction = 'increase' then l.amount::bigint
          when l.entry_kind = 'adjustment' and l.adjustment_direction = 'decrease' then -l.amount::bigint
          else 0::bigint
        end
      else 0::bigint end
    ), 0))::bigint,
    greatest(0, coalesce(sum(
      case when l.xp_type = 'knowledge' then
        case
          when l.entry_kind = 'award' then l.amount::bigint
          when l.entry_kind = 'reversal' then -l.amount::bigint
          when l.entry_kind = 'adjustment' and l.adjustment_direction = 'increase' then l.amount::bigint
          when l.entry_kind = 'adjustment' and l.adjustment_direction = 'decrease' then -l.amount::bigint
          else 0::bigint
        end
      else 0::bigint end
    ), 0))::bigint
  into v_learning_xp, v_contribution_xp, v_knowledge_xp
  from public.campus_xp_ledger l
  where l.user_id = p_user_id;

  select count(*)::bigint
    into v_nature_growth
  from public.campus_planet_nature_ledger n
  where n.user_id = p_user_id;

  v_technical_level := case
    when v_learning_xp >= 3000 then 5
    when v_learning_xp >= 1500 then 4
    when v_learning_xp >= 700 then 3
    when v_learning_xp >= 300 then 2
    when v_learning_xp >= 100 then 1
    else 0 end;
  v_social_level := case
    when v_contribution_xp >= 500 then 5
    when v_contribution_xp >= 300 then 4
    when v_contribution_xp >= 150 then 3
    when v_contribution_xp >= 75 then 2
    when v_contribution_xp >= 25 then 1
    else 0 end;
  v_research_level := case
    when v_knowledge_xp >= 600 then 5
    when v_knowledge_xp >= 300 then 4
    when v_knowledge_xp >= 150 then 3
    when v_knowledge_xp >= 60 then 2
    when v_knowledge_xp >= 20 then 1
    else 0 end;
  v_nature_level := case
    when v_nature_growth >= 130 then 5
    when v_nature_growth >= 80 then 4
    when v_nature_growth >= 45 then 3
    when v_nature_growth >= 21 then 2
    when v_nature_growth >= 7 then 1
    else 0 end;

  v_civilization_score :=
    v_learning_xp + v_contribution_xp + v_knowledge_xp + (v_nature_growth * 5);

  v_stage := case
    when v_civilization_score >= 5000 then 5
    when v_civilization_score >= 2500 then 4
    when v_civilization_score >= 1200 then 3
    when v_civilization_score >= 500 then 2
    when v_civilization_score >= 100 then 1
    else 0 end;
  v_final_stage := greatest(coalesce(v_old_stage, 0), v_stage);

  insert into public.campus_planet_growth (
    planet_id, user_id, learning_xp, contribution_xp, knowledge_xp, nature_growth,
    technical_level, social_level, research_level, nature_level,
    civilization_score, recalculated_at, updated_at
  ) values (
    v_planet_id, p_user_id, v_learning_xp, v_contribution_xp, v_knowledge_xp, v_nature_growth,
    v_technical_level, v_social_level, v_research_level, v_nature_level,
    v_civilization_score, now(), now()
  )
  on conflict (planet_id) do update set
    learning_xp = excluded.learning_xp,
    contribution_xp = excluded.contribution_xp,
    knowledge_xp = excluded.knowledge_xp,
    nature_growth = excluded.nature_growth,
    technical_level = greatest(public.campus_planet_growth.technical_level, excluded.technical_level),
    social_level = greatest(public.campus_planet_growth.social_level, excluded.social_level),
    research_level = greatest(public.campus_planet_growth.research_level, excluded.research_level),
    nature_level = greatest(public.campus_planet_growth.nature_level, excluded.nature_level),
    civilization_score = excluded.civilization_score,
    recalculated_at = now(),
    updated_at = now();

  update public.campus_planets
  set civilization_stage = v_final_stage,
      updated_at = now()
  where id = v_planet_id;

  if v_final_stage > coalesce(v_old_stage, 0) then
    for v_stage_number in (coalesce(v_old_stage, 0) + 1)..v_final_stage loop
      insert into public.campus_planet_events (
        planet_id, user_id, event_key, event_type, payload
      ) values (
        v_planet_id,
        p_user_id,
        'stage:' || v_stage_number::text || ':rules-v1',
        'civilization_stage_up',
        jsonb_build_object(
          'stage', v_stage_number,
          'civilization_score', v_civilization_score,
          'rule_version', 1
        )
      )
      on conflict (planet_id, event_key) do nothing;
    end loop;
  end if;

  return jsonb_build_object(
    'planet_id', v_planet_id,
    'learning_xp', v_learning_xp,
    'contribution_xp', v_contribution_xp,
    'knowledge_xp', v_knowledge_xp,
    'nature_growth', v_nature_growth,
    'technical_level', v_technical_level,
    'social_level', v_social_level,
    'research_level', v_research_level,
    'nature_level', v_nature_level,
    'civilization_score', v_civilization_score,
    'civilization_stage', v_final_stage
  );
end;
$function$;

create or replace function public.campus_record_nature_growth(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_focus_seconds integer;
  v_started_at timestamptz;
  v_activity_date date;
  v_planet_id uuid;
  v_daily_focus_seconds bigint;
  v_inserted_id uuid;
  v_growth jsonb;
begin
  if p_user_id is null or p_session_id is null then
    raise exception 'ユーザーまたは学習記録を確認できません。';
  end if;

  select s.focus_seconds, s.started_at
    into v_focus_seconds, v_started_at
  from public.student_study_sessions s
  where s.id = p_session_id
    and s.user_id = p_user_id;

  if not found or v_focus_seconds is null or v_focus_seconds < 1 or v_focus_seconds > 86400 then
    raise exception '学習記録が自然成長の対象として確認できません。';
  end if;

  v_activity_date := (v_started_at at time zone 'Asia/Tokyo')::date;

  insert into public.campus_planets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select p.id into v_planet_id
  from public.campus_planets p
  where p.user_id = p_user_id
  for update;

  insert into public.campus_planet_growth (planet_id, user_id)
  values (v_planet_id, p_user_id)
  on conflict (planet_id) do nothing;

  select coalesce(sum(s.focus_seconds), 0)::bigint
    into v_daily_focus_seconds
  from public.student_study_sessions s
  where s.user_id = p_user_id
    and (s.started_at at time zone 'Asia/Tokyo')::date = v_activity_date;

  if v_daily_focus_seconds >= 600 then
    insert into public.campus_planet_nature_ledger (
      user_id, planet_id, activity_date, qualifying_focus_seconds,
      trigger_session_id, rule_version
    ) values (
      p_user_id, v_planet_id, v_activity_date,
      least(v_daily_focus_seconds, 2147483647)::integer,
      p_session_id, 1
    )
    on conflict (user_id, activity_date) do nothing
    returning id into v_inserted_id;
  end if;

  v_growth := public.campus_rebuild_planet_growth(p_user_id);

  return jsonb_build_object(
    'awarded', v_inserted_id is not null,
    'activity_date', v_activity_date,
    'daily_focus_seconds', v_daily_focus_seconds,
    'nature_growth', coalesce((v_growth ->> 'nature_growth')::bigint, 0)
  );
end;
$function$;

create or replace function public.campus_award_learning_xp(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_focus_seconds integer;
  v_started_at timestamptz;
  v_source_date date;
  v_planet_id uuid;
  v_existing_xp integer;
  v_already_seconds bigint;
  v_credited_seconds integer;
  v_awarded_xp integer;
  v_ledger_id uuid;
  v_nature jsonb;
  v_growth jsonb;
begin
  if p_user_id is null or p_session_id is null then
    raise exception 'ユーザーまたは学習記録を確認できません。';
  end if;

  select s.focus_seconds, s.started_at
    into v_focus_seconds, v_started_at
  from public.student_study_sessions s
  where s.id = p_session_id
    and s.user_id = p_user_id;

  if not found then
    raise exception '指定された学習記録が見つかりません。';
  end if;

  if v_focus_seconds is null or v_focus_seconds < 1 or v_focus_seconds > 86400 then
    raise exception '学習時間がXP付与の対象外です。';
  end if;

  v_source_date := (v_started_at at time zone 'Asia/Tokyo')::date;

  insert into public.campus_planets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select p.id into v_planet_id
  from public.campus_planets p
  where p.user_id = p_user_id
  for update;

  insert into public.campus_planet_growth (planet_id, user_id)
  values (v_planet_id, p_user_id)
  on conflict (planet_id) do nothing;

  select l.amount into v_existing_xp
  from public.campus_xp_ledger l
  where l.user_id = p_user_id
    and l.xp_type = 'learning'
    and l.source_type = 'student_study_session'
    and l.source_id = p_session_id
    and l.entry_kind = 'award';

  if found then
    v_nature := public.campus_record_nature_growth(p_user_id, p_session_id);
    v_growth := public.campus_rebuild_planet_growth(p_user_id);
    return jsonb_build_object(
      'awarded_xp', coalesce(v_existing_xp, 0),
      'already_processed', true,
      'learning_xp', v_growth -> 'learning_xp',
      'contribution_xp', v_growth -> 'contribution_xp',
      'knowledge_xp', v_growth -> 'knowledge_xp',
      'nature_growth', v_growth -> 'nature_growth',
      'civilization_score', v_growth -> 'civilization_score',
      'civilization_stage', v_growth -> 'civilization_stage',
      'natural_growth_awarded', coalesce((v_nature ->> 'awarded')::boolean, false)
    );
  end if;

  select coalesce(sum(l.credited_seconds), 0)::bigint
    into v_already_seconds
  from public.campus_xp_ledger l
  where l.user_id = p_user_id
    and l.xp_type = 'learning'
    and l.source_date = v_source_date
    and l.entry_kind = 'award';

  v_credited_seconds := least(
    v_focus_seconds,
    greatest(0, 10800 - v_already_seconds)::integer
  );
  v_awarded_xp :=
    floor((v_already_seconds + v_credited_seconds)::numeric / 60)
    - floor(v_already_seconds::numeric / 60);

  insert into public.campus_xp_ledger (
    user_id, planet_id, xp_type, amount, source_type, source_id,
    source_date, credited_seconds, reason, entry_kind, rule_version
  ) values (
    p_user_id, v_planet_id, 'learning', v_awarded_xp,
    'student_study_session', p_session_id, v_source_date,
    v_credited_seconds, 'CampusSync Pomodoroの有効な集中時間', 'award', 1
  )
  on conflict on constraint campus_xp_ledger_source_unique do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    select l.amount into v_existing_xp
    from public.campus_xp_ledger l
    where l.user_id = p_user_id
      and l.xp_type = 'learning'
      and l.source_type = 'student_study_session'
      and l.source_id = p_session_id
      and l.entry_kind = 'award';
    v_awarded_xp := coalesce(v_existing_xp, 0);
  end if;

  v_nature := public.campus_record_nature_growth(p_user_id, p_session_id);
  v_growth := public.campus_rebuild_planet_growth(p_user_id);

  return jsonb_build_object(
    'awarded_xp', v_awarded_xp,
    'credited_seconds', v_credited_seconds,
    'daily_limit_reached', v_credited_seconds < v_focus_seconds,
    'already_processed', v_ledger_id is null,
    'learning_xp', v_growth -> 'learning_xp',
    'contribution_xp', v_growth -> 'contribution_xp',
    'knowledge_xp', v_growth -> 'knowledge_xp',
    'nature_growth', v_growth -> 'nature_growth',
    'technical_level', v_growth -> 'technical_level',
    'social_level', v_growth -> 'social_level',
    'research_level', v_growth -> 'research_level',
    'nature_level', v_growth -> 'nature_level',
    'civilization_score', v_growth -> 'civilization_score',
    'civilization_stage', v_growth -> 'civilization_stage',
    'natural_growth_awarded', coalesce((v_nature ->> 'awarded')::boolean, false)
  );
end;
$function$;

revoke all on function public.campus_rebuild_planet_growth(uuid) from public, anon, authenticated;
revoke all on function public.campus_record_nature_growth(uuid, uuid) from public, anon, authenticated;
revoke all on function public.campus_award_learning_xp(uuid, uuid) from public, anon, authenticated;
grant execute on function public.campus_rebuild_planet_growth(uuid) to service_role;
grant execute on function public.campus_record_nature_growth(uuid, uuid) to service_role;
grant execute on function public.campus_award_learning_xp(uuid, uuid) to service_role;

revoke update, delete, truncate on table public.campus_xp_ledger from service_role;
revoke update, delete, truncate on table public.campus_planet_nature_ledger from service_role;
revoke update, delete, truncate on table public.campus_planet_unlocks from service_role;
revoke update, delete, truncate on table public.campus_planet_events from service_role;
revoke delete, truncate on table public.campus_planets from service_role;
revoke delete, truncate on table public.campus_planet_growth from service_role;

select public.campus_rebuild_planet_growth(p.user_id)
from public.campus_planets p;
