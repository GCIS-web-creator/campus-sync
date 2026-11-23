-- Assign each CampusSync user a planet automatically; Admin may reassign the visual asset.
alter table public.campus_planets
  add column if not exists planet_asset_id text;

update public.campus_planets
set planet_asset_id = 'planet-' || lpad((1 + floor(random() * 20)::integer)::text, 3, '0')
where planet_asset_id is null;

alter table public.campus_planets
  alter column planet_asset_id set default
    ('planet-' || lpad((1 + floor(random() * 20)::integer)::text, 3, '0'));

alter table public.campus_planets
  alter column planet_asset_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campus_planets_planet_asset_id_check'
      and conrelid = 'public.campus_planets'::regclass
  ) then
    alter table public.campus_planets
      add constraint campus_planets_planet_asset_id_check
      check (planet_asset_id ~ '^planet-(00[1-9]|01[0-9]|020)$');
  end if;
end
$$;

comment on column public.campus_planets.planet_asset_id is
  '最初に自動割り当てされた惑星アセットID。変更操作はサーバー側Admin APIに限定する。';
