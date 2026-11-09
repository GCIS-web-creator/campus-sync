-- Admin-selected JMA earthquakes can be pushed to registered LINE groups only.
create table if not exists public.jma_earthquake_admin_group_notices (
  id bigint generated always as identity primary key,
  event_key text not null unique references public.jma_earthquakes(event_key) on delete cascade,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  groups_sent_at timestamptz,
  groups_result jsonb,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jma_earthquake_admin_group_notices_created_at_idx
  on public.jma_earthquake_admin_group_notices (created_at desc);
alter table public.jma_earthquake_admin_group_notices enable row level security;
revoke all on public.jma_earthquake_admin_group_notices from public, anon, authenticated;
grant all on public.jma_earthquake_admin_group_notices to service_role;
grant usage, select on sequence public.jma_earthquake_admin_group_notices_id_seq to service_role;
comment on table public.jma_earthquake_admin_group_notices is
  '管理者が気象庁発表の実在する地震情報を選択し、LINE登録グループへ手動通知した履歴。公式アカウント一斉配信は行わない。';
