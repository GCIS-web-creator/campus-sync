-- CampusSync 貢献度の初期サンプル値を0へ戻す
-- Supabase Dashboard > SQL Editor で1回だけ実行してください。
--
-- 旧版は新規ユーザーの初期値を65ptで登録していました。
-- 実際の貢献履歴が1件もない行だけを0へ戻します。
-- contribution_historyが存在する生徒のポイントは変更しません。

update public.contribution_scores as cs
set score = 0,
    updated_at = now()
where coalesce(cs.score, 0) <> 0
  and not exists (
    select 1
    from public.contribution_history as ch
    where ch.student_id = cs.student_id
  );

-- 確認: 履歴がないのに0以外で残っているレコードを表示
select cs.student_id, cs.score
from public.contribution_scores as cs
where coalesce(cs.score, 0) <> 0
  and not exists (
    select 1
    from public.contribution_history as ch
    where ch.student_id = cs.student_id
  );
