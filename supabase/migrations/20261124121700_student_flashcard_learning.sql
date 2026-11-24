create table if not exists public.student_flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  subject text not null default 'その他' check (char_length(subject) <= 80),
  accent_color text not null default 'blue'
    check (accent_color in ('blue','violet','emerald','amber','rose','cyan')),
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  last_studied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_flashcard_sets_id_owner_unique unique (id, user_id)
);

create table if not exists public.student_flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid not null,
  term text not null check (char_length(trim(term)) between 1 and 2000),
  definition text not null check (char_length(trim(definition)) between 1 and 4000),
  hint text not null default '' check (char_length(hint) <= 1000),
  example text not null default '' check (char_length(example) <= 2000),
  term_image_url text not null default '',
  definition_image_url text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_flashcards_set_owner_fkey
    foreign key (set_id, user_id)
    references public.student_flashcard_sets(id, user_id) on delete cascade,
  constraint student_flashcards_id_owner_unique unique (id, user_id)
);

create table if not exists public.student_flashcard_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  set_id uuid not null,
  status text not null default 'new'
    check (status in ('new','learning','known','review')),
  correct_count integer not null default 0 check (correct_count >= 0),
  incorrect_count integer not null default 0 check (incorrect_count >= 0),
  consecutive_correct integer not null default 0 check (consecutive_correct >= 0),
  interval_days numeric(8,2) not null default 0 check (interval_days >= 0),
  ease_factor numeric(4,2) not null default 2.50 check (ease_factor between 1.30 and 3.00),
  next_review_at timestamptz,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint student_flashcard_progress_card_owner_fkey
    foreign key (card_id, user_id)
    references public.student_flashcards(id, user_id) on delete cascade,
  constraint student_flashcard_progress_set_owner_fkey
    foreign key (set_id, user_id)
    references public.student_flashcard_sets(id, user_id) on delete cascade
);

create table if not exists public.student_flashcard_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid not null,
  mode text not null check (mode in ('flashcards','learn','test','match')),
  card_count integer not null default 0 check (card_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  incorrect_count integer not null default 0 check (incorrect_count >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  score_percent numeric(5,2) not null default 0 check (score_percent between 0 and 100),
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_flashcard_sessions_id_owner_unique unique (id, user_id),
  constraint student_flashcard_sessions_set_owner_fkey
    foreign key (set_id, user_id)
    references public.student_flashcard_sets(id, user_id) on delete cascade
);

create table if not exists public.student_flashcard_session_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  card_id uuid,
  prompt_side text not null default 'term' check (prompt_side in ('term','definition')),
  answer_text text not null default '',
  is_correct boolean not null,
  response_ms integer not null default 0 check (response_ms >= 0),
  created_at timestamptz not null default now(),
  constraint student_flashcard_answers_session_owner_fkey
    foreign key (session_id, user_id)
    references public.student_flashcard_sessions(id, user_id) on delete cascade
);

create index if not exists student_flashcard_sets_user_updated_idx
  on public.student_flashcard_sets(user_id, is_archived, updated_at desc);
create index if not exists student_flashcards_set_sort_idx
  on public.student_flashcards(user_id, set_id, sort_order, created_at);
create index if not exists student_flashcard_progress_user_due_idx
  on public.student_flashcard_progress(user_id, next_review_at);
create index if not exists student_flashcard_sessions_user_created_idx
  on public.student_flashcard_sessions(user_id, created_at desc);
create index if not exists student_flashcard_sessions_set_created_idx
  on public.student_flashcard_sessions(user_id, set_id, created_at desc);
create index if not exists student_flashcard_answers_session_idx
  on public.student_flashcard_session_answers(user_id, session_id, created_at);

alter table public.student_flashcard_sets enable row level security;
alter table public.student_flashcards enable row level security;
alter table public.student_flashcard_progress enable row level security;
alter table public.student_flashcard_sessions enable row level security;
alter table public.student_flashcard_session_answers enable row level security;

grant select, insert, update, delete on public.student_flashcard_sets to authenticated;
grant select, insert, update, delete on public.student_flashcards to authenticated;
grant select, insert, update, delete on public.student_flashcard_progress to authenticated;
grant select, insert, update, delete on public.student_flashcard_sessions to authenticated;
grant select, insert, update, delete on public.student_flashcard_session_answers to authenticated;

drop policy if exists student_flashcard_sets_owner_all on public.student_flashcard_sets;
create policy student_flashcard_sets_owner_all on public.student_flashcard_sets
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists student_flashcards_owner_all on public.student_flashcards;
create policy student_flashcards_owner_all on public.student_flashcards
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists student_flashcard_progress_owner_all on public.student_flashcard_progress;
create policy student_flashcard_progress_owner_all on public.student_flashcard_progress
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists student_flashcard_sessions_owner_all on public.student_flashcard_sessions;
create policy student_flashcard_sessions_owner_all on public.student_flashcard_sessions
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists student_flashcard_answers_owner_all on public.student_flashcard_session_answers;
create policy student_flashcard_answers_owner_all on public.student_flashcard_session_answers
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
