-- CampusSync club / committee note permissions and one-time posting codes.
-- Run once in Supabase SQL Editor. Safe to re-run.
-- The application server (service role only) is the only writer for club_notes.
-- Student posts are accepted only for explicitly approved accounts or a targeted,
-- unused 8-digit code with an expiry time.

alter table public.club_notes
  add column if not exists author_name text,
  add column if not exists author_user_id uuid references auth.users(id) on delete set null;

-- Preserve real display names, but do not backfill a raw student ID or email
-- into the public timeline as an author label.
update public.club_notes
set author_name = case
  when nullif(btrim(coalesce(author_name, '')), '') is not null
    and position('@' in btrim(author_name)) = 0
    and btrim(author_name) !~ '^[0-9]{6}( より)?
create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
     or position('@' in btrim(coalesce(p_author_name, ''))) > 0
     or btrim(coalesce(p_author_name, '')) ~ '^[0-9]{6}( より)?
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');

    then btrim(author_name)
  when nullif(btrim(coalesce(author, '')), '') is not null
    and position('@' in btrim(author)) = 0
    and btrim(author) !~ '^[0-9]{6}( より)?
create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');

    then btrim(author)
  else null
end
where author_name is null;

update public.club_notes
set author_name = null,
    author = '学校からのお知らせ'
where position('@' in btrim(coalesce(author_name, ''))) > 0
   or btrim(coalesce(author_name, '')) ~ '^[0-9]{6}( より)?
create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');

   or position('@' in btrim(coalesce(author, ''))) > 0
   or btrim(coalesce(author, '')) ~ '^[0-9]{6}( より)?
create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');
;

create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');

  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');

    then btrim(author_name)
  when nullif(btrim(coalesce(author, '')), '') is not null
    and position('@' in btrim(author)) = 0
    and btrim(author) !~ '^[0-9]{6}( より)?
create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');

    then btrim(author)
  else null
end
where author_name is null;

update public.club_notes
set author_name = null,
    author = '学校からのお知らせ'
where position('@' in btrim(coalesce(author_name, ''))) > 0
   or btrim(coalesce(author_name, '')) ~ '^[0-9]{6}( より)?
create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');

   or position('@' in btrim(coalesce(author, ''))) > 0
   or btrim(coalesce(author, '')) ~ '^[0-9]{6}( より)?
create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');
;

create index if not exists club_notes_created_at_idx
  on public.club_notes (created_at desc);
create index if not exists club_notes_author_user_id_idx
  on public.club_notes (author_user_id)
  where author_user_id is not null;

create table if not exists public.club_post_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^[0-9]{6}$'),
  can_post boolean not null default true,
  display_name text not null default '',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_post_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_student_id text not null check (allowed_student_id ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_by_label text not null default 'Admin'
);

create index if not exists club_post_codes_expiry_idx
  on public.club_post_codes (expires_at)
  where used_at is null;

alter table public.club_post_permissions enable row level security;
alter table public.club_post_codes enable row level security;
revoke all on public.club_post_permissions from public, anon, authenticated;
revoke all on public.club_post_codes from public, anon, authenticated;
grant all on public.club_post_permissions to service_role;
grant all on public.club_post_codes to service_role;

-- Remove existing table policies first so an old permissive INSERT policy cannot
-- bypass the server authorization / one-time code check.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'club_notes'
  loop
    execute format('drop policy if exists %I on public.club_notes', policy_row.policyname);
  end loop;
end
$block$;

alter table public.club_notes enable row level security;
revoke insert, update, delete on public.club_notes from public, anon, authenticated;
revoke all on public.club_notes from anon;
grant select on public.club_notes to authenticated;

create policy club_notes_authenticated_read
  on public.club_notes for select to authenticated
  using (true);

-- Atomic, server-only submit: profile binding, approved posting, single-use code
-- redemption, basic spam limit, and the note insert all happen in one transaction.
create or replace function public.submit_club_note(
  p_user_id uuid,
  p_student_id text,
  p_club_name text,
  p_title text,
  p_content text,
  p_author_name text,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  profile_row record;
  permission_row record;
  code_row record;
  new_note jsonb;
  has_permission boolean := false;
  recent_posts integer := 0;
begin
  if p_user_id is null
     or p_student_id !~ '^[0-9]{6}$'
     or char_length(btrim(coalesce(p_club_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 3000
     or char_length(btrim(coalesce(p_author_name, ''))) not between 1 and 50
  then
    raise exception '投稿内容を確認してください。';
  end if;

  select p.student_id, p.auth_user_id, p.setup_completed_at
    into profile_row
  from public.profiles p
  where p.student_id = p_student_id;

  if not found
     or profile_row.auth_user_id is distinct from p_user_id
     or profile_row.setup_completed_at is null
  then
    raise exception '初回プロフィール設定が完了した学校アカウントでログインしてください。';
  end if;

  select cp.user_id, cp.can_post
    into permission_row
  from public.club_post_permissions cp
  where cp.user_id = p_user_id and cp.student_id = p_student_id
  for update;

  has_permission := found and permission_row.can_post is true;

  if not has_permission then
    if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Adminから許可されていないアカウントです。投稿許可または有効な8桁の一回限りコードが必要です。';
    end if;

    update public.club_post_codes c
      set used_at = now(), redeemed_by = p_user_id
    where c.code_hash = p_code_hash
      and c.allowed_student_id = p_student_id
      and c.used_at is null
      and c.expires_at > now()
    returning c.id into code_row;

    if not found then
      raise exception 'コードが無効・期限切れ・使用済みです。Adminに確認してください。';
    end if;
  end if;

  select count(*) into recent_posts
  from public.club_notes n
  where n.author_user_id = p_user_id
    and n.created_at > now() - interval '10 minutes';

  if recent_posts >= 5 then
    raise exception '短時間の連続投稿はできません。時間をおいて再度お試しください。';
  end if;

  insert into public.club_notes (
    club_name, title, content, author, author_name, author_user_id, created_at
  )
  values (
    btrim(p_club_name), btrim(p_title), btrim(p_content),
    btrim(p_author_name), btrim(p_author_name), p_user_id, now()
  )
  returning jsonb_build_object(
    'id', id,
    'club_name', club_name,
    'title', title,
    'content', content,
    'author', author,
    'author_name', author_name,
    'author_user_id', author_user_id,
    'created_at', created_at
  ) into new_note;

  return new_note;
end
$function$;

revoke all on function public.submit_club_note(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_club_note(uuid, text, text, text, text, text, text)
  to service_role;

comment on table public.club_post_permissions is
  'Admin-managed allowlist for students permitted to post club/committee notices.';
comment on table public.club_post_codes is
  'Hashed, target-student-specific, one-time 8-digit club posting codes. Raw codes are shown only at creation.';
comment on function public.submit_club_note(uuid, text, text, text, text, text, text) is
  'Server-only atomic poster authorization and one-time-code redemption for club notes.';

-- Remove only the known demo rows from the old mock timeline; leave real posts intact.
delete from public.club_notes
where (club_name = '硬式テニス部' and title = '雨天時の練習場所変更')
   or (club_name = '吹奏楽部' and title = 'コンクール前合同合奏の案内')
   or (club_name = '生徒会執行部' and title = '文化祭パンフレット校正確認');
