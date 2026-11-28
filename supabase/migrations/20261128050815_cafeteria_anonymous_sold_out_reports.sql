alter table public.cafeteria_sold_out_reports
  alter column reporter_id drop not null;

alter table public.cafeteria_sold_out_reports
  add column if not exists reporter_key text;

alter table public.cafeteria_sold_out_reports
  add constraint cafeteria_sold_out_reports_reporter_key_format
  check (reporter_key is null or reporter_key ~ '^[0-9a-f]{64}$');

create unique index if not exists cafeteria_sold_out_reports_once_per_day_reporter_key
  on public.cafeteria_sold_out_reports (service_date, menu_id, reporter_key);

comment on column public.cafeteria_sold_out_reports.reporter_key is
  'Anonymous reporter identity: HMAC-SHA256 of LINE user ID using a server-only secret. Raw LINE IDs are never stored.';
