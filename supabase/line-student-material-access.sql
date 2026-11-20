-- LINE student identity linking and administrator-verified class access.
-- This script is safe to rerun on the same CampusSync Supabase project.

alter table public.profiles
  add column if not exists verified_class text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_verified_class_format_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_verified_class_format_check
      check (verified_class is null or verified_class ~ '^[1-3]-[1-8]$');
  end if;
end $$;

create or replace function public.protect_profiles_verified_class()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    if tg_op = 'INSERT' then
      new.verified_class := null;
    else
      new.verified_class := old.verified_class;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profiles_verified_class_trigger on public.profiles;
create trigger protect_profiles_verified_class_trigger
before insert or update of verified_class on public.profiles
for each row execute function public.protect_profiles_verified_class();

create table if not exists public.line_student_links (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  student_id text not null unique,
  line_user_id text unique,
  code_hash text unique,
  code_expires_at timestamptz,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.line_student_link_attempts (
  line_user_id text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint line_student_link_attempts_count_check check (attempt_count >= 0)
);

alter table public.line_student_links enable row level security;
alter table public.line_student_link_attempts enable row level security;

revoke all on table public.line_student_links from public, anon, authenticated;
revoke all on table public.line_student_link_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.line_student_links to service_role;
grant select, insert, update, delete on table public.line_student_link_attempts to service_role;

create or replace function public.claim_line_student_link_code(
  p_line_user_id text,
  p_code_hash text
)
returns table(ok boolean, reason text, linked_student_id text, linked_auth_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.line_student_link_attempts%rowtype;
  v_link public.line_student_links%rowtype;
  v_now timestamptz := now();
begin
  if p_line_user_id is null
     or p_line_user_id !~ '^U[A-Za-z0-9]{20,40}$'
     or p_code_hash is null
     or p_code_hash !~ '^[0-9a-f]{64}$' then
    return query select false, 'invalid_input', null::text, null::uuid;
    return;
  end if;

  insert into public.line_student_link_attempts (
    line_user_id, window_started_at, attempt_count, blocked_until, updated_at
  )
  values (p_line_user_id, v_now, 1, null, v_now)
  on conflict (line_user_id) do update set
    window_started_at = case
      when public.line_student_link_attempts.window_started_at <= v_now - interval '10 minutes'
        then v_now
      else public.line_student_link_attempts.window_started_at
    end,
    attempt_count = case
      when public.line_student_link_attempts.window_started_at <= v_now - interval '10 minutes'
        then 1
      else public.line_student_link_attempts.attempt_count + 1
    end,
    blocked_until = case
      when public.line_student_link_attempts.blocked_until > v_now
        then public.line_student_link_attempts.blocked_until
      when public.line_student_link_attempts.window_started_at <= v_now - interval '10 minutes'
        then null
      else public.line_student_link_attempts.blocked_until
    end,
    updated_at = v_now
  returning * into v_attempt;

  if v_attempt.blocked_until is not null and v_attempt.blocked_until > v_now then
    return query select false, 'rate_limited', null::text, null::uuid;
    return;
  end if;

  if v_attempt.attempt_count > 5 then
    update public.line_student_link_attempts
      set blocked_until = v_now + interval '15 minutes', updated_at = v_now
      where line_user_id = p_line_user_id;
    return query select false, 'rate_limited', null::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.line_student_links
    where line_user_id = p_line_user_id and linked_at is not null
  ) then
    return query select false, 'already_linked', null::text, null::uuid;
    return;
  end if;

  update public.line_student_links
    set line_user_id = p_line_user_id,
        code_hash = null,
        code_expires_at = null,
        linked_at = v_now,
        updated_at = v_now
    where code_hash = p_code_hash
      and code_expires_at > v_now
      and line_user_id is null
    returning * into v_link;

  if not found then
    return query select false, 'invalid_or_expired', null::text, null::uuid;
    return;
  end if;

  return query select true, 'linked', v_link.student_id, v_link.auth_user_id;
exception
  when unique_violation then
    return query select false, 'already_linked', null::text, null::uuid;
end;
$$;

revoke all on function public.claim_line_student_link_code(text, text) from public, anon, authenticated;
grant execute on function public.claim_line_student_link_code(text, text) to service_role;
