-- CampusSync 週間学校予定表
-- Adminが月曜〜日曜を1週単位で保存し、生徒用画面とLINE Flex配信で共有します。
create table if not exists public.school_weekly_schedules (
  week_start date primary key,
  title text not null default '学校予定表',
  days jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_weekly_schedules_monday check (extract(isodow from week_start) = 1),
  constraint school_weekly_schedules_title_length check (char_length(title) between 1 and 100),
  constraint school_weekly_schedules_days_array check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) = 7)
);

alter table public.school_weekly_schedules enable row level security;
revoke all on table public.school_weekly_schedules from anon, authenticated;
grant select, insert, update, delete on table public.school_weekly_schedules to service_role;

create index if not exists school_weekly_schedules_updated_at_idx
  on public.school_weekly_schedules (updated_at desc);

select week_start, title, jsonb_array_length(days) as day_count, updated_at
from public.school_weekly_schedules
order by week_start desc
limit 12;
