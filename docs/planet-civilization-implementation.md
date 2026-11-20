# CampusSync 惑星・文明システム 実装記録

- 対象ブランチ: feature/planet-civilization-phase1-2-20261120
- 基準ブランチ: cloudflare-workers-migration
- 更新日: 2026-11-21
- 状態: Phase 0設計完了 / Phase 1・2の初回実装はDraft PRで検証中（本番デプロイ前）
- 設計書: docs/planet-civilization-roadmap-ja.md

## Phase 0で確定した方針

1. 初期版はユーザー1人につき惑星1個。初期名は「わたしの惑星」、初期公開設定はOFF。
2. 学習XP・学校貢献XP・知識XPを別々に記録し、総合文明段階は3種類のXP合計で判定する。
3. 自然成長値はXPと別管理にし、CampusSync内で確認できる意味のある活動日につき最大1を付与する。Planetube・YouTubeの利用状況は成長判定に使わない。
4. 学習XPは有効な集中時間1分につき1 XP、東京時間の日次上限は180分。上限を超えても元の学習記録はすべて保持する。
5. 学校貢献XPはAdmin承認後に定型値10 / 25 / 50 XPで付与する。知識XPは採点可能な問題の初回正解に付与し、通常問題の初期値は2 XP。
6. 総合文明段階はStage 0〜5。必要総合XPは0 / 60 / 240 / 600 / 1200 / 2400。段階は後戻りしない。
7. シミュレーションゲームにはせず、資源管理・建築配置・住民管理は行わない。XPの蓄積に応じた惑星の外観変化を中心にする。
8. 既存機能を破壊しない。既存Planetube、Pomodoroの記録形式、学校機能、既存API契約には影響を与えず、新しいテーブル・API・コンポーネントを追加する。

詳細な獲得条件・画面構成・セキュリティ・テスト基準は設計書を正本とする。

## Phase 1 — 現在の初回実装状況

現在のDraft PRでは、次の3テーブルを追加している。

- campus_planets: 一人一惑星、惑星名、公開設定、文明段階。
- campus_planet_growth: 学習XP・学校貢献XP・知識XP・自然成長値の集計キャッシュ。
- campus_xp_ledger: XPの根拠となる追記型台帳。発生元とXP種別の一意制約で重複を防ぐ。

実装済みの保護:

- 3テーブルともRLS有効。
- authenticatedには本人分のSELECTだけを許可し、直接INSERT / UPDATE / DELETEは許可しない。
- XP付与関数 campus_award_learning_xp はservice_roleだけが実行可能。
- サーバーAPI側でログインJWTを検証し、ログイン本人のuser_idと学習記録IDを使用する。
- XP付与と集計値・文明段階の更新はDB関数内で処理する。
- 同じ学習セッションIDによる再付与を防ぎ、東京時間の日次上限もサーバー側で計算する。

### Phase 1設計との未整合（次の設計作業で解消）

ロードマップのPhase 1は、次の5テーブルを設計対象としている。

- campus_planets
- campus_xp_ledger
- campus_planet_growth
- campus_planet_unlocks
- campus_planet_events

現時点のPRでは最後の2テーブル（unlock / events）は未実装。また、ロードマップが想定する成長軸は「技術・社会・研究・自然」だが、現在のPRのgrowth列は「learning_xp・contribution_xp・knowledge_xp・nature_growth」となっている。これらの対応関係とレベルの算定方法をPhase 1の設計で確定し、必要ならPRのmigrationとAPIを見直す。設計が確定する前に本番へマージしない。

## Phase 2 — Pomodoro連携の初回実装

- 既存 student_study_sessions を唯一の学習セッション記録として読み取る。既存の保存形式・RLS・タイマー処理は変更しない。
- 有効集中時間60秒につき1 XP。秒単位で同じ日の累積を管理し、端数は次のセッションへ繰り越す。
- 東京時間の1日あたり有効集中時間10,800秒（180分）をXP算定対象とする。
- 上限を超えても元の学習セッションは削除・短縮しない。
- 同じ学習セッションIDからのXP再付与は行わない。
- 総合文明段階の必要XPはStage 1=60、Stage 2=240、Stage 3=600、Stage 4=1200、Stage 5=2400。詳細はPhase 0設計書を正本とする。

## 今回は対象外

- 学校貢献XPの申請・Admin承認UI（Phase 3）。
- 知識XPの練習問題連携（Phase 4）。
- CampusSync内の自然成長値の付与処理と成長演出（Phase 5）。
- 他人の惑星公開、ランキング、共同ミッション、資源管理、建築配置、惑星間移動。
- Planetubeのプロジェクト・DB・UI・XP・封印機能の変更。

## 非破壊リリース条件

- Feature branchで実装し、cloudflare-workers-migration向けPRのCIを通す。
- Next.js build、Cloudflare OpenNext build、Wrangler dry-runを確認する。
- 既存Planetubeの読み取り専用画面、認証、Pomodoroの開始・一時停止・終了・保存、主要タブ遷移を回帰確認する。
- 2つ以上のテストアカウントで他人の惑星・XP台帳にアクセスできないことを確認する。
- 同じ送信の再試行・二重クリック・再読み込みでXPが二重に増えないことを確認する。
- CI・回帰確認・Phase 1設計整合が完了するまで本番ブランチへマージ・デプロイしない。
