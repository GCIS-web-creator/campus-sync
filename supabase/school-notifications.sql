-- 学園総合通知の詳細本文を保存するための追加カラム。
-- Supabase SQL Editorで一度だけ実行してください。
begin;

alter table public.notifications
  add column if not exists body text not null default '';

create index if not exists notifications_created_at_desc_idx
  on public.notifications (created_at desc);

commit;
