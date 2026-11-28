# 文明Stage仕様(現状調査)

- 調査日: 2026-11-28 / 対象: `cloudflare-workers-migration` @ `0a66b36`(本番デプロイ済みコミット)
- 根拠: リポジトリ内のコードとマイグレーション。**本番DBには接続していない**。「DB」はマイグレーション上の定義を指す。
- 本書は既存定義の記録であり、定義は変更していない。

## 0. 最初に確認すべき不一致(本番DB未確認)

| 項目 | マイグレーション(リポジトリ) | 画面コード | 
|---|---|---|
| 学習XPの日次上限 | 10,800秒=3時間(`20261121004717…sql` `campus_award_learning_xp`) | 12時間(`PlanetCivilization.tsx` 63行の定数と説明文) |
| 技術文明Lvしきい値 | 100 / 300 / 700 / 1,500 / 3,000 | 1,200 / 6,000 / 18,000 / 30,000 / 60,000(同 62行) |
| `campus_recalculate_learning_xp()` | **定義がどのブランチのマイグレーションにも無い** | ブラウザから直接RPC呼び出し(同ファイル、コミット `a05a437` / `f07841f`) |

画面側の2コミット(2026-11-22)から、本番DBの関数がリポジトリ外で変更された可能性が高いが、確認していない。**次Phaseの前に §8 のSQL(参照のみ)で本番定義を取得し、本書を確定すること。** 本書の数値はマイグレーション値である。

## 1. Stage一覧

名称・説明は `components/PlanetCivilization.tsx` の `STAGES`(65行〜)、しきい値は同定数と `campus_rebuild_planet_growth` で一致。設計書(`docs/planet-civilization-roadmap-ja.md` §3.1)とも名称・しきい値が一致。

| Stage | 正式名称 | 意味(画面の説明文) | 到達条件(文明発展スコア) | 次まで | 設計書の「見た目の変化」(設計意図) |
|---:|---|---|---:|---:|---|
| 0 | 原始惑星 | まだ文明のない静かな惑星 | 0 | 100 | 自然が中心。文明施設はほぼない |
| 1 | 集落時代 | 最初の暮らしの灯りが生まれる | 100 | 400 | 最初の住居・小さな集落の灯り |
| 2 | 都市形成期 | 小さな街や道路が広がり始める | 500 | 700 | 住宅街・道路・公共施設 |
| 3 | 産業・研究時代 | 研究施設や交通網が発展する | 1,200 | 1,300 | 研究施設・交通網・産業施設 |
| 4 | 高度文明 | 大都市と先端施設が共存する | 2,500 | 2,500 | 大都市・先端研究施設・文化 |
| 5 | 惑星文明 | 惑星全体に文明の光が広がる | 5,000 | — | 惑星全体に文明の光 |

## 2. スコアと成長条件

`civilization_score = learning_xp + contribution_xp + knowledge_xp + nature_growth × 5`

- 段階判定は上式のみ。4軸Level・研究解放・MPは条件に含まれない。
- Stageは後退しない(`greatest(旧Stage, 新Stage)`)。Levelも同様。`civilization_score` 自体は台帳の訂正で減り得るため、「スコアがしきい値未満のStage」が起こり得る。
- 初期基盤(`20261120143249…`)には旧しきい値 60 / 240 / 600 / 1,200 / 2,400(XP合計)があった。次のマイグレーションで置換されたが、旧規則で上がったStageは非後退のため残る。
- 再計算の契機: 学習XP付与、学校貢献の承認、知識問題の初回正解(いずれもDB関数内)と、Phase 1適用時の一括再計算。研究の購入や画面表示では再計算しない。
- Stage上昇時は `campus_planet_events` に `stage:N:rules-v1` を記録(読み出す画面・APIは無い)。

## 3. 関連XP・値

| 値 | 獲得条件 | 台帳 | MP付与 |
|---|---|---|---|
| 学習XP | 保存済みPomodoroの集中60秒=1 XP。東京日付ごとに秒を合算し端数繰越。日次上限は §0 参照 | `campus_xp_ledger`(`learning`、source=`student_study_session`) | 1:1 |
| 学校貢献XP | 申請をAdminが承認。10 / 25 / 50 | 同(`contribution`、`campus_contribution_submission`) | 1:1 |
| 知識XP | 知識問題の初回正解。当初は難度で2 / 4 / 6、`20261121115000…` 以降は問題ごとの `xp_weight`(1〜100)。記述式は付与なし | 同(`knowledge`、`campus_knowledge_question`) | 1:1 |
| 自然成長値 | 東京日付の集中合計600秒以上で1日1。上限なし | `campus_planet_nature_ledger` | なし |

MPはXP台帳へのINSERTトリガー(`campus_xp_ledger_award_planet_mp`)で付与。`award` と増加の `adjustment` のみで、減少訂正ではMPは減らない。MP導入(`mp_activated_at`)より前に作成された学習記録は対象外(導入時にXP合計を初期残高化)。MPはStageに影響しない。

## 4. 成長軸Level(Stageとは独立)

| 軸 | 対応値 | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---:|---:|---:|---:|---:|
| 技術 `technical_level` | 学習XP | 100 | 300 | 700 | 1,500 | 3,000 |
| 社会 `social_level` | 学校貢献XP | 25 | 75 | 150 | 300 | 500 |
| 研究 `research_level` | 知識XP | 20 | 60 | 150 | 300 | 600 |
| 自然 `nature_level` | 自然成長値 | 7 | 21 | 45 | 80 | 130 |

4軸Levelは惑星画面のバー表示にだけ使われ、解放機能・見た目には接続されていない。

