-- HiAdmin's two additional server-side passphrase gate and lockout counter.
create table if not exists public.hiadmin_gate_attempts (
  user_id uuid primary key,
  failed_attempts smallint not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.hiadmin_gate_attempts enable row level security;
revoke all privileges on table public.hiadmin_gate_attempts from public, anon, authenticated;
grant all privileges on table public.hiadmin_gate_attempts to service_role;
