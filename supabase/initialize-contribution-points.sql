-- CampusSync 貢献度の初期サンプル値を0へ戻し、獲得履歴と一致させる
-- Supabase Dashboard > SQL Editor で1回だけ実行してください。
--
-- 旧版は新規ユーザーの初期値を65ptで登録していたため、
-- 現在ポイントが70ptなどになっていても、実際の獲得履歴は5ptのことがあります。
-- 旧ベース値65を除去し、contribution_historyを実績の基準として現在ポイントを再計算します。
-- 履歴そのものは削除しません。履歴がない生徒の現在ポイントは0になります。

update public.contribution_scores as cs
set score = least(
      100,
      greatest(
        0,
        coalesce((
          select sum(ch.delta)
          from public.contribution_history as ch
          where ch.student_id = cs.student_id
        ), 0)
      )
    ),
    updated_at = now();

-- 確認: 現在ポイントと累計履歴を並べて確認
select
  cs.student_id,
  cs.score as current_score,
  greatest(0, coalesce(sum(ch.delta), 0)) as lifetime_points
from public.contribution_scores as cs
left join public.contribution_history as ch
  on ch.student_id = cs.student_id
group by cs.student_id, cs.score
order by cs.student_id;
