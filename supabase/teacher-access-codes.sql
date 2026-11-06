-- Teacher access codes for passwordless, non-student read-only access.
-- Codes and session tokens are stored as SHA-256 hashes only.
create table if not exists public.teacher_access_codes (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  code_hash text not null unique,
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default true,
  use_count integer not null default 0 check (use_count >= 0),
  session_generation integer not null default 1,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint teacher_access_codes_valid_range check (starts_on <= ends_on)
);

create table if not exists public.teacher_access_sessions (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid not null references public.teacher_access_codes(id) on delete cascade,
  session_token_hash text not null unique,
  session_generation integer not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.teacher_access_codes
  add column if not exists session_generation integer not null default 1;
alter table public.teacher_access_sessions
  add column if not exists session_generation integer not null default 1;

create index if not exists teacher_access_sessions_code_idx
  on public.teacher_access_sessions(access_code_id);
create index if not exists teacher_access_sessions_expiry_idx
  on public.teacher_access_sessions(expires_at);

alter table public.teacher_access_codes enable row level security;
alter table public.teacher_access_sessions enable row level security;
revoke all on public.teacher_access_codes from anon, authenticated;
revoke all on public.teacher_access_sessions from anon, authenticated;
grant all on public.teacher_access_codes to service_role;
grant all on public.teacher_access_sessions to service_role;
