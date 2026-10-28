-- CampusSync cafeteria menu metadata and genuine student sold-out reports.
-- Run in the Supabase SQL Editor. Safe to run more than once.

-- The monthly menu remains the single source of truth for the day's meal name,
-- price, calories and allergen information.
alter table public.cafeteria_daily_menus
  add column if not exists soka_lunch_price text not null default '',
  add column if not exists soka_lunch_calorie text not null default '',
  add column if not exists soka_lunch_allergy text not null default '',
  add column if not exists healthy_lunch_price text not null default '',
  add column if not exists healthy_lunch_calorie text not null default '',
  add column if not exists healthy_lunch_allergy text not null default '',
  add column if not exists snack_lunch_price text not null default '',
  add column if not exists snack_lunch_calorie text not null default '',
  add column if not exists snack_lunch_allergy text not null default '',
  add column if not exists curry_price text not null default '',
  add column if not exists curry_calorie text not null default '',
  add column if not exists curry_allergy text not null default '',
  add column if not exists noodles_price text not null default '',
  add column if not exists noodles_calorie text not null default '',
  add column if not exists noodles_allergy text not null default '';

-- A student can report a given menu as sold out once per day.
-- A report is not the official sold-out state: Admin reviews it and toggles
-- cafeteria_sold_out when confirmed.
create table if not exists public.cafeteria_sold_out_reports (
  id bigint generated always as identity primary key,
  service_date date not null default ((now() at time zone 'Asia/Tokyo')::date),
  menu_id text not null check (menu_id in ('soka', 'healthy', 'snack', 'curry', 'noodles')),
  reporter_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint cafeteria_sold_out_reports_once_per_day
    unique (service_date, menu_id, reporter_id)
);

create index if not exists cafeteria_sold_out_reports_date_menu_idx
  on public.cafeteria_sold_out_reports (service_date, menu_id);

alter table public.cafeteria_sold_out_reports enable row level security;
revoke all on public.cafeteria_sold_out_reports from public, anon, authenticated;
grant select, insert on public.cafeteria_sold_out_reports to authenticated;
grant usage, select on sequence public.cafeteria_sold_out_reports_id_seq to authenticated;

drop policy if exists cafeteria_sold_out_reports_read_own on public.cafeteria_sold_out_reports;
create policy cafeteria_sold_out_reports_read_own
  on public.cafeteria_sold_out_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists cafeteria_sold_out_reports_insert_own on public.cafeteria_sold_out_reports;
create policy cafeteria_sold_out_reports_insert_own
  on public.cafeteria_sold_out_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and service_date = ((now() at time zone 'Asia/Tokyo')::date)
  );

-- Return only aggregate counts, not student identities, to the Admin UI.
create or replace function public.get_cafeteria_sold_out_report_counts(p_service_date date)
returns table (menu_id text, report_count bigint)
language sql
security definer
set search_path = ''
as $function$
  select r.menu_id, count(*)::bigint as report_count
  from public.cafeteria_sold_out_reports r
  where r.service_date = p_service_date
  group by r.menu_id;
$function$;

revoke all on function public.get_cafeteria_sold_out_report_counts(date)
  from public, anon, authenticated;
grant execute on function public.get_cafeteria_sold_out_report_counts(date)
  to anon, authenticated, service_role;

comment on table public.cafeteria_sold_out_reports is
  'Daily student reports that a menu may be sold out. Admin confirms official status separately.';
comment on function public.get_cafeteria_sold_out_report_counts(date) is
  'Returns daily aggregate sold-out report counts without exposing reporter identities.';
