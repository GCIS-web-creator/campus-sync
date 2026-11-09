-- CampusSync official exam schedules and student-submitted assignment workflow.
-- Applied to project sgvhktudhxufluuaipwt on 2026-11-07.
-- Admin-only writes for official school exam schedules; students can read and manage only their own study ranges.

begin;

alter table public.assignments
  add column if not exists subject text not null default 'その他',
  add column if not exists target_class text not null default 'all',
  add column if not exists subject_option text not null default '';

alter table public.assignments
  drop constraint if exists assignments_target_class_check;
alter table public.assignments
  add constraint assignments_target_class_check
  check (target_class in ('all', 'science'));

create index if not exists assignments_active_due_subject_idx
  on public.assignments (is_active, due_at, subject);

create table if not exists public.school_test_exams (
  id uuid primary key default gen_random_uuid(),
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
  constraint school_test_exams_duration_check
    check (end_date >= start_date and (end_date - start_date) in (2, 3)),
  constraint school_test_exams_period_unique
    unique (school_year, term, exam_type)
);

create table if not exists public.school_test_subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.school_test_exams(id) on delete cascade,
  subject text not null check (subject in (
    '国語演習', '古典探求', '物理', '生物', '数３', '数C',
    '公共', '英コミュ', '論表', '情報', '保健'
  )),
  exam_date date not null,
  sort_order smallint not null default 1 check (sort_order between 1 and 3),
  created_at timestamptz not null default now(),
  constraint school_test_subject_exam_subject_unique unique (exam_id, subject),
  constraint school_test_subject_day_order_unique unique (exam_id, exam_date, sort_order)
);

create index if not exists school_test_exams_dates_idx
  on public.school_test_exams (start_date desc, school_year desc);
create index if not exists school_test_subjects_exam_date_idx
  on public.school_test_subjects (exam_id, exam_date, sort_order);

alter table public.school_test_exams enable row level security;
alter table public.school_test_subjects enable row level security;
revoke all on public.school_test_exams from anon, authenticated;
revoke all on public.school_test_subjects from anon, authenticated;
grant select on public.school_test_exams to authenticated;
grant select on public.school_test_subjects to authenticated;
grant all on public.school_test_exams to service_role;
grant all on public.school_test_subjects to service_role;

drop policy if exists school_test_exams_authenticated_read on public.school_test_exams;
create policy school_test_exams_authenticated_read
  on public.school_test_exams for select to authenticated using (true);
drop policy if exists school_test_subjects_authenticated_read on public.school_test_subjects;
create policy school_test_subjects_authenticated_read
  on public.school_test_subjects for select to authenticated using (true);

-- Existing per-user exam tables are retained read-only for history; writes are revoked.
drop policy if exists student_test_exams_owner_all on public.student_test_exams;
drop policy if exists student_test_subjects_owner_all on public.student_test_subjects;
revoke insert, update, delete on public.student_test_exams from authenticated;
revoke insert, update, delete on public.student_test_subjects from authenticated;
grant select on public.student_test_exams to authenticated;
grant select on public.student_test_subjects to authenticated;
drop policy if exists student_test_exams_owner_read on public.student_test_exams;
create policy student_test_exams_owner_read
  on public.student_test_exams for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists student_test_subjects_owner_read on public.student_test_subjects;
create policy student_test_subjects_owner_read
  on public.student_test_subjects for select to authenticated
  using ((select auth.uid()) = user_id);

alter table public.student_test_ranges
  alter column subject_id drop not null,
  add column if not exists school_test_subject_id uuid
    references public.school_test_subjects(id) on delete cascade;
create index if not exists student_test_ranges_school_subject_idx
  on public.student_test_ranges (user_id, school_test_subject_id, sort_order);

create table if not exists public.line_assignment_sessions (
  line_user_id text primary key,
  step text not null default 'awaiting_assignment_details' check (step = 'awaiting_assignment_details'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assignment_suggestions (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  details text not null default '' check (char_length(details) <= 5000),
  subject text not null check (subject in (
    '国語演習', '古典探求', '物理', '化学', '生物', '数３', '数C',
    '公共', '英コミュ', '論表', '情報', '保健', 'その他'
  )),
  target_class text not null default 'all' check (target_class in ('all', 'science')),
  subject_option text not null default '',
  type text not null default 'paper' check (type in ('paper', 'classroom', 'other')),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processing', 'approved', 'rejected')),
  assignment_id uuid references public.assignments(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.assignment_suggestions
  add column if not exists assignment_id uuid references public.assignments(id) on delete set null;
alter table public.assignment_suggestions
  drop constraint if exists assignment_suggestions_status_check;
alter table public.assignment_suggestions
  add constraint assignment_suggestions_status_check
  check (status in ('pending', 'processing', 'approved', 'rejected'));

create index if not exists assignment_suggestions_pending_idx
  on public.assignment_suggestions (status, created_at desc);

alter table public.line_assignment_sessions enable row level security;
alter table public.assignment_suggestions enable row level security;
revoke all on public.line_assignment_sessions from public, anon, authenticated;
revoke all on public.assignment_suggestions from public, anon, authenticated;
grant all on public.line_assignment_sessions to service_role;
grant all on public.assignment_suggestions to service_role;

commit;
