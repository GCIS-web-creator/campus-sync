-- MP wallet and permanent, stage-gated technology tree.
-- Existing XP becomes an opening balance; future XP awards mint MP 1:1.

alter table public.campus_planets
  add column mp_activated_at timestamptz not null default now();

create table public.campus_planet_mp_ledger (
  id uuid primary key default gen_random_uuid(),
  planet_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  entry_type text not null check (entry_type in ('opening_balance','xp_reward','xp_adjustment','technology_spend')),
  source_key text not null check (char_length(trim(source_key)) between 1 and 180),
  source_xp_ledger_id uuid references public.campus_xp_ledger(id) on delete restrict,
  technology_node_id text,
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint campus_planet_mp_ledger_planet_owner_fkey foreign key (planet_id,user_id)
    references public.campus_planets(id,user_id) on delete cascade,
  constraint campus_planet_mp_ledger_planet_source_unique unique (planet_id,source_key),
  constraint campus_planet_mp_ledger_xp_source_unique unique (source_xp_ledger_id),
  constraint campus_planet_mp_ledger_entry_shape_check check (
    (entry_type in ('opening_balance','xp_reward','xp_adjustment') and amount > 0 and technology_node_id is null)
    or (entry_type = 'technology_spend' and amount < 0 and source_xp_ledger_id is null and technology_node_id is not null)
  )
);
create index campus_planet_mp_ledger_user_time_idx on public.campus_planet_mp_ledger(user_id,created_at desc);

create table public.campus_planet_technology_unlocks (
  id uuid primary key default gen_random_uuid(),
  planet_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id text not null check (char_length(trim(node_id)) between 1 and 180),
  branch_id text not null check (char_length(trim(branch_id)) between 1 and 100),
  node_type text not null check (node_type in ('root','branch','technology')),
  node_title text not null check (char_length(trim(node_title)) between 1 and 160),
  parent_node_id text,
  mp_cost integer not null check (mp_cost > 0),
  required_stage smallint not null check (required_stage between 0 and 5),
  civilization_stage_at_unlock smallint not null check (civilization_stage_at_unlock between 0 and 5),
  unlocked_at timestamptz not null default now(),
  rule_version integer not null default 1 check (rule_version > 0),
  constraint campus_planet_technology_unlocks_planet_node_unique unique (planet_id,node_id),
  constraint campus_planet_technology_unlocks_planet_owner_fkey foreign key (planet_id,user_id)
    references public.campus_planets(id,user_id) on delete cascade
);
create index campus_planet_technology_unlocks_user_time_idx on public.campus_planet_technology_unlocks(user_id,unlocked_at desc);
create index campus_planet_technology_unlocks_parent_idx on public.campus_planet_technology_unlocks(planet_id,parent_node_id);

alter table public.campus_planet_mp_ledger enable row level security;
alter table public.campus_planet_technology_unlocks enable row level security;
revoke all on table public.campus_planet_mp_ledger from public,anon,authenticated,service_role;
revoke all on table public.campus_planet_technology_unlocks from public,anon,authenticated,service_role;
grant select on table public.campus_planet_mp_ledger to authenticated;
grant select on table public.campus_planet_technology_unlocks to authenticated;
grant select,insert on table public.campus_planet_mp_ledger to service_role;
grant select,insert on table public.campus_planet_technology_unlocks to service_role;

create policy campus_planet_mp_ledger_owner_read on public.campus_planet_mp_ledger
  for select to authenticated using ((select auth.uid()) = user_id);
create policy campus_planet_technology_unlocks_owner_read on public.campus_planet_technology_unlocks
  for select to authenticated using ((select auth.uid()) = user_id);

