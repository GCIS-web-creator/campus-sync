-- 学食売切通知を即時送信せず、Adminの送信ボタンでまとめて送るための通知済み時刻
-- 既存の売切状態は維持します。Supabase SQL Editorで一度実行してください。

alter table public.cafeteria_sold_out
  add column if not exists line_notified_at timestamptz null;

create index if not exists cafeteria_sold_out_pending_line_idx
  on public.cafeteria_sold_out (is_sold_out, line_notified_at)
  where is_sold_out = true and line_notified_at is null;

comment on column public.cafeteria_sold_out.line_notified_at is
  'LINE売切Flexの送信済み時刻。販売再開または再度売切にするとNULLへ戻します。';

select menu_id, is_sold_out, line_notified_at
from public.cafeteria_sold_out
order by menu_id;
