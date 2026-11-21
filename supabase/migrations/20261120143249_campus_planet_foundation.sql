-- CampusSync独自の惑星文明システム基盤。
-- 既存Planetube・学習セッションの保存形式には変更を加えない。
-- XP台帳はサーバー専用書き込みとし、クライアントは本人分の読み取りのみ許可する。

create table if not exists public.campus_planets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planet_name text not null default 'わたしの惑星'
    check (char_length(trim(planet_name)) between 1 and 40),
  civilization_stage smallint not null default 0
    check (civilization_stage between 0 and 5),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_planets_user_unique unique (user_id)
);

create table if not exists public.campus_planet_growth (
  id uuid primary key default gen_random_uuid(),
  planet_id uuid not null references public.campus_planets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  learning_xp bigint not null default 0 check (learning_xp >= 0),
  contribution_xp bigint not null default 0 check (contribution_xp >= 0),
  knowledge_xp bigint not null default 0 check (knowledge_xp >= 0),
  nature_growth bigint not null default 0 check (nature_growth >= 0),
  updated_at timestamptz not null default now(),
  constraint campus_planet_growth_planet_unique unique (planet_id),
  constraint campus_planet_growth_user_unique unique (user_id)
);

create table if not exists public.campus_xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planet_id uuid not null references public.campus_planets(id) on delete cascade,
  xp_type text not null check (xp_type in ('learning', 'contribution', 'knowledge')),
  amount integer not null default 0 check (amount >= 0),
  source_type text not null,
  source_id uuid not null,
  source_date date not null,
  credited_seconds integer not null default 0 check (credited_seconds >= 0),
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint campus_xp_ledger_source_unique
    unique (user_id, xp_type, source_type, source_id)
);

create index if not exists campus_xp_ledger_user_date_idx
  on public.campus_xp_ledger(user_id, source_date desc, xp_type);
create index if not exists campus_xp_ledger_planet_created_idx
  on public.campus_xp_ledger(planet_id, created_at desc);

alter table public.campus_planets enable row level security;
alter table public.campus_planet_growth enable row level security;
alter table public.campus_xp_ledger enable row level security;

revoke all on table public.campus_planets from anon, authenticated;
revoke all on table public.campus_planet_growth from anon, authenticated;
revoke all on table public.campus_xp_ledger from anon, authenticated;

grant select on table public.campus_planets to authenticated;
grant select on table public.campus_planet_growth to authenticated;
grant select on table public.campus_xp_ledger to authenticated;

drop policy if exists campus_planets_owner_read on public.campus_planets;
create policy campus_planets_owner_read on public.campus_planets
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists campus_planet_growth_owner_read on public.campus_planet_growth;
create policy campus_planet_growth_owner_read on public.campus_planet_growth
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists campus_xp_ledger_owner_read on public.campus_xp_ledger;
create policy campus_xp_ledger_owner_read on public.campus_xp_ledger
  for select to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.campus_planets is
  'CampusSync独自の個人惑星。Planetubeの既存惑星とは別管理。';
comment on table public.campus_planet_growth is
  'CampusSync惑星の成長集計。XP台帳を正本とする集計キャッシュ。';
comment on table public.campus_xp_ledger is
  'CampusSync惑星XPの追記型台帳。書き込みはサーバー専用。';

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
  v_learning_xp bigint;
  v_contribution_xp bigint;
  v_knowledge_xp bigint;
  v_nature_growth bigint;
  v_total_growth_xp bigint;
  v_stage smallint;
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
    and l.source_id = p_session_id;

  if found then
    select g.learning_xp, g.contribution_xp, g.knowledge_xp, g.nature_growth
      into v_learning_xp, v_contribution_xp, v_knowledge_xp, v_nature_growth
    from public.campus_planet_growth g
    where g.planet_id = v_planet_id;

    select p.civilization_stage into v_stage
    from public.campus_planets p
    where p.id = v_planet_id;

    return jsonb_build_object(
      'awarded_xp', coalesce(v_existing_xp, 0),
      'already_processed', true,
      'learning_xp', v_learning_xp,
      'contribution_xp', v_contribution_xp,
      'knowledge_xp', v_knowledge_xp,
      'nature_growth', v_nature_growth,
      'civilization_stage', v_stage
    );
  end if;

  select coalesce(sum(l.credited_seconds), 0)
    into v_already_seconds
  from public.campus_xp_ledger l
  where l.user_id = p_user_id
    and l.xp_type = 'learning'
    and l.source_date = v_source_date;

  v_credited_seconds := least(
    v_focus_seconds,
    greatest(0, 10800 - v_already_seconds)::integer
  );
  v_awarded_xp :=
    floor((v_already_seconds + v_credited_seconds)::numeric / 60)
    - floor(v_already_seconds::numeric / 60);

  insert into public.campus_xp_ledger (
    user_id, planet_id, xp_type, amount, source_type, source_id,
    source_date, credited_seconds, reason
  ) values (
    p_user_id, v_planet_id, 'learning', v_awarded_xp,
    'student_study_session', p_session_id, v_source_date,
    v_credited_seconds, 'CampusSync Pomodoroの有効な集中時間'
  );

  update public.campus_planet_growth
  set learning_xp = learning_xp + v_awarded_xp,
      updated_at = now()
  where planet_id = v_planet_id;

  select g.learning_xp, g.contribution_xp, g.knowledge_xp, g.nature_growth
    into v_learning_xp, v_contribution_xp, v_knowledge_xp, v_nature_growth
  from public.campus_planet_growth g
  where g.planet_id = v_planet_id;

  v_total_growth_xp := v_learning_xp + v_contribution_xp + v_knowledge_xp;
  v_stage := case
    when v_total_growth_xp >= 2400 then 5
    when v_total_growth_xp >= 1200 then 4
    when v_total_growth_xp >= 600 then 3
    when v_total_growth_xp >= 240 then 2
    when v_total_growth_xp >= 60 then 1
    else 0
  end;

  update public.campus_planets
  set civilization_stage = greatest(civilization_stage, v_stage),
      updated_at = now()
  where id = v_planet_id;

  return jsonb_build_object(
    'awarded_xp', v_awarded_xp,
    'credited_seconds', v_credited_seconds,
    'daily_limit_reached', v_credited_seconds < v_focus_seconds,
    'already_processed', false,
    'learning_xp', v_learning_xp,
    'contribution_xp', v_contribution_xp,
    'knowledge_xp', v_knowledge_xp,
    'nature_growth', v_nature_growth,
    'civilization_stage', v_stage
  );
end;
$function$;

revoke all on function public.campus_award_learning_xp(uuid, uuid) from public;
revoke all on function public.campus_award_learning_xp(uuid, uuid) from anon, authenticated;
grant execute on function public.campus_award_learning_xp(uuid, uuid) to service_role;
