create table if not exists public.attendance_reports (
  id uuid primary key default gen_random_uuid(),
  student_id text not null check (student_id ~ '^[0-9]{6}$'),
  student_name text not null check (char_length(student_name) between 1 and 80),
  user_class text not null check (user_class ~ '^[1-3]-[1-8]$'),
  report_type text not null check (report_type in ('absence','late','early_leave')),
  report_date date not null,
  expected_time time,
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'received' check (status in ('received','reviewing','processed','needs_contact','canceled')),
  admin_note text not null default '' check (char_length(admin_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index if not exists attendance_reports_one_active_per_day
  on public.attendance_reports (student_id, report_date)
  where status <> 'canceled';
create index if not exists attendance_reports_date_class_idx
  on public.attendance_reports (report_date desc, user_class);
create index if not exists attendance_reports_status_date_idx
  on public.attendance_reports (status, report_date desc);
alter table public.attendance_reports enable row level security;
revoke all on public.attendance_reports from anon, authenticated;
grant all on public.attendance_reports to service_role;