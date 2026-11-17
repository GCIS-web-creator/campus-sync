alter table public.jma_earthquake_sync_state
  add column if not exists high_lock_token uuid,
  add column if not exists high_lock_expires_at timestamptz,
  add column if not exists long_lock_token uuid,
  add column if not exists long_lock_expires_at timestamptz;

comment on column public.jma_earthquake_sync_state.high_lock_token is
  '高頻度フィード専用の同期ロック。長期補完とは独立して管理する。';
comment on column public.jma_earthquake_sync_state.long_lock_token is
  '長期フィード専用の同期ロック。高頻度速報の取得を妨げない。';