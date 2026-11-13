-- Shared school-published exam scopes for CampusSync.
-- Student-specific progress remains in student_test_ranges.

create table if not exists public.school_test_ranges (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.school_test_exams(id) on delete cascade,
  subject text not null,
  display_subject text not null,
  audience text not null default '2年理系',
  range_sections jsonb not null default '[]'::jsonb,
  sort_order smallint not null default 0,
  broadcast_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_test_ranges_sections_array check (jsonb_typeof(range_sections) = 'array'),
  constraint school_test_ranges_sort_order_nonnegative check (sort_order >= 0),
  constraint school_test_ranges_exam_audience_subject_key unique (exam_id, audience, subject)
);

alter table public.school_test_ranges enable row level security;
grant select on public.school_test_ranges to authenticated;
drop policy if exists school_test_ranges_authenticated_read on public.school_test_ranges;
create policy school_test_ranges_authenticated_read
  on public.school_test_ranges for select to authenticated using (true);

-- Subject test dates are intentionally unset because the supplied notice did not include them.
with target_exam as (
  select id from public.school_test_exams
  where school_year = 2026 and term = 2 and exam_type = '期末考査'
  order by created_at desc limit 1
),
range_rows as (
  select id as exam_id, '化学'::text as subject, '化学'::text as display_subject, '2年理系'::text as audience, 0::smallint as sort_order, date '2026-11-13' as broadcast_on,
    jsonb_build_array(
      jsonb_build_object('title','教科書① 実教出版「化学 academia」','body',$c1$p.65〜82：第3「希薄溶液の性質」・第4「コロイド」
p.82 論述問題 2・3
p.83 節末問題 3〜7
p.86 章末問題 3・4$c1$,'note','除外：p.67 発展「ラウールの法則と沸点上昇」／p.75 発展「蒸気圧と浸透圧」'),
      jsonb_build_object('title','教科書② 実教出版「化学基礎 academia 新訂版」','body',$c2$p.136〜164　第2節「酸と塩基」
p.164 節末問題／p.165 論述問題・グラフ問題
p.166〜182　第3節「酸化還元反応」
p.203 節末問題 1・2・3・5／p.204 論述問題 1・2
p.205〜211　特集4「滴定」
p.212 グラフ問題 1〜5／章末問題 4・5・6$c2$),
      jsonb_build_object('title','問題集「エクセル 化学 総合版 化学基礎＋化学」','body',$c3$6「酸・塩基」 p.100〜121
7「酸化還元反応」 p.122〜133
＋α：問題番号210 COD／211 DO／212 アスコルビン酸の定量
12「溶液の性質」内の4「溶液の性質」
WU 3〜5／基本例題51／基本問題261〜267
応用例題53・54／応用問題269〜275$c3$),
      jsonb_build_object('title','重要問題集','body',$c4$問題番号72・73「コロイド」も含みます。
重要問題集は冬休みの宿題です。時間に余裕がある人は、実力確認のため挑戦してください。$c4$),
      jsonb_build_object('title','試験当日の注意','body',$c5$原子量は与えられます。
持ち込み・利用できるのは、計算機能のみの計算機・電卓です。
携帯電話・スマホ・電子辞書などの計算機能は使用できません。$c5$),
      jsonb_build_object('title','学習ポイント・提出物','body',$c6$教科書の用語を覚え、エクセルの基本問題・エクササイズを繰り返しましょう。標準例題・標準問題・範囲の発展問題も学習。有効数字にこだわる計算もあります。
提出物：問題集（エクセル）用ノート（期末試験範囲）
提出日：試験終了日 11月27日
提出場所：化学準備室の机上に名前順に並べて提出。$c6$)
    ) as range_sections
  from target_exam
  union all
  select id, '数C', '数学C', '2年理系', 1::smallint, date '2026-11-13',
    jsonb_build_array(
      jsonb_build_object('title','教科書「深進数学C」','body',$m1$第1章 ベクトル（P28〜P51）
第2節 ベクトルと図形
第3節 空間のベクトル（P51まで）$m1$),
      jsonb_build_object('title','Grasp / Forcus','body','チェック表で指示した問題のうち、Grasp 980〜990は除く。'),
      jsonb_build_object('title','確認テスト・プリント','body',$m2$ポイントチェック確認テスト 第5回〜第8回
サブノートプリント$m2$)
    )
  from target_exam
  union all
  select id, '国語演習', '国語演習', '2年理系', 2::smallint, date '2026-11-13',
    jsonb_build_array(
      jsonb_build_object('title','論理国語','body',$j1$「桜が創った『日本』」 教科書P182〜P187
「男の絆、女たちの沈黙」 教科書P202〜P210
P211「ジェンダー」の解説$j1$),
      jsonb_build_object('title','授業内容・重要語句','body','上記2題とも、授業内容・プリント・スライドを踏まえて出題。重要語句の読み・書き・意味も出題。'),
      jsonb_build_object('title','『読解力を鍛える 現代文演習』','body',$j2$P62〜69「タダイマトビラ」
P76〜79「啼く鳥の」
上記2題とも出題。$j2$),
      jsonb_build_object('title','漢字・語句','body','現代文演習の2題についても、漢字・語句の意味を含みます。')
    )
  from target_exam
  union all
  select id, '古典探求', '古典探究', '2年理系', 3::smallint, date '2026-11-13',
    jsonb_build_array(
      jsonb_build_object('title','教科書','body',$k1$漢文：「四面楚歌」（史記）
古文：「忠度の都落ち」（平家物語）$k1$),
      jsonb_build_object('title','古文単語・古典文法','body',$k2$古文単語集 P268〜276（掲載例文から意味を答える選択問題。現代語訳は掲載されません）
反実仮想：まし
推定：らし・めり・なり
願望：まほし・たし$k2$),
      jsonb_build_object('title','漢文必携','body','練習問題10・11・12。古典文法と同様、本文から独立した問題として出題され、問題は漢文必携そのまま出題。'),
      jsonb_build_object('title','出題上の注意','body','教科書本文から、これまで扱った用言・助動詞・敬語等も出題。古典文法は活用表・意味・接続も対象。百人一首からの出題はありません。')
    )
  from target_exam
  union all
  select id, '公共', '公共', '2年理系', 4::smallint, date '2026-11-13',
    jsonb_build_array(
      jsonb_build_object('title','主題4 政治参加と公正な世論形成','body',$p1$プリント #17〜21
教科書 P78〜91
資料集 P130〜135、P142〜147、P150〜163$p1$),
      jsonb_build_object('title','主題10 市場経済の機能と限界','body',$p2$プリント #22〜24
教科書 P146〜149、P152〜155
資料集 P266〜269、P276〜279$p2$),
      jsonb_build_object('title','主題11 金融のはたらき','body',$p3$プリント #25〜26
教科書 P156〜159
資料集 P280〜287$p3$),
      jsonb_build_object('title','主題12 財政の役割と社会保障','body',$p4$プリント #27〜29
教科書 P160〜169
資料集 P288〜305$p4$),
      jsonb_build_object('title','提出物・答案返却時','body','試験当日の提出物はありません。遅れたプリントの最終受付は答案返却時まで。答案返却時に新聞切り抜きレポートの発表・提出があります。詳細はClassroomを確認してください。')
    )
  from target_exam
)
insert into public.school_test_ranges (exam_id, subject, display_subject, audience, sort_order, broadcast_on, range_sections)
select exam_id, subject, display_subject, audience, sort_order, broadcast_on, range_sections from range_rows
on conflict (exam_id, audience, subject) do update set
  display_subject = excluded.display_subject,
  sort_order = excluded.sort_order,
  broadcast_on = excluded.broadcast_on,
  range_sections = excluded.range_sections,
  updated_at = now();
