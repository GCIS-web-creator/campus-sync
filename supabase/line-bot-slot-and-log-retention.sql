-- LINE webhook BOT slot tracking, group delivery logs and 14-day operational-log retention.
-- This is idempotent and safe to re-run after the migration is applied.

alter table public.line_group_chats
  add column if not exists bot_slot smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.line_group_chats'::regclass
      and conname = 'line_group_chats_bot_slot_check'
  ) then
    alter table public.line_group_chats
      add constraint line_group_chats_bot_slot_check
      check (bot_slot is null or bot_slot between 1 and 3) not valid;
  end if;
end
$$;

alter table public.line_broadcast_history
  add column if not exists delivery_batch_id uuid;

create index if not exists line_broadcast_history_delivery_batch_idx
  on public.line_broadcast_history (delivery_batch_id);

create table if not exists public.line_group_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  delivery_batch_id uuid not null,
  kind text not null,
  chat_id text not null,
  chat_type text not null check (chat_type in ('group', 'room')),
  bot_slot smallint,
  status text not null check (status in ('success', 'failure')),
  http_status integer,
  error_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (delivery_batch_id, chat_id),
  constraint line_group_delivery_logs_bot_slot_check
    check (bot_slot is null or bot_slot between 1 and 3)
);

create index if not exists line_group_delivery_logs_batch_idx
  on public.line_group_delivery_logs (delivery_batch_id, sent_at desc);
create index if not exists line_group_delivery_logs_sent_at_idx
  on public.line_group_delivery_logs (sent_at desc);

alter table public.line_group_delivery_logs enable row level security;
revoke all on table public.line_group_delivery_logs from anon, authenticated;
grant select, insert, update, delete on table public.line_group_delivery_logs to service_role;

-- Daily at 03:00 JST. Keep technical cron and group-delivery logs for 14 days.
select cron.unschedule(jobid)
from cron.job
where jobname = 'campussync-log-retention-14d';

select cron.schedule(
  'campussync-log-retention-14d',
  '0 18 * * *',
  $cron$
    DO $job$
    BEGIN
      DELETE FROM cron.job_run_details
      WHERE end_time < now() - interval '14 days';

      DELETE FROM public.line_group_delivery_logs
      WHERE sent_at < now() - interval '14 days';
    END;
    $job$
  $cron$
);

-- Restrict book cover images to 5 MB and safe image formats.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'book - images';
