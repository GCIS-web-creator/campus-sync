-- Pin the service-only schedule change trigger functions to a safe search path.
alter function public.campussync_log_assignment_schedule_change() set search_path = '';
alter function public.campussync_log_exam_schedule_change() set search_path = '';
alter function public.campussync_log_mini_test_schedule_change() set search_path = '';

-- The Admin completion overview and per-task lookups filter by assignment_id.
create index if not exists assignment_completions_assignment_id_idx
  on public.assignment_completions (assignment_id);
