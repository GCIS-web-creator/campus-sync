create table if not exists public.planetube_connections (
  id uuid primary key default gen_random_uuid(),
  campus_user_id uuid not null references auth.users(id) on delete cascade,
  planetube_user_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'linked', 'revoked')),
  pairing_code_hash text unique,
  pairing_code_expires_at timestamptz,
  approved_scopes text[] not null default '{}'::text[]
    check (approved_scopes <@ array['planet:read','focus:sync','extension:control','contribution:sync']::text[]),
  planet_level integer check (planet_level is null or planet_level >= 0),
  planet_growth_points bigint check (planet_growth_points is null or planet_growth_points >= 0),
  planet_synced_at timestamptz,
  last_extension_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  linked_at timestamptz,
  revoked_at timestamptz,
  constraint planetube_connections_campus_user_id_key unique (campus_user_id)
);

create table if not exists public.planetube_extension_events (
  id uuid primary key default gen_random_uuid(),
  campus_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'extension_ready','extension_disconnected','focus_started','focus_paused',
    'focus_resumed','break_started','focus_resumed_from_break','session_ended',
    'extension_error','restriction_status'
  )),
  timer_session_id uuid,
  extension_version text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists planetube_connections_status_idx
  on public.planetube_connections(status, updated_at desc);
create index if not exists planetube_extension_events_user_created_idx
  on public.planetube_extension_events(campus_user_id, created_at desc);
create index if not exists planetube_extension_events_type_created_idx
  on public.planetube_extension_events(event_type, created_at desc);

alter table public.planetube_connections enable row level security;
alter table public.planetube_extension_events enable row level security;

drop policy if exists planetube_connections_select_own on public.planetube_connections;
create policy planetube_connections_select_own
  on public.planetube_connections for select to authenticated
  using (auth.uid() = campus_user_id);

drop policy if exists planetube_extension_events_select_own on public.planetube_extension_events;
create policy planetube_extension_events_select_own
  on public.planetube_extension_events for select to authenticated
  using (auth.uid() = campus_user_id);

revoke all on public.planetube_connections from anon, authenticated;
revoke all on public.planetube_extension_events from anon, authenticated;
grant select on public.planetube_connections to authenticated;
grant select on public.planetube_extension_events to authenticated;
grant all on public.planetube_connections to service_role;
grant all on public.planetube_extension_events to service_role;

comment on table public.planetube_connections is
  'CampusSync-to-Planetube account link. Stores only partner user ID, consent scopes, and minimal planet summary; never stores school email or passwords.';
comment on column public.planetube_connections.approved_scopes is
  'Explicit user-approved scopes: planet:read, focus:sync, extension:control, contribution:sync.';
comment on table public.planetube_extension_events is
  'Minimal extension health events. Never store task names, school subjects, page URLs, or browsing history.';
