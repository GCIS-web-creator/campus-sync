-- CampusSync Admin login lockout counter.
-- The IP address itself is never stored; the application stores an HMAC fingerprint.
create or replace function public.record_admin_login_attempt(
  p_ip_hash text,
  p_succeeded boolean,
  p_max_failures integer default 5,
  p_lock_minutes integer default 15
)
returns table(failed_attempts integer, locked_until timestamptz)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_failed_attempts integer;
  v_locked_until timestamptz;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid admin login fingerprint';
  end if;
  if p_max_failures < 1 or p_max_failures > 20 then
    raise exception 'Invalid admin login failure threshold';
  end if;
  if p_lock_minutes < 1 or p_lock_minutes > 1440 then
    raise exception 'Invalid admin login lock duration';
  end if;

  insert into public.admin_login_attempts as existing
    (ip_hash, failed_attempts, locked_until, updated_at)
  values (
    p_ip_hash,
    case when p_succeeded then 0 else 1 end,
    case when not p_succeeded and p_max_failures <= 1
      then now() + make_interval(mins => p_lock_minutes)
      else null
    end,
    now()
  )
  on conflict (ip_hash) do update
  set
    failed_attempts = case
      when p_succeeded then 0
      when existing.locked_until is not null and existing.locked_until <= now() then 1
      else existing.failed_attempts + 1
    end,
    locked_until = case
      when p_succeeded then null
      when (
        case
          when existing.locked_until is not null and existing.locked_until <= now() then 1
          else existing.failed_attempts + 1
        end
      ) >= p_max_failures then now() + make_interval(mins => p_lock_minutes)
      else null
    end,
    updated_at = now()
  returning existing.failed_attempts, existing.locked_until
  into v_failed_attempts, v_locked_until;

  return query select v_failed_attempts, v_locked_until;
end;
$$;

alter table public.admin_login_attempts enable row level security;
alter table public.admin_auth_audit_logs enable row level security;

revoke all privileges on table public.admin_login_attempts from public, anon, authenticated;
revoke all privileges on table public.admin_auth_audit_logs from public, anon, authenticated;
grant select, insert, update on table public.admin_login_attempts to service_role;
grant select, insert on table public.admin_auth_audit_logs to service_role;

revoke all privileges on function public.record_admin_login_attempt(text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.record_admin_login_attempt(text, boolean, integer, integer) to service_role;

create index if not exists admin_auth_audit_logs_created_at_idx
  on public.admin_auth_audit_logs (created_at desc);