comment on table public.campus_planet_mp_ledger is 'CampusSync惑星MP追記型台帳。XP獲得時に1:1で付与し、研究解放時のみ消費する。';
comment on table public.campus_planet_technology_unlocks is 'CampusSync惑星のMP購入済み研究ツリーノード。購入後は永続保存する。';
comment on column public.campus_planets.mp_activated_at is 'MP導入時刻。導入前の学習記録の再計算によるMP二重付与を防ぐ境界。';

insert into public.campus_planet_mp_ledger(planet_id,user_id,amount,entry_type,source_key,description)
select p.id,p.user_id,
  (coalesce(g.learning_xp,0)+coalesce(g.contribution_xp,0)+coalesce(g.knowledge_xp,0))::bigint,
  'opening_balance','opening:mp-phase1','MP導入時の既存XPからの初期残高'
from public.campus_planets p
left join public.campus_planet_growth g on g.planet_id=p.id
where (coalesce(g.learning_xp,0)+coalesce(g.contribution_xp,0)+coalesce(g.knowledge_xp,0))>0
on conflict (planet_id,source_key) do nothing;

create or replace function public.campus_award_planet_mp_from_xp()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_activated_at timestamptz;
  v_source_created_at timestamptz;
begin
  if new.amount <= 0 or not (
    new.entry_kind='award' or (new.entry_kind='adjustment' and new.adjustment_direction='increase')
  ) then return new; end if;

  select p.mp_activated_at into v_activated_at
  from public.campus_planets p where p.id=new.planet_id and p.user_id=new.user_id;
  if not found then return new; end if;

  if new.source_type='student_study_session' then
    select s.created_at into v_source_created_at
    from public.student_study_sessions s where s.id=new.source_id and s.user_id=new.user_id;
    if v_source_created_at is null or v_source_created_at < v_activated_at then return new; end if;
  elsif new.created_at < v_activated_at then
    return new;
  end if;

  insert into public.campus_planet_mp_ledger(
    planet_id,user_id,amount,entry_type,source_key,source_xp_ledger_id,description
  ) values (
    new.planet_id,new.user_id,new.amount::bigint,
    case when new.entry_kind='adjustment' then 'xp_adjustment' else 'xp_reward' end,
    'xp:'||new.id::text,new.id,
    case when new.entry_kind='adjustment' then 'XP訂正の増加分に対応するMP' else 'CampusSyncで獲得したXPに対応するMP' end
  ) on conflict do nothing;
  return new;
end;
$function$;

revoke all on function public.campus_award_planet_mp_from_xp() from public,anon,authenticated;
grant execute on function public.campus_award_planet_mp_from_xp() to service_role;
create trigger campus_xp_ledger_award_planet_mp after insert on public.campus_xp_ledger
  for each row execute function public.campus_award_planet_mp_from_xp();

