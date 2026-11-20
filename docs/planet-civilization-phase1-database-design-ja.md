# CampusSync 惑星・文明システム — Phase 1 データベース設計書

- 最終更新: 2026-11-21
- 対象: CampusSync 本体 / Supabase
- 状態: 設計初版（レビュー・実装前）
- 関連仕様: [ロードマップ](./planet-civilization-roadmap-ja.md)
- 関連実装: [実装記録](./planet-civilization-implementation.md)

この文書はPhase 1「データベースとXP台帳の基盤」の実装設計を定義する。現行Draft PRにある初期プロトタイプを完成仕様と誤認せず、設計・マイグレーション・権限テストを段階的に行う。ここで定めるテーブル・関数は設計対象であり、すべてが既にSupabaseへ適用済みという意味ではない。

---

## 1. 設計の原則

1. **XPの正本は `campus_xp_ledger` のみ。** 成長値・累計XP・文明段階は台帳から再計算できる派生データとする。
2. **自然成長はXPと別台帳にする。** `campus_planet_nature_ledger` を自然成長日の正本とし、XP台帳に自然成長値を混ぜない。
3. **集計テーブルはキャッシュ。** `campus_planet_growth` と `campus_planets.civilization_stage` は読み取り高速化のための派生値とし、消失・破損しても正本から再構築できる。
4. **サーバー検証のみで付与する。** 学習記録・問題の正誤・Admin承認状態をサーバー/DBで検証し、クライアントの申告XPは信用しない。
5. **一回性はDB制約で保証する。** APIのフロントエンド制御だけに頼らず、一意制約とトランザクションで二重付与を防ぐ。
6. **本人データだけを公開する。** 初期版は生徒が自分の惑星関連データを読むだけ。直接書き込みは一切認めない。
7. **既存テーブルは読み取り専用で利用する。** `student_study_sessions` などの既存記録を参照しても、Phase 1では既存テーブル定義・RLS・保存形式を変更しない。

## 2. テーブル構成

5つの主要テーブルに加え、自然成長値がXPと混同されず、日次の重複防止と再集計ができるよう補助台帳を1つ設ける。

| テーブル | 役割 | 正本 / 派生 |
|---|---|---|
| `campus_planets` | ユーザーごとの惑星名・公開設定・現在段階 | 惑星ID等は正本、段階は派生キャッシュ |
| `campus_xp_ledger` | 学習・貢献・知識XPの付与/取消/調整履歴 | **XPの正本** |
| `campus_planet_growth` | 4軸の累計値・Level・文明発展スコア | 派生キャッシュ |
| `campus_planet_unlocks` | 解放済み施設・技術・景観 | 派生状態（定義ルールから再構築可能） |
| `campus_planet_events` | 段階アップ・解放などのイベント履歴 | 追記型イベント履歴 |
| `campus_planet_nature_ledger` | 有効学習日ごとの自然成長値付与 | **自然成長の正本** |

### 2.1 `campus_planets`

主な列:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `planet_name text not null`（初期値「わたしの惑星」、1〜40文字）
- `is_public boolean not null default false`（初期版は公開機能を有効化しない）
- `civilization_stage smallint not null default 0`（派生キャッシュ）
- `created_at / updated_at timestamptz`
- `unique(user_id)` — 1ユーザー1惑星
- `unique(id, user_id)` — 関連テーブルの所有者整合性を複合外部キーで保証するため

`civilization_stage` は直接編集しない。正本台帳を再集計した値からサーバー処理だけが更新する。公開機能は初期版OFF固定で、他人向けSELECTポリシーはこのフェーズで作らない。

### 2.2 `campus_xp_ledger`

XPの唯一の正本。通常操作でUPDATE/DELETEしない追記型にする。

主な列:

- `id uuid primary key`
- `user_id uuid not null`
- `planet_id uuid not null`
- `xp_type text not null`: `learning` / `contribution` / `knowledge`
- `amount integer not null check (amount >= 0)`: awardは0以上。reversal/adjustmentは正の量で記録する。
- `entry_kind text not null`: `award` / `reversal` / `adjustment`
- `adjustment_direction text null`: adjustment行の `increase` / `decrease` を記録する。
- `source_type text not null` / `source_id uuid not null`
- `source_date date not null`: Asia/Tokyo基準日
- `credited_seconds integer not null default 0`: 学習XP用。同日の日次上限と端数計算の根拠
- `reason text not null`
- `rule_version integer not null default 1`
- `reverses_entry_id uuid null references campus_xp_ledger(id)`: 取消時の参照先
- `created_at timestamptz`
- 所有者整合性: `foreign key (planet_id, user_id) references campus_planets(id, user_id)`
- awardの一意制約: `unique(user_id, xp_type, source_type, source_id) where entry_kind = 'award'` の部分一意インデックス。同じ活動・XP種別の通常付与は一回だけ。
- 訂正行の冪等性: `unique(user_id, source_type, source_id)`。訂正・取消には元活動IDを再利用せず、サーバーが発行した一意な訂正リクエストIDを `source_id` に使う。
- 取消の一意制約: `unique(reverses_entry_id) where reverses_entry_id is not null`（1つの元awardを二重取消ししない）

