# CampusSync 惑星・文明システム 実装記録

- 対象ブランチ: feature/planet-civilization-phase1-2-20261120
- 基準ブランチ: cloudflare-workers-migration
- 更新日: 2026-11-21
- 状態: Phase 0仕様確定 / Phase 1 DB・SQL・Cloudflare Worker CI・モックブラウザスモーク完了 / 実アカウントを使う全機能回帰は未実施
- 設計書: docs/planet-civilization-roadmap-ja.md
- Phase 1 DB設計: docs/planet-civilization-phase1-database-design-ja.md
- PR: #36（Draft、未マージ）

## Phase 0で確定した方針

1. 初期版はユーザー1人につき惑星1個。初期名は「わたしの惑星」、公開設定はOFF。
2. 学習XP・学校貢献XP・知識XPを別々に記録する。学習XPは有効な集中60秒につき1 XP、東京時間の日次上限は10,800秒（180分）。
3. 学校貢献XPはAdmin承認後に10 / 25 / 50 XP。知識XPは採点可能な問題の初回正解に通常2・応用4・発展6 XPを付与する。
4. 自然成長は保存済みPomodoroの東京時間日合計600秒（10分）以上を有効な学習日とし、1日につき自然成長値1。日次最大1、累積上限なし、衰退なし。Planetube・YouTubeは使わない。
5. 文明発展スコアは「学習XP + 学校貢献XP + 知識XP + 自然成長値×5」。Stage 0〜5のしきい値は0 / 100 / 500 / 1,200 / 2,500 / 5,000。
6. 技術・社会・研究・自然の4軸は独立Levelを持つ。各軸のしきい値はロードマップを正本とする。
7. XP・自然成長値を消費しない。段階・解放は後戻りせず、非公開を初期値とする。
8. PC・スマートフォンのワイヤーフレームを定義し、Planetube・既存Pomodoro・学校機能・認証・通知を非破壊で維持する。

数値は仮想テストケースで初期ペースを確認した基準値であり、本番利用データからの統計的な最終調整ではない。

## Phase 1 — データベースとXP台帳の基盤

### 実装済み

追加マイグレーション `20261121004717_campus_planet_phase1_foundation` をSupabaseプロジェクト `sgvhktudhxufluuaipwt` に適用した。適用済みマイグレーション一覧にも登録されている。

- `campus_planets`: 一人一惑星、惑星名、公開設定、現在段階。
- `campus_xp_ledger`: 学習・貢献・知識XPの追記型正本。初期マイグレーションの発生元重複制約を維持し、取消・調整の種類、方向、ルールバージョン、元award参照を追加。
- `campus_planet_growth`: 4種類の累計キャッシュ、技術・社会・研究・自然のLevel、文明発展スコア、再計算日時。
- `campus_planet_unlocks`: 建物・技術・景観の解放記録用テーブル。
- `campus_planet_events`: 文明段階アップ等の追記型イベント履歴。
- `campus_planet_nature_ledger`: 東京時間の有効学習日をユーザー・日付ごとに1行だけ保存する自然成長の正本台帳。

### サーバー処理

- `campus_rebuild_planet_growth(user_id)`: XP台帳と自然成長台帳から累計値・4軸Level・文明発展スコア・文明段階を再計算する。
- `campus_record_nature_growth(user_id, session_id)`: 保存済みPomodoroの同日集中秒数が600秒以上か検証し、自然成長値を同日1回だけ記録する。
- `campus_award_learning_xp(user_id, session_id)`: 保存済み学習記録をDBで再検証し、日次10,800秒上限、60秒単位・端数繰越、重複防止を適用する。XP台帳・自然成長・集計・段階イベントは同一DBトランザクションで処理する。
- 3関数は `SECURITY INVOKER` で、EXECUTE権限をservice_roleだけに限定した。
- 学習記録は `student_study_sessions` から読み取り専用で参照。既存テーブル定義・RLS・保存形式は変更していない。

### RLS・権限

- 6つの惑星関連テーブルでRLSを有効化。
- 生徒は本人の惑星・成長・XP台帳・解放・イベント・自然台帳だけSELECTできる。
- 生徒の直接INSERT / UPDATE / DELETE権限は付与していない。
- 所有者整合性は `(planet_id, user_id)` 複合外部キーでも検証する。
- service_roleには必要なサーバー処理のみの権限を付与。XP・自然成長・解放・イベント台帳はINSERT/SELECT中心で、通常のUPDATE/DELETEを禁止した。
- 既存の `contribution_scores`・`contribution_history` は変更せず、Phase 3まで新XPへのコピーも行わない。

### 検証済み（トランザクション内でテスト行を作成後、ROLLBACK）

