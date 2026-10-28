-- CampusSync: 今日の貢献度を0から数え、累計は履歴から別計算する
-- Supabase Dashboard > SQL Editorで1回実行してください。
--
-- 以前は新規ユーザーの現在ポイントにサンプル値65が設定されていました。
-- score_dateを追加し、現在ポイントをJSTの本日のcontribution_historyから再計算します。
-- contribution_historyは削除せず、累計獲得ポイントはそのまま維持します。

alter table public.contribution_scores
  add column if not exists score_date date;

update public.contribution_scores as cs
set score = least(
      100,
      greatest(
        0,
        coalesce((
          select sum(ch.delta)
          from public.contribution_history as ch
          where ch.student_id = cs.student_id
            and (ch.created_at at time zone 'Asia/Tokyo')::date =
                (now() at time zone 'Asia/Tokyo')::date
        ), 0)
      )
    ),
    score_date = (now() at time zone 'Asia/Tokyo')::date,
    updated_at = now();

-- 確認: 現在ポイント（本日分）と累計ポイント（全履歴）を分けて表示
select
  cs.student_id,
  cs.score as todays_score,
  cs.score_date,
  greatest(0, coalesce(sum(ch.delta), 0)) as lifetime_points
from public.contribution_scores as cs
left join public.contribution_history as ch
  on ch.student_id = cs.student_id
group by cs.student_id, cs.score, cs.score_date
order by cs.student_id;
