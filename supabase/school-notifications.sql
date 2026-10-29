-- CampusSync 学園総合通知: 本文・画像・LINE送信履歴・生徒ごとの既読状態
-- Supabase SQL Editorで実行してください。既存の通知テーブルへ必要な列を追加します。
begin;
alter table public.notifications
  add column if not exists body text not null default '',
  add column if not exists image_url text,
  add column if not exists line_sent boolean not null default false,
  add column if not exists line_sent_at timestamptz,
  add column if not exists line_error text;
create index if not exists notifications_created_at_desc_idx on public.notifications (created_at desc);
create table if not exists public.notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
alter table public.notification_reads enable row level security;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-notification-images', 'school-notification-images', true, 5242880, array['image/jpeg', 'image/png']::text[])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png']::text[];
drop policy if exists school_notification_images_public_read on storage.objects;
create policy school_notification_images_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'school-notification-images');
delete from public.notifications where title in (
  '明日の体育はグラウンドです（熱中症対策を万全に）',
  '図書室の新着おすすめ本が入荷しました！',
  '【重要】週末の部活動のスクールバスダイヤ運行について',
  '【重要】鷹の台駅の電車発車時刻について',
  '食堂の期間限定「栄光フェス丼」メニュー開始のお知らせ',
  '定期考査の範囲表がClassroomにアップロードされました'
);
commit;
select count(*) as remaining_legacy_sample_notices from public.notifications where title in (
  '明日の体育はグラウンドです（熱中症対策を万全に）',
  '図書室の新着おすすめ本が入荷しました！',
  '【重要】週末の部活動のスクールバスダイヤ運行について',
  '【重要】鷹の台駅の電車発車時刻について',
  '食堂の期間限定「栄光フェス丼」メニュー開始のお知らせ',
  '定期考査の範囲表がClassroomにアップロードされました'
);