制約・計算:

- award行は `amount >= 0`。ただしPomodoroの端数秒を同日内で繰り越すため、`amount = 0` でも `credited_seconds > 0` の行を許可する。
- reversal/adjustment行は正の `amount` と `entry_kind` / `adjustment_direction` の組み合わせで増減方向を表現し、サーバー関数のみが作成できる。既存の `amount >= 0` 制約を維持できる。
- 部分一意インデックスを採用するため、現行プロトタイプの `campus_xp_ledger_source_unique` 制約は追加マイグレーションで安全に置き換える。既に適用済みのマイグレーションファイル自体は書き換えない。
- 学習XPの累計はawardを加算し、reversalおよび `adjustment_direction='decrease'` を減算、`adjustment_direction='increase'` を加算して再計算する。学習XPの `credited_seconds` はaward行のみを日次上限計算に使い、取消時は元行を直接変更せず、相殺行と再計算結果を残す。
- 知識XPの `source_id` は、再挑戦で変わる回答IDではなく、ユーザーごとに一度だけ付与したい安定した問題IDを使う。問題改訂を別問題と扱う場合は明示的に別IDにする。
- `source_type` はサーバー側で許可リスト管理し、クライアントから自由入力させない。

### 2.3 `campus_planet_growth`

高速表示のための集計キャッシュ。正本ではない。

主な列:

- `id uuid primary key`（既存列を維持）
- `planet_id uuid not null unique`
- `user_id uuid not null`
- `learning_xp bigint not null default 0`
- `contribution_xp bigint not null default 0`
- `knowledge_xp bigint not null default 0`
- `nature_growth bigint not null default 0`
- `technical_level smallint not null default 0`
- `social_level smallint not null default 0`
- `research_level smallint not null default 0`
- `nature_level smallint not null default 0`
- `civilization_score bigint not null default 0`
- `recalculated_at timestamptz`
- `updated_at timestamptz`

各累計値は正本台帳の集計結果。Levelはロードマップの固定しきい値に基づきDB関数内で算出する。`civilization_score` は `learning_xp + contribution_xp + knowledge_xp + nature_growth * 5`。Levelと段階を再計算する際は、過去に到達した最大値を維持し、通常の再集計でレベルを下げない。誤付与の取消によって段階を下げる必要がある特殊ケースは、管理監査を伴う別処理とする。

### 2.4 `campus_planet_unlocks`

- `id uuid primary key`
- `planet_id uuid not null`
- `unlock_key text not null`（コード側の安定ID。表示名をキーにしない）
- `unlock_type text not null`: `building` / `technology` / `landscape`
- `unlocked_at timestamptz not null`
- `rule_version integer not null`
- `source_snapshot jsonb not null default '{}'`（解放時点の条件値。個人学習内容は入れない）
- `unique(planet_id, unlock_key)`
- `foreign key (planet_id, user_id) references campus_planets(id, user_id)`

解放条件はコード内のバージョン管理された定義データとする。生徒クライアントから解放行を挿入・更新できない。再計算では定義データと成長キャッシュから不足分を追加し、通常動作で解放済み行を削除しない。

### 2.5 `campus_planet_events`

- `id uuid primary key`
- `planet_id uuid not null`
- `user_id uuid not null`
- `event_key text not null`（例: `stage:3:rule-v1`）
- `event_type text not null`: `civilization_stage_up` / `unlock` / `milestone`
- `payload jsonb not null default '{}'`
- `occurred_at timestamptz not null`
- `unique(planet_id, event_key)`
- `foreign key (planet_id, user_id) references campus_planets(id, user_id)`

イベントは通知・履歴表示向けの追記型記録。XP累計の正本として利用しない。payloadに学習内容・教科・答案・学校メール等の個人情報を格納しない。

### 2.6 `campus_planet_nature_ledger`（補助台帳）

