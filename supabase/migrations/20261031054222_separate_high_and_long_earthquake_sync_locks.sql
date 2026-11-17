-- Separate lock tokens and expiry timestamps for the JMA high-priority and long-feed sync jobs.
alter table public.jma_earthquake_sync_state
  add column if not exists high_lock_token uuid,
  add column if not exists high_lock_expires_at timestamptz,
  add column if not exists long_lock_token uuid,
  add column if not exists long_lock_expires_at timestamptz;
