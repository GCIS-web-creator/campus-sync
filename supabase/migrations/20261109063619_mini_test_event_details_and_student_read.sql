-- Extend the mini-test schedule table for lesson periods, timing, duration and score details.
-- Restrict student reads to published school-wide records; all writes stay server-side.

begin;

alter table public.mini_test_events
  add column if not exists period smallint,
  add column if not exists start_note text not null default '授業開始直後',
  add column if not exists duration_minutes smallint,
  add column if not exists question_count smallint,
  add column if not exists full_score smallint,
  add column if not exists target_class text not null default 'all';

alter table public.mini_test_events
  drop constraint if exists mini_test_events_period_check,
  add constraint mini_test_events_period_check check (period is null or period between 1 and 12),
  drop constraint if exists mini_test_events_duration_check,
  add constraint mini_test_events_duration_check check (duration_minutes is null or duration_minutes between 1 and 180),
  drop constraint if exists mini_test_events_question_count_check,
  add constraint mini_test_events_question_count_check check (question_count is null or question_count between 1 and 500),
  drop constraint if exists mini_test_events_full_score_check,
  add constraint mini_test_events_full_score_check check (full_score is null or full_score between 1 and 1000),
  drop constraint if exists mini_test_events_start_note_length,
  add constraint mini_test_events_start_note_length check (char_length(start_note) <= 120),
  drop constraint if exists mini_test_events_target_class_length,
  add constraint mini_test_events_target_class_length check (char_length(target_class) between 1 and 80);

alter table public.mini_test_events enable row level security;
revoke all on public.mini_test_events from anon, authenticated;
grant select on public.mini_test_events to authenticated;
grant all on public.mini_test_events to service_role;

drop policy if exists mini_test_events_students_read_published on public.mini_test_events;
create policy mini_test_events_students_read_published
  on public.mini_test_events for select to authenticated
  using (audience = 'school' and status = 'published');

alter table public.line_mini_test_sessions enable row level security;
revoke all on public.line_mini_test_sessions from public, anon, authenticated;
grant all on public.line_mini_test_sessions to service_role;

commit;