- `id uuid primary key`
- `user_id uuid not null`
- `planet_id uuid not null`
- `activity_date date not null`（Asia/Tokyo基準）
- `qualifying_focus_seconds integer not null check (qualifying_focus_seconds >= 600)`
- `trigger_session_id uuid not null`（しきい値到達の根拠になった保存済みPomodoro ID）
- `rule_version integer not null default 1`
- `created_at timestamptz not null`
- 所有者整合性: `foreign key (planet_id, user_id) references campus_planets(id, user_id)`
- 一意制約: `unique(user_id, activity_date)`

1日1行だけ作成する。自然成長値の累計はこの行数（取消が必要な場合は明示的な取消記録を追加する将来設計）から再計算する。学習セッションの本文・教科・振り返り内容は複製しない。

**所有者整合性:** 成長・XP台帳・解放・イベント・自然成長台帳すべてに `user_id` を持たせ、`(planet_id, user_id)` の複合外部キーで `campus_planets(id, user_id)` を参照する。IDを差し替えて他人の惑星に行を紐付けられないようDB制約で保証する。成長テーブルは既存の `id` 主キーを維持し、`planet_id` と `user_id` の一意制約も維持する。

## 3. サーバー処理とトランザクション

書き込みは公開APIから直接テーブルへ行わず、許可されたDB関数/RPCだけに集約する。関数は基本的に `SECURITY INVOKER` とし、サーバーのservice_roleからのみ実行できるようにEXECUTE権限を限定する。権限を強める必要が生じても、安易に `SECURITY DEFINER` に変更しない。

### 3.1 学習XPの付与

1. APIでBearer JWTをSupabase Authに検証し、ログインユーザーIDを確定する。
2. クライアントから渡すのは学習セッションIDだけ。user_id・XP量・source_date・credited_secondsは受け取らない。
3. DB関数は `student_study_sessions` から本人の保存済みセッションだけを読み込む。
4. 惑星行を `FOR UPDATE` でロックし、同じユーザーの日次同時付与を直列化する。
5. `started_at` をAsia/Tokyoへ変換し、日次のcredited_secondsを集計する。
6. 10,800秒までをXP対象にし、60秒単位でXPを付与。端数秒は同日内で繰り越す。
7. award部分一意インデックスにより同じsession IDを二度付与しない。訂正・取消は別の訂正リクエストIDで記録し、元awardとの参照は `reverses_entry_id` で行う。
8. XP台帳追加・集計キャッシュ再計算・文明段階更新・解放行追加・イベント追加を一つのDBトランザクションで完了する。

### 3.2 自然成長日の付与

1. 新しいPomodoro記録が保存された後、同じユーザー・東京時間日付の保存済みセッションの有効集中秒数をDB側で合計する。
2. 600秒未満なら何も付与しない。
3. 600秒以上なら `campus_planet_nature_ledger` に当日1行を挿入する。
4. `unique(user_id, activity_date)` により同日の並行リクエスト・再読み込み・二重送信でも1行だけになる。
5. 自然成長キャッシュ・自然Level・文明発展スコア・段階・解放・イベントを同一トランザクション内で再計算する。

### 3.3 再計算・整合性回復

管理されたDB関数 `campus_rebuild_planet_growth(user_id)` を用意し、XP台帳と自然成長台帳から次を完全再計算する。

- 学習XP・学校貢献XP・知識XP
- 自然成長値
- 技術・社会・研究・自然の各Level
- 文明発展スコアと文明段階
- 解放条件を満たした建物・技術・景観

再計算関数はservice_roleのみ実行可能にする。生徒APIから任意user_idを指定して実行できない。通常の再集計では段階・解放を後退させない。訂正・取消しは理由と承認者を残す別処理とする。

## 4. RLS・権限設計

| ロール | 読み取り | 書き込み |
|---|---|---|
| 未ログイン / anon | なし | なし |
| 生徒A | A自身の惑星・集計・台帳・解放・イベントのみ | 直接書き込みなし |
| 生徒B | B自身の惑星・集計・台帳・解放・イベントのみ | 直接書き込みなし |
| Admin | 本人の管理権限で許可された承認・監査対象のみ | 承認RPC経由の限定操作のみ |
| service_role | サーバー処理に必要な範囲 | 検証済み関数を通じた処理 |