create or replace function public.campus_get_planet_mp_summary(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_planet_id uuid;
  v_balance bigint;
  v_earned bigint;
  v_spent bigint;
  v_recent jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'サーバーからの照会のみ許可されています。'; end if;
  if p_user_id is null then raise exception 'ユーザーを確認できません。'; end if;
  select p.id into v_planet_id from public.campus_planets p where p.user_id=p_user_id;
  if v_planet_id is null then
    return jsonb_build_object('balance',0,'earned_total',0,'spent_total',0,'recent_ledger','[]'::jsonb);
  end if;
  select coalesce(sum(l.amount),0)::bigint,
    coalesce(sum(case when l.amount>0 then l.amount else 0 end),0)::bigint,
    coalesce(-sum(case when l.amount<0 then l.amount else 0 end),0)::bigint
  into v_balance,v_earned,v_spent
  from public.campus_planet_mp_ledger l where l.planet_id=v_planet_id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into v_recent
  from (
    select id,amount,entry_type,description,technology_node_id,created_at
    from public.campus_planet_mp_ledger where planet_id=v_planet_id
    order by created_at desc limit 12
  ) r;
  return jsonb_build_object('balance',v_balance,'earned_total',v_earned,'spent_total',v_spent,'recent_ledger',v_recent);
end;
$function$;

create or replace function public.campus_unlock_planet_technology(
  p_user_id uuid,p_node_id text,p_branch_id text,p_node_type text,p_node_title text,
  p_parent_node_id text,p_cost_mp integer,p_required_stage smallint
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_planet public.campus_planets%rowtype;
  v_balance bigint;
  v_spend_id uuid;
  v_unlock_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'サーバーからの研究解放のみ許可されています。'; end if;
  if p_user_id is null or p_node_id is null or char_length(trim(p_node_id)) not between 1 and 180
    or p_branch_id is null or char_length(trim(p_branch_id)) not between 1 and 100
    or p_node_type not in ('root','branch','technology')
    or p_node_title is null or char_length(trim(p_node_title)) not between 1 and 160
    or p_cost_mp is null or p_cost_mp<1
    or p_required_stage is null or p_required_stage not between 0 and 5 then
    raise exception '研究ノードの情報が正しくありません。';
  end if;
  select * into v_planet from public.campus_planets p where p.user_id=p_user_id for update;
  if not found then raise exception '惑星データが見つかりません。'; end if;
  if v_planet.civilization_stage<p_required_stage then raise exception 'この研究には文明 Stage % が必要です。',p_required_stage; end if;
  if p_parent_node_id is not null and not exists(
    select 1 from public.campus_planet_technology_unlocks u
    where u.planet_id=v_planet.id and u.node_id=p_parent_node_id
  ) then raise exception '先行研究を先に解放してください。'; end if;
  if exists(select 1 from public.campus_planet_technology_unlocks u where u.planet_id=v_planet.id and u.node_id=p_node_id) then
    raise exception 'この研究はすでに解放済みです。';
  end if;
  select coalesce(sum(l.amount),0)::bigint into v_balance
  from public.campus_planet_mp_ledger l where l.planet_id=v_planet.id;
  if v_balance<p_cost_mp then raise exception 'MPが不足しています。必要: % MP / 所持: % MP',p_cost_mp,v_balance; end if;

  insert into public.campus_planet_mp_ledger(
    planet_id,user_id,amount,entry_type,source_key,technology_node_id,description
  ) values(v_planet.id,p_user_id,-p_cost_mp,'technology_spend','technology:'||p_node_id,p_node_id,'研究ツリー解放: '||p_node_title)
  returning id into v_spend_id;

  insert into public.campus_planet_technology_unlocks(
    planet_id,user_id,node_id,branch_id,node_type,node_title,parent_node_id,mp_cost,
    required_stage,civilization_stage_at_unlock,rule_version
  ) values(
    v_planet.id,p_user_id,p_node_id,p_branch_id,p_node_type,p_node_title,p_parent_node_id,
    p_cost_mp,p_required_stage,v_planet.civilization_stage,1
  ) returning id into v_unlock_id;

  insert into public.campus_planet_events(planet_id,user_id,event_key,event_type,payload)
  values(v_planet.id,p_user_id,'technology:'||p_node_id,'unlock',
    jsonb_build_object('node_id',p_node_id,'branch_id',p_branch_id,'node_title',p_node_title,'mp_cost',p_cost_mp,'mp_ledger_id',v_spend_id))
  on conflict(planet_id,event_key) do nothing;

  return jsonb_build_object('success',true,'node_id',p_node_id,'unlocked_id',v_unlock_id,'spent_mp',p_cost_mp,'balance',v_balance-p_cost_mp);
end;
$function$;

revoke all on function public.campus_get_planet_mp_summary(uuid) from public,anon,authenticated;
revoke all on function public.campus_unlock_planet_technology(uuid,text,text,text,text,text,integer,smallint) from public,anon,authenticated;
grant execute on function public.campus_get_planet_mp_summary(uuid) to service_role;
grant execute on function public.campus_unlock_planet_technology(uuid,text,text,text,text,text,integer,smallint) to service_role;
