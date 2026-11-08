-- One-time LINE assignment form token storage.
-- Applied to project sgvhktudhxufluuaipwt by Supabase migration
-- line_assignment_form_token_storage on 2026-11-08.

alter table public.line_assignment_sessions
  add column if not exists form_token_hash text;

create unique index if not exists line_assignment_sessions_form_token_hash_uidx
  on public.line_assignment_sessions (form_token_hash)
  where form_token_hash is not null;