- 公開スキーマの全テーブルでRLSを有効にする。
- SELECTは各テーブルに `user_id` を保持したうえで、`TO authenticated USING ((select auth.uid()) = user_id)` 相当の所有者条件を使う。
- 生徒へのINSERT / UPDATE / DELETE権限・ポリシーを付けない。
- Adminと生徒のロール判定はサーバー側の信頼できる権限情報から検証する。クライアント入力・localStorage・編集可能なuser_metadataを権限根拠にしない。
- Adminに惑星テーブル全件の自由な更新権限を与えない。学校貢献申請の承認・却下など必要な操作に絞る。
- 初期版は他人向け公開SELECT・公開ビューを作らない。将来公開を実装する場合は、明示同意と許可項目だけを返す `security_invoker` ビューまたは専用APIを別途設計する。
- service_roleキーをクライアントやNEXT_PUBLIC環境変数へ置かない。

## 5. 既存機能との接続境界

- `student_study_sessions` は読み取り専用。既存Pomodoroのタイマー、保存形式、RLS、学習履歴の意味は変えない。
- `contribution_scores`・`contribution_history` は既存スコア/履歴のまま維持し、新XPへ自動コピーしない。Phase 3前に参照箇所・RLS・運用フローを監査する。
- 知識XPはPhase 4で実際の採点可能な問題テーブルを特定してから接続する。仮の問題IDやクライアント自己申告で付与しない。
- Planetube・YouTubeのデータ・既存惑星・封印セッションは一切参照しない。
- 新しいマイグレーションは追加型のみ。既存カラムの削除・意味変更・既存RLS緩和は禁止する。

## 6. 必須テスト

### 6.1 所有権・RLS（最低2アカウント）

- テスト生徒Aでログインし、Aの惑星・台帳・成長・解放・イベントを読める。
- AのJWTでBのUUIDを直接指定しても、Bの行が0件または権限エラーとなる。
- AがBの惑星IDを指定したINSERT/UPDATE/DELETEを試みても拒否される。
- テスト生徒Bで同じ逆方向の確認を行う。
- anonは各テーブルを読めず、書き込めない。
- A/Bいずれもservice_role専用RPCを直接実行できない。

### 6.2 重複・並行・再試行

- 同じsession IDのXP付与を複数回送っても台帳は1行だけ。
- 同一ユーザー・同一日に複数セッションを同時送信しても、日次10,800秒を超えない。
- 60秒未満のセッションを複数保存した場合、同日中の端数を正しく合算する。
- 10分しきい値をまたぐ同日複数セッションでも自然成長台帳は1行だけ。
- ブラウザ更新・連打・APIリトライ後もXP・自然成長が二重にならない。

### 6.3 正本と集計の一致

- XP台帳を集計した値と `campus_planet_growth` が一致する。
- 自然成長台帳の行数と `nature_growth` が一致する。
- 再計算関数を複数回実行しても同じ値になる。
- 再計算前後で既存の学習記録・課題・時間割・Planetubeデータに差分がない。
- civilization_score・Stage・4軸Level・unlock/eventがロードマップのルールと一致する。

### 6.4 受入条件

Phase 1は、以下を全て実証するまで完了扱いにしない。

- [ ] 5つの主要テーブルと自然成長補助台帳が作成されている。
- [ ] XPは台帳だけから完全再計算できる。
- [ ] 自然成長は日次台帳から完全再計算できる。
- [ ] 二重付与・並行送信・日次上限がDB制約/トランザクションで守られる。
- [ ] 生徒A/Bで相互参照・相互書き込みができない。
- [ ] Admin権限が承認・監査の必要最小限に限定されている。
- [ ] 既存機能の依存関係調査と回帰テストが完了している。

## 7. 現在のDraft PRとの差分

現行PR #36には `campus_planets`・`campus_planet_growth`・`campus_xp_ledger` の3テーブルと、Pomodoroの学習XP付与関数がある。初期のRLS設定・本人の読み取り・server-only付与の骨格は存在するが、次が未完了。

1. `campus_planet_unlocks` と `campus_planet_events` がない。
2. 自然成長日の専用台帳がない。
3. `campus_planet_growth` は直接加算され、正本台帳から完全再構築する機能がない。
4. 4軸Level・文明発展スコア・新しいStageしきい値がDB処理とUIに反映されていない。
5. 取消・調整履歴とルールバージョンの扱いが不足している。
6. 実テスト用アカウントA/Bによる相互アクセス拒否の実証がない。

したがって、PR #36は引き続きDraftとし、この設計に合わせた追加マイグレーション・RPC・テストを行ってから完了判定する。CI成功やSQL適用だけではPhase 1完了としない。
