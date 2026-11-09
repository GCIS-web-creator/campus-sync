-- CampusSync mini-test schedule shared by LINE, web weekly schedule, and LINE weekly digest.
create table if not exists public.mini_test_events (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  title text not null,
  test_date date not null,
  scope text not null default '',
  notes text not null default '',
  audience text not null default 'personal'
    check (audience in ('personal', 'school')),
  status text not null default 'published'
    check (status in ('pending', 'published', 'rejected', 'cancelled')),
  source text not null default 'web'
    check (source in ('web', 'line', 'admin')),
  created_by uuid references auth.users(id) on delete cascade,
  line_user_id text,
  target_class text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mini_test_events_owner_check check (
    (source = 'line' and line_user_id is not null and created_by is null)
    or (source in ('web', 'admin') and line_user_id is null)
  ),
  constraint mini_test_events_title_length check (char_length(title) between 1 and 160),
  constraint mini_test_events_scope_length check (char_length(scope) <= 1200),
  constraint mini_test_events_notes_length check (char_length(notes) <= 1200)
);

create index if not exists mini_test_events_school_date_idx
  on public.mini_test_events (test_date) where audience = 'school' and status = 'published';
create index if not exists mini_test_events_personal_date_idx
  on public.mini_test_events (created_by, test_date) where audience = 'personal' and status = 'published';
create index if not exists mini_test_events_pending_idx
  on public.mini_test_events (created_at desc) where status = 'pending';

alter table public.mini_test_events enable row level security;
revoke all on table public.mini_test_events from anon, authenticated;
grant all on table public.mini_test_events to service_role;

create table if not exists public.line_mini_test_sessions (
  line_user_id text primary key,
  step text not null,
  draft_data jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.line_mini_test_sessions enable row level security;
revoke all on table public.line_mini_test_sessions from anon, authenticated;
grant all on table public.line_mini_test_sessions to service_role;

comment on table public.mini_test_events is
  'Mini-test schedule. LINE submissions require staff approval before appearing school-wide; web entries are private to their creator.';
