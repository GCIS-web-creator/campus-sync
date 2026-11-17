create table if not exists public.admin_login_attempts (
  ip_hash text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_auth_audit_logs (
  id uuid primary key default gen_random_uuid(),
  method text not null,
  outcome text not null,
  reason text not null,
  ip_hash text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists admin_auth_audit_logs_created_at_idx
  on public.admin_auth_audit_logs (created_at desc);
create index if not exists admin_auth_audit_logs_outcome_created_at_idx
  on public.admin_auth_audit_logs (outcome, created_at desc);

alter table public.admin_login_attempts enable row level security;
alter table public.admin_auth_audit_logs enable row level security;
revoke all privileges on table public.admin_login_attempts from public, anon, authenticated;
revoke all privileges on table public.admin_auth_audit_logs from public, anon, authenticated;
grant all privileges on table public.admin_login_attempts to service_role;
grant all privileges on table public.admin_auth_audit_logs to service_role;

create or replace function public.record_admin_login_failure(
  p_ip_hash text,
  p_now timestamptz default now()
)
returns table (failed_attempts integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.admin_login_attempts as existing_row (
    ip_hash, failed_attempts, locked_until, updated_at
  )
  values (p_ip_hash, 1, null, p_now)
  on conflict (ip_hash) do update
  set
    failed_attempts = case
      when existing_row.locked_until is not null and existing_row.locked_until > p_now
        then existing_row.failed_attempts
      when existing_row.locked_until is not null and existing_row.locked_until <= p_now
        then 1
      else existing_row.failed_attempts + 1
    end,
    locked_until = case
      when existing_row.locked_until is not null and existing_row.locked_until > p_now
        then existing_row.locked_until
      when existing_row.locked_until is not null and existing_row.locked_until <= p_now
        then null
      when existing_row.failed_attempts + 1 >= 5
        then p_now + interval '15 minutes'
      else null
    end,
    updated_at = p_now
  returning existing_row.failed_attempts, existing_row.locked_until;
end;
$$;

revoke all on function public.record_admin_login_failure(text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_admin_login_failure(text, timestamptz) to service_role;