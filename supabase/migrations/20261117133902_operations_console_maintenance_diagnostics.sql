create table if not exists public.system_diagnostic_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  severity text not null default 'error'
    check (severity in ('debug','info','warning','error','fatal')),
  source text not null default 'next'
    check (source in ('next','api','cron','client','admin','system')),
  system_key text not null default 'core',
  event_code text not null,
  message text not null,
  route_path text,
  request_id text,
  status_code integer,
  duration_ms integer,
  details jsonb not null default '{}'::jsonb
);

create index if not exists system_diagnostic_logs_created_at_idx
  on public.system_diagnostic_logs (created_at desc);
create index if not exists system_diagnostic_logs_system_created_idx
  on public.system_diagnostic_logs (system_key, created_at desc);
create index if not exists system_diagnostic_logs_severity_created_idx
  on public.system_diagnostic_logs (severity, created_at desc);

create table if not exists public.system_maintenance_modes (
  system_key text primary key,
  label text not null,
  mode text not null default 'normal'
    check (mode in ('normal','notice','maintenance')),
  notice_title text not null default '',
  notice_message text not null default '',
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists system_maintenance_modes_updated_at_idx
  on public.system_maintenance_modes (updated_at desc);

alter table public.system_diagnostic_logs enable row level security;
alter table public.system_maintenance_modes enable row level security;

revoke all privileges on table public.system_diagnostic_logs from public, anon, authenticated;
revoke all privileges on table public.system_maintenance_modes from public, anon, authenticated;
grant select, insert, update, delete on table public.system_diagnostic_logs to service_role;
grant select, insert, update, delete on table public.system_maintenance_modes to service_role;

insert into public.system_maintenance_modes (system_key, label)
values
 ('global','CampusSync全体'),
 ('dashboard','ホーム・ダッシュボード'),
 ('assignments','課題・提出物'),
 ('timetable','クラス時間割'),
 ('transport','電車・交通'),
 ('cafeteria','学食・献立'),
 ('chat','クラス・学年・全校チャット'),
 ('campus-ai','CSAI'),
 ('notes','メモ・ノート'),
 ('calculator','関数電卓'),
 ('learning','学習記録・試験対策'),
 ('materials','資料室'),
 ('attendance','出欠連絡'),
 ('student-id','デジタル生徒証'),
 ('workspaces','共有ワークスペース'),
 ('facilities','校内施設・マップ'),
 ('weather','天気・気象情報'),
 ('earthquakes','地震情報'),
 ('countdowns','学校行事・カウントダウン'),
 ('notifications','お知らせ・通知'),
 ('club-notes','部活・委員会ノート'),
 ('library','図書館'),
 ('lost-found','落とし物'),
 ('career-center','キャリアセンター'),
 ('settings','生徒設定')
on conflict (system_key) do nothing;
