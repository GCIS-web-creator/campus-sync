-- CampusSync /hiadmin audit log. Server-side service_role only.
create table if not exists public.hiadmin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_email text not null,
  action text not null,
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists hiadmin_audit_logs_created_at_idx on public.hiadmin_audit_logs (created_at desc);
create index if not exists hiadmin_audit_logs_target_user_idx on public.hiadmin_audit_logs (target_user_id, created_at desc);
alter table public.hiadmin_audit_logs enable row level security;
revoke all privileges on table public.hiadmin_audit_logs from public, anon, authenticated;
grant all privileges on table public.hiadmin_audit_logs to service_role;
