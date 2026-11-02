create table if not exists public.student_test_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_year integer not null check (school_year between 2020 and 2100),
  term smallint not null check (term between 1 and 3),
  exam_type text not null check (
    (term in (1, 2) and exam_type in ('中間考査', '期末考査'))
    or (term = 3 and exam_type = '学年末考査')
  ),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_test_exams_duration_check check (end_date >= start_date and (end_date - start_date) in (2, 3)),
  constraint student_test_exams_user_unique unique (id, user_id),
  constraint student_test_exams_period_unique unique (user_id, school_year, term, exam_type)
);

create table if not exists public.student_test_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null,
  subject text not null check (subject in ('国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健')),
  exam_date date not null,
  sort_order smallint not null default 1 check (sort_order between 1 and 3),
  created_at timestamptz not null default now(),
  constraint student_test_subjects_exam_owner_fkey foreign key (exam_id, user_id)
    references public.student_test_exams(id, user_id) on delete cascade,
  constraint student_test_subjects_exam_subject_unique unique (exam_id, subject),
  constraint student_test_subjects_day_order_unique unique (exam_id, exam_date, sort_order),
  constraint student_test_subjects_id_owner_unique unique (id, user_id)
);

create table if not exists public.student_test_ranges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  notes text not null default '',
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'reviewed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_test_ranges_subject_owner_fkey foreign key (subject_id, user_id)
    references public.student_test_subjects(id, user_id) on delete cascade
);

create table if not exists public.student_study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_subject_id uuid references public.student_test_subjects(id) on delete set null,
  subject_name text not null check (subject_name in ('国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健')),
  task_title text not null default '',
  test_range_title text not null default '',
  focus_seconds integer not null check (focus_seconds > 0 and focus_seconds <= 86400),
  break_seconds integer not null default 0 check (break_seconds >= 0 and break_seconds <= 86400),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  reflection text not null default '',
  next_action text not null default '',
  finish_kind text not null default 'completed' check (finish_kind in ('completed', 'stopped')),
  created_at timestamptz not null default now(),
  constraint student_study_sessions_time_check check (ended_at >= started_at)
);

create index if not exists student_test_exams_user_dates_idx on public.student_test_exams(user_id, start_date desc);
create index if not exists student_test_subjects_exam_date_idx on public.student_test_subjects(user_id, exam_id, exam_date, sort_order);
create index if not exists student_test_ranges_subject_idx on public.student_test_ranges(user_id, subject_id, sort_order);
create index if not exists student_study_sessions_user_started_idx on public.student_study_sessions(user_id, started_at desc);
create index if not exists student_study_sessions_subject_idx on public.student_study_sessions(user_id, subject_name, started_at desc);

alter table public.student_test_exams enable row level security;
alter table public.student_test_subjects enable row level security;
alter table public.student_test_ranges enable row level security;
alter table public.student_study_sessions enable row level security;

grant select, insert, update, delete on public.student_test_exams to authenticated;
grant select, insert, update, delete on public.student_test_subjects to authenticated;
grant select, insert, update, delete on public.student_test_ranges to authenticated;
grant select, insert, update, delete on public.student_study_sessions to authenticated;

drop policy if exists student_test_exams_owner_all on public.student_test_exams;
create policy student_test_exams_owner_all on public.student_test_exams for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists student_test_subjects_owner_all on public.student_test_subjects;
create policy student_test_subjects_owner_all on public.student_test_subjects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists student_test_ranges_owner_all on public.student_test_ranges;
create policy student_test_ranges_owner_all on public.student_test_ranges for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists student_study_sessions_owner_all on public.student_study_sessions;
create policy student_study_sessions_owner_all on public.student_study_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
