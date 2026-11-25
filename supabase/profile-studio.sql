-- CampusSync Profile Studio / complete schema
-- Apply only after the existing student/profile/contribution tables exist.
-- User profile fields are separated from the private school profile table.
-- Public discovery is authenticated-only and disabled by default.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.student_profile_customizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'CampusSyncユーザー',
  bio text not null default '',
  avatar_emoji text not null default '🌸',
  avatar_url text,
  banner_theme text not null default 'aurora',
  banner_url text,
  name_style text not null default 'gradient',
  name_font text not null default 'rounded',
  frame_style text not null default 'basic',
  avatar_effect text not null default 'none',
  is_public boolean not null default false,
  show_class boolean not null default false,
  class_label text,
  equipped_badges text[] not null default '{}',
  contribution_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_profile_customizations
  add column if not exists contribution_points integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_display_name_length'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_display_name_length
      check (char_length(display_name) between 1 and 32);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_bio_length'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_bio_length check (char_length(bio) <= 160);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_avatar_emoji_length'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_avatar_emoji_length
      check (char_length(avatar_emoji) between 1 and 16);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_banner_theme_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_banner_theme_check
      check (banner_theme in ('aurora','ocean','sunset','midnight','sakura'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_name_style_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_name_style_check
      check (name_style in ('solid','gradient','neon','toon','pop'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_name_font_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_name_font_check
      check (name_font in ('rounded','sans','serif','mono'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_frame_style_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_frame_style_check
      check (frame_style in ('basic','aurora','prism'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_avatar_effect_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_avatar_effect_check
      check (avatar_effect in ('none','sparkle'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_avatar_url_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_avatar_url_check
      check (avatar_url is null or (avatar_url ~* '^https://' and char_length(avatar_url) <= 2048));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_banner_url_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_banner_url_check
      check (banner_url is null or (banner_url ~* '^https://' and char_length(banner_url) <= 2048));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_avatar_url_length_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_avatar_url_length_check
      check (avatar_url is null or char_length(avatar_url) <= 2048);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_banner_url_length_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_banner_url_length_check
      check (banner_url is null or char_length(banner_url) <= 2048);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_class_label_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_class_label_check
      check (class_label is null or class_label ~ '^[1-3]-[1-8]$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_contribution_points_nonnegative'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_contribution_points_nonnegative
      check (contribution_points >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_equipped_badges_max_length'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_equipped_badges_max_length
      check (cardinality(equipped_badges) <= 5);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_class_visibility_check'
      and conrelid = 'public.student_profile_customizations'::regclass
  ) then
    alter table public.student_profile_customizations
      add constraint student_profile_class_visibility_check
      check (not show_class or (is_public and class_label is not null));
  end if;
end;
$$;

create index if not exists student_profile_customizations_public_updated_idx
  on public.student_profile_customizations (updated_at desc)
  where is_public = true;

alter table public.student_profile_customizations enable row level security;

drop policy if exists student_profile_customizations_read on public.student_profile_customizations;
create policy student_profile_customizations_read
  on public.student_profile_customizations
  for select to authenticated
  using (user_id = (select auth.uid()) or is_public = true);

drop policy if exists student_profile_customizations_insert_own on public.student_profile_customizations;
create policy student_profile_customizations_insert_own
  on public.student_profile_customizations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists student_profile_customizations_update_own on public.student_profile_customizations;
create policy student_profile_customizations_update_own
  on public.student_profile_customizations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists student_profile_customizations_delete_own on public.student_profile_customizations;
create policy student_profile_customizations_delete_own
  on public.student_profile_customizations
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.student_profile_customizations from public, anon;
grant select, insert, update, delete on public.student_profile_customizations to authenticated;

create table if not exists public.student_profile_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_id text not null,
  unlocked_at timestamptz not null default now(),
  source text not null default 'achievement',
  primary key (user_id, cosmetic_id)
);

alter table public.student_profile_unlocks enable row level security;

drop policy if exists student_profile_unlocks_read_own on public.student_profile_unlocks;
create policy student_profile_unlocks_read_own
  on public.student_profile_unlocks
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.student_profile_unlocks from public, anon;
grant select on public.student_profile_unlocks to authenticated;
revoke insert, update, delete on public.student_profile_unlocks from authenticated;

create or replace function public.validate_student_profile_equipment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_badge text;
begin
  if new.frame_style <> 'basic' and not exists (
    select 1 from public.student_profile_unlocks u
    where u.user_id = new.user_id
      and u.cosmetic_id = 'frame_' || new.frame_style
  ) then
    raise exception 'このプロフィール枠はまだ解放されていません。';
  end if;

  if new.avatar_effect <> 'none' and not exists (
    select 1 from public.student_profile_unlocks u
    where u.user_id = new.user_id
      and u.cosmetic_id = 'effect_' || new.avatar_effect
  ) then
    raise exception 'このアイコン演出はまだ解放されていません。';
  end if;

  foreach v_badge in array coalesce(new.equipped_badges, array[]::text[])
  loop
    if not exists (
      select 1 from public.student_profile_unlocks u
      where u.user_id = new.user_id
        and u.cosmetic_id = v_badge
    ) then
      raise exception '所持していないバッジは装備できません。';
    end if;
  end loop;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_student_profile_equipment() from public, anon, authenticated;

drop trigger if exists validate_student_profile_equipment on public.student_profile_customizations;
create trigger validate_student_profile_equipment
  before insert or update on public.student_profile_customizations
  for each row execute function public.validate_student_profile_equipment();

-- Achievement updates run in private functions, not client-callable public RPCs.
create or replace function private.sync_student_profile_unlocks_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_student_id text;
  v_sessions integer := 0;
  v_focus_minutes integer := 0;
  v_history_contributions integer := 0;
  v_submission_contributions integer := 0;
  v_contributions integer := 0;
begin
  if p_user_id is null then return; end if;

  select student_id into v_student_id
  from public.profiles
  where auth_user_id = p_user_id
  limit 1;

  select
    count(*) filter (where ended_at is not null and coalesce(focus_seconds, 0) > 0)::integer,
    floor(coalesce(sum(greatest(coalesce(focus_seconds, 0), 0)), 0) / 60)::integer
  into v_sessions, v_focus_minutes
  from public.student_study_sessions
  where user_id = p_user_id;

  if v_student_id is not null then
    select count(*)::integer into v_history_contributions
    from public.contribution_history
    where student_id = v_student_id and delta > 0;
  end if;

  select count(*)::integer into v_submission_contributions
  from public.campus_contribution_submissions
  where user_id = p_user_id
    and lower(coalesce(status, '')) in ('approved','accepted','published');

  v_contributions := greatest(v_history_contributions, v_submission_contributions);

  insert into public.student_profile_unlocks (user_id, cosmetic_id, source)
  select p_user_id, item.cosmetic_id, 'achievement'
  from (values
    ('badge_first_study', v_sessions >= 1),
    ('frame_aurora', v_sessions >= 5),
    ('badge_study_10', v_sessions >= 10),
    ('effect_sparkle', v_focus_minutes >= 120),
    ('badge_contribution_3', v_contributions >= 3),
    ('frame_prism', v_contributions >= 3)
  ) as item(cosmetic_id, achieved)
  where item.achieved
  on conflict (user_id, cosmetic_id) do nothing;
end;
$$;

create or replace function private.on_student_study_session_unlock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.sync_student_profile_unlocks_for_user(new.user_id);
  return new;
end;
$$;

create or replace function private.on_student_contribution_unlock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.sync_student_profile_unlocks_for_user(new.user_id);
  return new;
end;
$$;

create or replace function private.sync_student_profile_points_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_student_id text;
  v_points integer := 0;
begin
  if p_user_id is null then return; end if;

  select student_id into v_student_id
  from public.profiles
  where auth_user_id = p_user_id
  limit 1;

  if v_student_id is null then return; end if;

  select greatest(0, coalesce(sum(delta), 0))::integer
  into v_points
  from public.contribution_history
  where student_id = v_student_id;

  update public.student_profile_customizations
  set contribution_points = v_points,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

create or replace function private.set_student_profile_points_before_save()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_student_id text;
begin
  select student_id into v_student_id
  from public.profiles
  where auth_user_id = new.user_id
  limit 1;

  if v_student_id is null then
    new.contribution_points := 0;
  else
    select greatest(0, coalesce(sum(delta), 0))::integer
    into new.contribution_points
    from public.contribution_history
    where student_id = v_student_id;
  end if;

  return new;
end;
$$;

create or replace function private.on_contribution_history_profile_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid;
begin
  if tg_op <> 'INSERT' then
    select auth_user_id into v_user_id
    from public.profiles
    where student_id = old.student_id
    limit 1;

    if v_user_id is not null then
      perform private.sync_student_profile_points_for_user(v_user_id);
      perform private.sync_student_profile_unlocks_for_user(v_user_id);
    end if;
  end if;

  if tg_op <> 'DELETE' then
    select auth_user_id into v_user_id
    from public.profiles
    where student_id = new.student_id
    limit 1;

    if v_user_id is not null then
      perform private.sync_student_profile_points_for_user(v_user_id);
      perform private.sync_student_profile_unlocks_for_user(v_user_id);
    end if;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists student_profile_customizations_points_before_save on public.student_profile_customizations;
create trigger student_profile_customizations_points_before_save
  before insert or update on public.student_profile_customizations
  for each row execute function private.set_student_profile_points_before_save();

drop trigger if exists student_study_sessions_profile_unlocks on public.student_study_sessions;
create trigger student_study_sessions_profile_unlocks
  after insert or update of ended_at, focus_seconds
  on public.student_study_sessions
  for each row execute function private.on_student_study_session_unlock();

drop trigger if exists campus_contribution_profile_unlocks on public.campus_contribution_submissions;
create trigger campus_contribution_profile_unlocks
  after insert or update of status
  on public.campus_contribution_submissions
  for each row execute function private.on_student_contribution_unlock();

drop trigger if exists contribution_history_profile_unlocks on public.contribution_history;
create trigger contribution_history_profile_unlocks
  after insert or update or delete
  on public.contribution_history
  for each row execute function private.on_contribution_history_profile_update();

revoke all on function private.sync_student_profile_unlocks_for_user(uuid) from public, anon, authenticated;
revoke all on function private.on_student_study_session_unlock() from public, anon, authenticated;
revoke all on function private.on_student_contribution_unlock() from public, anon, authenticated;
revoke all on function private.sync_student_profile_points_for_user(uuid) from public, anon, authenticated;
revoke all on function private.set_student_profile_points_before_save() from public, anon, authenticated;
revoke all on function private.on_contribution_history_profile_update() from public, anon, authenticated;

-- Backfill existing activity for linked users.
do $$
declare r record;
begin
  for r in
    select distinct user_id
    from public.student_study_sessions
    where user_id is not null
    union
    select distinct user_id
    from public.campus_contribution_submissions
    where user_id is not null
    union
    select distinct auth_user_id
    from public.profiles
    where auth_user_id is not null
  loop
    perform private.sync_student_profile_points_for_user(r.user_id);
    perform private.sync_student_profile_unlocks_for_user(r.user_id);
  end loop;
end;
$$;
