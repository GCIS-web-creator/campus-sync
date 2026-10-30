-- CampusSync platform features: emergency notices, targeted lost-item alerts, facility directory/map.
-- Run once in Supabase SQL Editor. Safe to rerun.

begin;

-- 1) Extend the existing school notice table rather than introducing a second notice system.
alter table public.notifications
  add column if not exists category text not null default 'general',
  add column if not exists priority text not null default 'normal',
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists expires_at timestamptz,
  add column if not exists is_pinned boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_category_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_category_check
      check (category in (
        'general', 'school_closure', 'class_change', 'early_dismissal',
        'disaster', 'emergency', 'lost_found_match'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_priority_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_priority_check
      check (priority in ('normal', 'important', 'emergency'));
  end if;
end
$$;

create index if not exists notifications_target_user_created_idx
  on public.notifications (target_user_id, created_at desc);
create index if not exists notifications_priority_created_idx
  on public.notifications (priority, created_at desc);

-- Remove any older broad SELECT policy so a private lost-item match cannot be read by other students.
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
  loop
    execute format('drop policy if exists %I on public.notifications', policy_row.policyname);
  end loop;
end
$$;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;

create policy notifications_select_visible_audience
  on public.notifications for select to authenticated
  using (target_user_id is null or target_user_id = auth.uid());

-- 2) A student may register their own missing-item keywords.
create table if not exists public.lost_found_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null,
  keyword text not null check (char_length(keyword) between 2 and 40),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lost_found_watches_student_id_check
    check (student_id ~ '^[0-9]{6}$')
);

create unique index if not exists lost_found_watches_user_keyword_idx
  on public.lost_found_watches (user_id, lower(keyword));
create index if not exists lost_found_watches_active_idx
  on public.lost_found_watches (is_active, created_at desc);

alter table public.lost_found_watches enable row level security;
drop policy if exists lost_found_watches_select_own on public.lost_found_watches;
drop policy if exists lost_found_watches_insert_own on public.lost_found_watches;
drop policy if exists lost_found_watches_delete_own on public.lost_found_watches;

create policy lost_found_watches_select_own
  on public.lost_found_watches for select to authenticated
  using (user_id = auth.uid());

create policy lost_found_watches_insert_own
  on public.lost_found_watches for insert to authenticated
  with check (
    user_id = auth.uid()
    and student_id = split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1)
    and lower(coalesce(auth.jwt() ->> 'email', '')) ~ '^[0-9]{6}@tokyo[.]soka[.]ed[.]jp$'
  );

create policy lost_found_watches_delete_own
  on public.lost_found_watches for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.lost_found_watches to authenticated;
grant all on public.lost_found_watches to service_role;

-- 3) Facility directory + optional map position. Coordinates are intentionally NULL until
-- staff confirm the actual school layout; the student view will show a directory meanwhile.
create table if not exists public.campus_facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'facility',
  building text not null default '',
  floor_label text not null default '',
  location_description text not null default '',
  description text not null default '',
  keywords text[] not null default '{}'::text[],
  map_image_url text,
  map_x numeric,
  map_y numeric,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint campus_facilities_map_x_check check (map_x is null or map_x between 0 and 100),
  constraint campus_facilities_map_y_check check (map_y is null or map_y between 0 and 100),
  constraint campus_facilities_name_length check (char_length(name) between 1 and 80)
);

create index if not exists campus_facilities_active_name_idx
  on public.campus_facilities (is_active, name);

alter table public.campus_facilities enable row level security;
drop policy if exists campus_facilities_read_active on public.campus_facilities;
create policy campus_facilities_read_active
  on public.campus_facilities for select to authenticated
  using (is_active = true);

revoke all on public.campus_facilities from anon, authenticated;
grant select on public.campus_facilities to authenticated;
grant all on public.campus_facilities to service_role;

-- Seed directory entries from existing CampusSync facility/room names.
-- Location and map coordinates remain blank until checked against the school's real floor plan.
insert into public.campus_facilities (name, category, description, keywords)
select seed.name, seed.category, seed.description, seed.keywords
from (values
  ('栄冠ホール', 'hall', '校内ホール。建物・階・詳細位置は管理者による確認待ちです。', array['ホール','栄冠']),
  ('化学実験室', 'classroom', '化学の実験で使用する施設。詳細位置は管理者による確認待ちです。', array['化学','実験']),
  ('生物実験室', 'classroom', '生物の実験で使用する施設。詳細位置は管理者による確認待ちです。', array['生物','実験']),
  ('グローリーホール', 'hall', '校内ホール。建物・階・詳細位置は管理者による確認待ちです。', array['ホール','グローリー']),
  ('ミーティングルーム1', 'meeting', '会議・打ち合わせ用の部屋。詳細位置は管理者による確認待ちです。', array['会議','打ち合わせ']),
  ('ミーティングルーム2', 'meeting', '会議・打ち合わせ用の部屋。詳細位置は管理者による確認待ちです。', array['会議','打ち合わせ']),
  ('図書館', 'library', '図書・学習のための施設。詳細位置は管理者による確認待ちです。', array['図書','本','図書室']),
  ('グローバルステーション', 'classroom', '語学・国際交流関連の施設。詳細位置は管理者による確認待ちです。', array['英語','国際']),
  ('Call教室', 'classroom', 'CALL教室。詳細位置は管理者による確認待ちです。', array['CALL','語学','PC']),
  ('PC教室', 'classroom', 'パソコンを使用する教室。詳細位置は管理者による確認待ちです。', array['パソコン','コンピューター']),
  ('家庭科室', 'classroom', '家庭科の授業で使用する施設。詳細位置は管理者による確認待ちです。', array['家庭科','調理']),
  ('普通教室（1-1）', 'classroom', '普通教室。クラスにより利用する教室が異なります。', array['1-1','教室']),
  ('キャリアセンター自習室', 'study', '自習スペース。利用状況はCampusSyncの施設画面で確認してください。', array['自習','キャリアセンター']),
  ('体育館', 'sports', '体育・学校行事で使用する施設。詳細位置は管理者による確認待ちです。', array['体育','運動']),
  ('事務室', 'office', '学校事務の窓口。手続き・落とし物の問い合わせ先です。', array['校務部','窓口','落とし物'])
) as seed(name, category, description, keywords)
where not exists (
  select 1 from public.campus_facilities existing
  where lower(existing.name) = lower(seed.name)
);

commit;