## 5. Stageで解放される機能(実装済み)

研究ノードの `requiredStage` のみ(APIとDB関数 `campus_unlock_planet_technology` の両方で検査)。

| Stage | 新たに条件を満たすノード数 | そのMP合計 | 累計ノード数 | 新たに条件を満たす分野 |
|---:|---:|---:|---:|---|
| 0 | 1 | 25 | 1 | (起点「基礎研究の確立」) |
| 1 | 51 | 1,671 | 52 | 農業・食料、水資源・衛生、建築・都市 |
| 2 | 147 | 6,057 | 199 | 素材・製造、エネルギー、交通・物流 |
| 3 | 243 | 11,859 | 442 | 通信・情報、医療・生命科学、教育・科学 |
| 4 | 291 | 16,197 | 733 | 環境・気候、計算・自動化、航空・宇宙 |
| 5 | 581 | 39,577 | 1,314 | 社会制度・文化 |

Stageを満たしても、前提ノードの購入とMP残高が別途必要。星系旅行(30 MP)・自由航行・地上視点はStage条件なし。

## 6. Stageで既に変化する見た目

| 場所 | 変化 | 根拠 |
|---|---|---|
| 惑星視点 | 夜側の都市灯の強さ `min(1.5, stage × 0.22)`(自由浮遊惑星 `planet-043` は常に0) | `Planet3DPanel.tsx` 303行 |
| 地上視点(都市) | 超高層の高さのみ: 一般の超高層 +12 m/Stage、ツインタワー +15 m/Stage、中央タワー `(560 + 34×stage)` を基準(全高594→774 m)。建物数はStage 0でも5でも同じ(3,114〜3,208) | `lib/planet-city.ts` 100–111行 |
| 画面 | 段階名・説明・進捗バー・一覧の強調、地上視点の「文明 Stage N」表示 | `PlanetCivilization.tsx`、`CityGroundView.tsx` |

星系旅行と自由航行はStageを受け取らない。設計書の「Stage 0は文明施設がほぼない」は地上視点では**満たされていない**(Stage 0でも超高密度都市)。惑星視点もStage 0で灯り0になる以外は同じ地表テクスチャ。

## 7. DBカラムとAPI

### カラム

| テーブル | Stage関連カラム |
|---|---|
| `campus_planets` | `civilization_stage` smallint 0–5(非後退は関数側で担保)、`user_id`(一意)、`planet_asset_id`(001–050、表示のみ)、`planet_name`、`is_public`、`mp_activated_at` |
| `campus_planet_growth` | `learning_xp` `contribution_xp` `knowledge_xp` `nature_growth` `civilization_score` `technical_level` `social_level` `research_level` `nature_level` `recalculated_at` |
| `campus_xp_ledger` | `xp_type` `amount` `entry_kind` `adjustment_direction` `rule_version` `source_type` `source_id` `source_date` `credited_seconds` `reverses_entry_id` |
| `campus_planet_nature_ledger` | `activity_date`(ユーザー×日で一意) |
| `campus_planet_events` | `event_type='civilization_stage_up'`、`payload.stage` |
| `campus_planet_technology_unlocks` | `required_stage`、`civilization_stage_at_unlock` |
| `campus_planet_unlocks` | 建物・技術・景観の解放用。**書き込むコードが無い(未使用)** |

学生は各惑星テーブルを本人分のSELECTのみ(RLS)。書き込みはservice_role。

### API / RPC

| API | Stageとの関係 | DB関数 |
|---|---|---|
| `GET /api/planet-civilization` | 惑星(Stage含む)・成長・MP・直近台帳12件。惑星が無ければ作成 | `campus_get_planet_mp_summary` |
| `POST /api/planet-civilization` `award-learning-xp` | XP付与→再計算→Stage更新 | `campus_award_learning_xp` → `campus_record_nature_growth` → `campus_rebuild_planet_growth` |
| 同 `purchase-star-system-travel` | Stage無関係(30 MP) | `campus_purchase_planet_star_system_travel` |
| `GET/POST /api/planet-technology-tree` | `civilizationStage` を返し、購入時に必要Stageを検査 | `campus_unlock_planet_technology` |
| `/api/contributions`、`/api/admin/contributions` | 承認でXP→Stage更新 | `campus_submit_contribution` / `campus_update_contribution_submission` / `campus_review_contribution_submission` |
| `/api/knowledge-practice` | 初回正解でXP→Stage更新 | `campus_submit_knowledge_attempt`(6引数版) |
| `/api/admin/data` `list-planet-assignments` / `set-user-planet` | Stage参照のみ。変更は `planet_asset_id` だけ | — |
| (画面から直接) `campus_recalculate_learning_xp` | 内容不明(§0) | リポジトリに定義なし |

生徒向けAPIは Bearer トークン+学校メール形式を検査する。

### 信頼性上の注意(マイグレーション上の定義)

`student_study_sessions` は本人にINSERT/UPDATE/DELETEが許可され、`focus_seconds`(最大86,400)と `started_at` をクライアントが指定する。XP関数はこの値を根拠にするため、日付を変えた記録を作れば日次上限内でXP・MP・Stageを増やせる余地がある。本番の追加制約は未確認。

## 8. 本番定義の確認用SQL(参照のみ・未実行)

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'campus\_%' and p.proname ~ '(planet|xp|nature|knowledge|contribution)';

select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid in ('public.campus_xp_ledger'::regclass, 'public.student_study_sessions'::regclass) and not tgisinternal;

select version, name from supabase_migrations.schema_migrations where version >= '20261120' order by version;
```
