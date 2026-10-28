-- CampusSync 落とし物モデレーション + LINE時刻表送信履歴
-- Supabase SQL Editorで対象プロジェクトに対して1回実行してください。

alter table public.lost_and_found
  add column if not exists status text not null default 'pending',
  add column if not exists student_id text,
  add column if not exists approved_at timestamptz,
  add column if not exists returned_at timestamptz,
  add column if not exists contribution_awarded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lost_and_found_status_check'
      and conrelid = 'public.lost_and_found'::regclass
  ) then
    alter table public.lost_and_found
      add constraint lost_and_found_status_check
      check (status in ('pending', 'approved', 'returned'));
  end if;
end $$;

create index if not exists lost_and_found_status_created_at_idx
  on public.lost_and_found (status, created_at desc);

-- Frontendにあったサンプル3件と完全一致するレコードのみ削除。
-- 同じ品名の実際の投稿は削除しない。
delete from public.lost_and_found
where
  (title = '青いシャープペンシル'
    and location = '図書室'
    and description = 'パイロット製のドクターグリップ（青）です。消しゴムのキャップがありません。')
  or
  (title = '黒い折りたたみ傘'
    and location = '食堂入口の傘立て'
    and description = '無印良品の黒い傘。持ち手に星型のシールが貼ってあります。')
  or
  (title = '電子辞書 (CASIO)'
    and location = '本館3階の渡り廊下'
    and description = '白いケースに入ったEX-wordです。起動画面に名前シールが貼ってあります。');

-- 既存の広すぎるSELECTポリシーが未承認投稿を公開しないよう、
-- lost_and_found に設定済みのポリシーを一度整理して作り直す。
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'lost_and_found'
  loop
    execute format('drop policy if exists %I on public.lost_and_found', policy_row.policyname);
  end loop;
end $$;

alter table public.lost_and_found enable row level security;

create policy lost_and_found_read_published
  on public.lost_and_found for select to authenticated
  using (status = 'approved');

create policy lost_and_found_insert_pending_own_student_id
  on public.lost_and_found for insert to authenticated
  with check (
    status = 'pending'
    and student_id = substring(coalesce(auth.jwt() ->> 'email', '') from '^([0-9]{6})@')
  );

grant select, insert on public.lost_and_found to authenticated;

-- Admin APIはSUPABASE_SERVICE_ROLE_KEYをサーバー側で使用しRLSをバイパスする。
-- 毎時配信履歴（1時間ごとの重複配信を防止）。
create table if not exists public.line_train_timetable_sends (
  window_start timestamptz primary key,
  retry_key uuid not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  sent_at timestamptz,
  request_id text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.line_train_timetable_sends enable row level security;
revoke all on public.line_train_timetable_sends from anon, authenticated;
