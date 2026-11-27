-- Expand the shared planet catalog to 50 entries without reassigning existing users.
alter table public.campus_planets
  alter column planet_asset_id set default
    ('planet-' || lpad((1 + floor(random() * 50)::integer)::text, 3, '0'));

alter table public.campus_planets
  drop constraint if exists campus_planets_planet_asset_id_check;

alter table public.campus_planets
  add constraint campus_planets_planet_asset_id_check
  check (planet_asset_id ~ '^planet-(00[1-9]|0[1-4][0-9]|050)$');
