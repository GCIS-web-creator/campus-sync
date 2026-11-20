# CampusSync 惑星・文明システム 実装記録

- 対象ブランチ: `feature/planet-civilization-phase1-2-20261120`
- 基準ブランチ: `cloudflare-workers-migration`
- 更新日: 2026-11-20
- 状態: Phase 1基盤・Phase 2初回連携の実装中（本番デプロイ前）

## 今回確定したユーザー判断

1. 初期版はユーザー1人につき惑星1個。
2. 学習XPと学校貢献XPは、どちらも惑星の成長に使う。加算履歴と表示内訳は別々に維持する。
3. シミュレーションゲームにはせず、資源管理や建築配置は行わない。学習の積み重ねで惑星の外観が文明段階に応じて変化する表現を中心にする。
4. 既存機能を破壊しない。Planetube、既存Pomodoroの記録形式、他の学校機能、API契約を変更せず、新しいテーブル・API・コンポーネントを追加する。

## Phase 1 — データ基盤

- `campus_planets`: 一人一惑星。初期公開設定OFF。
- `campus_planet_growth`: 学習XP・学校貢献XP・知識XP・自然成長値を独立集計。
- `campus_xp_ledger`: XPの根拠となる追記型台帳。source IDの一意制約で重複を防ぐ。
- 3テーブルともRLS有効。本人分のSELECTだけauthenticatedへ許可し、直接INSERT/UPDATE/DELETEは許可しない。
- XP付与関数 `campus_award_learning_xp` はservice_roleだけが実行可能。サーバーAPI側でJWTを検証し、ログイン本人のuser_idと学習記録IDを渡す。

## Phase 2 — Pomodoro連携

- 既存 `student_study_sessions` を唯一の学習セッション記録として読み取る。既存の保存形式・RLS・タイマー処理は変更しない。
- 暫定値: 集中時間60秒につき1 XP（秒単位で蓄積し端数は次のセッションへ繰り越す）。
- 暫定上限: 東京時間の1日あたり有効集中時間10,800秒（180分）をXP算定対象とする。
- 上限を超えても元の学習セッションは削除・短縮しない。
- 同じ学習セッションIDからのXP再付与は行わない。
- 文明段階の暫定しきい値（総XP）: Stage 1=60、Stage 2=240、Stage 3=600、Stage 4=1200、Stage 5=2400。段階は後戻りしない。実績を見てPhase 0完了時に調整する。

## 今回は対象外

- 学校貢献XPの申請・Admin承認UI（Phase 3）。
- 知識XPの練習問題連携（Phase 4）。
- 自然成長値の確定ルール（CampusSync内の学習継続を基準に別途設計）。
- 他人の惑星公開、ランキング、共同ミッション、資源管理、建築配置、惑星間移動。
- Planetubeのプロジェクト・DB・UI・XP・封印機能の変更。

## 非破壊リリース条件

- Feature branchで実装し、`cloudflare-workers-migration` 向けPRのCIを通す。
- Next.js build、Cloudflare OpenNext build、Wrangler dry-runを確認する。
- 既存Planetubeの読み取り専用画面、認証、Pomodoroの開始・一時停止・終了・保存、主要タブ遷移を回帰確認する。
- CIが通るまで本番ブランチへマージ・デプロイしない。
