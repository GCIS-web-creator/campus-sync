alter table public.line_assignment_sessions
  add column if not exists form_token_hash text;

create unique index if not exists line_assignment_sessions_form_token_hash_uidx
  on public.line_assignment_sessions (form_token_hash)
  where form_token_hash is not null;;