- 2つの既存AuthユーザーIDをテスト主体A/Bとして、惑星・XP台帳の相互閲覧ができないこと。
- 生徒ロールに直接書き込み権限がなく、service_role専用XP付与RPCを実行できないこと。
- 同一セッションの再送信でXPが二重に増えないこと。
- 複数セッションの合計が東京時間の日次10,800秒を超えないこと（テスト結果は合計10,800秒）。
- 集中時間が600秒以上の日は自然成長台帳が1行だけになること。
- XP台帳と自然成長台帳からの再計算結果が一致し、繰り返し再計算しても同じ値になること。
- 文明段階アップイベントが同一Stageで重複作成されないこと。
- テスト用の惑星・学習記録・XP台帳行はROLLBACK済みで、DBに残していない。

**DBテスト範囲の注意:** これはSupabaseのSQLトランザクション内でAuthユーザーA/BのID・JWT claim相当のDBコンテキストを設定して行った権限テストであり、別ブラウザでの実ログイン試験や、実HTTP経由での二人のユーザーの同時アクセス試験ではない。

### CI・ブラウザスモーク確認済み

- GitHub Actions [Run #729](https://github.com/GCIS-web-creator/campus-sync/actions/runs/44851577269) が成功。`npm ci`、i18n、Next.js本番ビルド、Cloudflare Worker build、Wrangler dry-runがすべて成功。
- `scripts/e2e/planet-civilization-smoke.mjs` を追加。ローカルCloudflare Workerを起動し、Chromiumでモック認証・モックAPIによる画面テストを実行する。
- 惑星名「わたしの惑星」・非公開表示・文明スコア・4軸・履歴・Stage画像を表示できることを確認。
- 更新ボタンから惑星APIを再取得できることを確認。
- 390px幅で横スクロールが発生しないことを確認。
- 集中モードで学習記録を保存し、保存後に返ったセッションIDを `award-learning-xp` APIへ送ることを確認。
- Planetubeのログイン画面へ遷移できることを確認。別サービスの認証・DBアクセスは行っていない。
- すべて架空のテストアカウントとモックレスポンスで動作し、実SupabaseユーザーデータやPlanetubeデータは変更しない。

### リリース前に残っている確認

- 実Supabase認証アカウントを使ったライブE2E（惑星GET・保存後の実XP反映・再読み込み後の値維持）。
- 実アカウントA/Bを別ブラウザで使った画面レベルの相互アクセス拒否確認。
- 今回の自動テスト対象外である時間割・課題・授業連絡・通知など学校機能全体の回帰確認。
- これらの確認とマージ判断まではPR #36をDraft維持。本番アプリへのマージ・Cloudflareデプロイは行わない。

## Phase 2 — Pomodoro連携の初回実装

- 既存 `student_study_sessions` を唯一の学習セッション記録として読み取る。既存の保存形式・RLS・タイマー処理は変更しない。
- 有効集中時間60秒につき1 XP。秒単位で同じ日の累積を管理し、端数は次のセッションへ繰り越す。
- 東京時間の1日あたり有効集中時間10,800秒（180分）をXP算定対象とする。
- 上限を超えても元の学習セッションは削除・短縮しない。
- 同じ学習セッションIDからのXP再付与は行わない。
- Phase 1 DB関数で集計・文明スコア・段階更新まで連携済み。Pomodoro画面の保存フローは初回実装として既存画面から呼び出す。

## 今回は対象外

- 学校貢献XPの申請・Admin承認UI（Phase 3）。
- 知識XPの練習問題連携（Phase 4）。
- 建物・技術・景観を自動解放するルールエンジン（Phase 5）。Phase 1では保存テーブルだけを用意。
- 他人の惑星公開、ランキング、共同ミッション、資源管理、建築配置、惑星間移動。
- Planetubeのプロジェクト・DB・UI・XP・封印機能の変更。

## 非破壊リリース条件

- [x] Feature branchで実装し、cloudflare-workers-migration向けPR #36をDraftで維持。
- [x] Next.js build、Cloudflare OpenNext build、Wrangler dry-runをCIで確認。
- [x] ローカルWorkerで惑星画面・更新操作・390px幅の表示をChromiumで確認。
- [x] モック学習記録を保存し、保存されたsession IDでXP付与APIを呼ぶフローを確認。
- [x] Planetubeログイン画面への遷移を確認し、Planetubeデータにはアクセスしない。
- [x] DBトランザクションで二重付与・日次上限・A/B相互閲覧拒否を確認。
- [ ] 実ユーザー認証・実DBを使ったブラウザE2Eと、全学校機能の広範な回帰確認を行う。
- [ ] これらが終わってからPRレビューとマージ可否を判断する。本番マージ・デプロイは未実施。
