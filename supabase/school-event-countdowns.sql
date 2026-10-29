-- CampusSync 学校イベント・カウントダウン
-- Adminが登録したイベントを、生徒用ダッシュボードとLINEリマインダーで共有します。
create table if not exists public.school_event_countdowns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  event_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_event_countdowns_title_length check (char_length(trim(title)) between 1 and 120),
  constraint school_event_countdowns_summary_length check (char_length(summary) <= 1200)
);

create index if not exists school_event_countdowns_active_date_idx
  on public.school_event_countdowns (is_active, event_date asc);

alter table public.school_event_countdowns enable row level security;
revoke all on table public.school_event_countdowns from anon, authenticated;
grant select, insert, update, delete on table public.school_event_countdowns to service_role;

select id, title, event_date, is_active, created_at, updated_at
from public.school_event_countdowns
order by event_date asc
limit 30;
