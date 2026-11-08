-- Store in-progress assignment input for a LINE-native conversational registration flow.
-- Existing form_token_hash is retained for compatibility with older issued links.
alter table public.line_assignment_sessions
  add column if not exists draft_data jsonb not null default '{}'::jsonb;

comment on column public.line_assignment_sessions.draft_data is
  'Temporary LINE chat assignment draft; cleared after submission or cancellation.';
