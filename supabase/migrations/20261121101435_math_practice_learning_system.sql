create table if not exists public.math_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 120),
  course text not null check (course in ('数学I', '数学A', '数学II', '数学B', '数学III', '数学C')),
  unit text not null check (char_length(unit) between 1 and 120),
  is_correct boolean not null,
  answer_text text not null default '' check (char_length(answer_text) <= 2000),
  mode text not null default 'unit' check (mode in ('unit', 'random', 'timed', 'review', 'mock')),
  time_spent_seconds integer not null default 0 check (time_spent_seconds between 0 and 86400),
  created_at timestamptz not null default now()
);

create table if not exists public.math_mock_test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course text not null check (course in ('数学I', '数学A', '数学II', '数学B', '数学III', '数学C')),
  question_ids text[] not null default '{}',
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 86400),
  created_at timestamptz not null default now()
);

create index if not exists math_practice_attempts_user_created_idx
  on public.math_practice_attempts(user_id, created_at desc);
create index if not exists math_practice_attempts_user_question_idx
  on public.math_practice_attempts(user_id, question_id, created_at desc);
create index if not exists math_practice_attempts_user_course_unit_idx
  on public.math_practice_attempts(user_id, course, unit, created_at desc);
create index if not exists math_mock_test_results_user_created_idx
  on public.math_mock_test_results(user_id, created_at desc);

alter table public.math_practice_attempts enable row level security;
alter table public.math_mock_test_results enable row level security;

revoke all on public.math_practice_attempts from anon, public;
revoke all on public.math_mock_test_results from anon, public;
grant select, insert on public.math_practice_attempts to authenticated;
grant select, insert on public.math_mock_test_results to authenticated;

drop policy if exists math_practice_attempts_owner_select on public.math_practice_attempts;
create policy math_practice_attempts_owner_select on public.math_practice_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists math_practice_attempts_owner_insert on public.math_practice_attempts;
create policy math_practice_attempts_owner_insert on public.math_practice_attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists math_mock_test_results_owner_select on public.math_mock_test_results;
create policy math_mock_test_results_owner_select on public.math_mock_test_results
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists math_mock_test_results_owner_insert on public.math_mock_test_results;
create policy math_mock_test_results_owner_insert on public.math_mock_test_results
  for insert to authenticated with check ((select auth.uid()) = user_id);

comment on table public.math_practice_attempts is
  'CampusSync数学演習の回答履歴。生徒本人の行のみ参照・追加できる。';
comment on table public.math_mock_test_results is
  'CampusSync数学模擬試験の結果。生徒本人の行のみ参照・追加できる。';
