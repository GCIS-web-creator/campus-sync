-- Charge exactly 30 MP for one star-system voyage.
-- The idempotency key prevents double charges when a client retries after a network interruption.

alter table public.campus_planet_mp_ledger
  drop constraint if exists campus_planet_mp_ledger_entry_type_check;
alter table public.campus_planet_mp_ledger
  add constraint campus_planet_mp_ledger_entry_type_check
  check (entry_type in ('opening_balance','xp_reward','xp_adjustment','technology_spend','travel_spend'));

alter table public.campus_planet_mp_ledger
  drop constraint if exists campus_planet_mp_ledger_entry_shape_check;
alter table public.campus_planet_mp_ledger
  add constraint campus_planet_mp_ledger_entry_shape_check check (
    (entry_type in ('opening_balance','xp_reward','xp_adjustment')
      and amount > 0 and technology_node_id is null)
    or (entry_type = 'technology_spend'
      and amount < 0 and source_xp_ledger_id is null and technology_node_id is not null)
    or (entry_type = 'travel_spend'
      and amount = -30 and source_xp_ledger_id is null and technology_node_id is null)
  );

create or replace function public.campus_purchase_planet_star_system_travel(
  p_user_id uuid,
  p_travel_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_planet public.campus_planets%rowtype;
  v_balance bigint;
  v_source_key text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'サーバー経由の星系旅行決済のみ許可されています。';
  end if;
  if p_user_id is null or p_travel_id is null then
    raise exception '星系旅行の利用者またはIDを確認できません。';
  end if;

  select * into v_planet
  from public.campus_planets p
  where p.user_id = p_user_id
  for update;

  if not found then
    raise exception '惑星データが見つかりません。';
  end if;

  v_source_key := 'travel:' || p_travel_id::text;

  -- A retry using the same travel ID is free and returns the current balance.
  if exists (
    select 1 from public.campus_planet_mp_ledger l
    where l.planet_id = v_planet.id and l.source_key = v_source_key
      and l.entry_type = 'travel_spend'
  ) then
    select coalesce(sum(l.amount), 0)::bigint into v_balance
    from public.campus_planet_mp_ledger l where l.planet_id = v_planet.id;
    return jsonb_build_object(
      'success', true,
      'already_charged', true,
      'spent_mp', 0,
      'balance', v_balance
    );
  end if;

  select coalesce(sum(l.amount), 0)::bigint into v_balance
  from public.campus_planet_mp_ledger l
  where l.planet_id = v_planet.id;

  if v_balance < 30 then
    raise exception 'MPが不足しています。必要: 30 MP / 所持: % MP', v_balance;
  end if;

  insert into public.campus_planet_mp_ledger(
    planet_id, user_id, amount, entry_type, source_key, description
  ) values (
    v_planet.id, p_user_id, -30, 'travel_spend', v_source_key,
    '星系旅行（亜光速巡航・恒星／惑星／衛星周回）'
  );

  return jsonb_build_object(
    'success', true,
    'already_charged', false,
    'spent_mp', 30,
    'balance', v_balance - 30
  );
end;
$function$;

revoke all on function public.campus_purchase_planet_star_system_travel(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.campus_purchase_planet_star_system_travel(uuid,uuid)
  to service_role;
