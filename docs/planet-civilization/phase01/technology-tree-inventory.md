# 研究ツリー棚卸し(全1,314ノード)

- 調査日: 2026-11-28 / 対象: `0a66b36` / 正本: `lib/planet-technology-tree.ts`(本書の表はこのファイルから機械生成)
- DB(`campus_planet_technology_unlocks`)は購入済みノードだけを保存する。カタログはDBに無い。本番の購入データは参照していない。

## 1. 構造

| 階層 | nodeType | 数 | ID形式 | 前提 |
|---|---|---:|---|---|
| 起点 | `root` | 1 | `root.foundation-research` | なし |
| 分野 | `branch` | 13 | `branch.<分野ID>` | 起点 |
| 技術 | `technology` | 1,300 | `tech.<分野ID>.<テーマ01-10>.<Lv01-10>` | Lv1は分野、Lv2以降は同テーマの1つ前 |

各分野10テーマ×10段階。分岐の合流(複数前提)は無い。合計MP **75,386**(25〜92)。

## 2. 算出規則

- 分野コスト: `35 + 分野番号(0始まり)×2`
- 技術コスト: `20 + 分野番号×2 + テーマ番号(0始まり)×2 + Lv×3`
- 技術の必要Stage: `min(5, 分野Stage + floor(テーマ番号/4) + floor((Lv−1)/4))`
- 説明: 起点と分野は固有文。技術1,300件は定型文「{テーマ}分野の第{Lv}段階。前段階の研究成果を引き継いで、より高度な仕組みを実現する。」
- 技術名: `{テーマ}：{段階名}`。段階名はLv1〜10で 原理の発見 / 基礎設計 / 実験技術 / 実用化 / 高効率化 / 自動化 / 統合システム / 高度最適化 / 広域展開 / 次世代技術

## 3. 解放の処理と検査

1. 画面が `POST /api/planet-technology-tree {node_id}`
2. APIがカタログからコスト・前提・必要Stageを引く(クライアント値は使わない)
3. `campus_unlock_planet_technology`: 惑星行ロック → Stage → 前提 → 重複 → MP残高を検査し、MP台帳(`technology_spend`)、解放行(`rule_version=1`)、イベントを記録

画面状態は `purchased / stage_locked / parent_locked / available`(Stage判定が前提判定より先)。解除・返金の機能は無い。

## 4. 実装されている効果

| ノード | 効果 |
|---|---|
| 起点 | 13分野を購入可能にする。画面が分野一覧に切り替わる |
| 分野(13) | その分野の10テーマのLv1を購入可能にする。画面で分野詳細を開ける |
| 技術 Lv1〜9(1,170) | 次のLvを購入可能にするのみ |
| 技術 Lv10(130) | **なし**(「最終段階まで研究済み」と表示するのみ) |

全1,314ノードで、惑星・地上視点・XP・MP・航行などゲーム内状態を変える効果は**0件**。

## 5. 分野一覧

| # | 分野 | 分野ID | 分野Stage | 分野ノードMP | ノード数(分野含む) | MP合計 | 必要Stage別 0/1/2/3/4/5 |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | 農業・食料 | `agriculture-food` | 1 | 35 | 101 | 4,585 | 0/17/32/32/16/4 |
| 2 | 水資源・衛生 | `water-sanitation` | 1 | 37 | 101 | 4,787 | 0/17/32/32/16/4 |
| 3 | 建築・都市 | `construction-urban` | 1 | 39 | 101 | 4,989 | 0/17/32/32/16/4 |
| 4 | 素材・製造 | `materials-manufacturing` | 2 | 41 | 101 | 5,191 | 0/0/17/32/32/20 |
| 5 | エネルギー | `energy` | 2 | 43 | 101 | 5,393 | 0/0/17/32/32/20 |
| 6 | 交通・物流 | `transport-logistics` | 2 | 45 | 101 | 5,595 | 0/0/17/32/32/20 |
| 7 | 通信・情報 | `communication-information` | 3 | 47 | 101 | 5,797 | 0/0/0/17/32/52 |
| 8 | 医療・生命科学 | `medicine-life-science` | 3 | 49 | 101 | 5,999 | 0/0/0/17/32/52 |
| 9 | 教育・科学 | `education-science` | 3 | 51 | 101 | 6,201 | 0/0/0/17/32/52 |
| 10 | 環境・気候 | `environment-climate` | 4 | 53 | 101 | 6,403 | 0/0/0/0/17/84 |
| 11 | 計算・自動化 | `computation-automation` | 4 | 55 | 101 | 6,605 | 0/0/0/0/17/84 |
| 12 | 航空・宇宙 | `aerospace` | 4 | 57 | 101 | 6,807 | 0/0/0/0/17/84 |
| 13 | 社会制度・文化 | `governance-culture` | 5 | 59 | 101 | 7,009 | 0/0/0/0/0/101 |

## 6. 起点・分野ノード

| ノードID | タイプ | 名称 | 前提 | Stage | MP | 説明 |
|---|---|---|---|---:|---:|---|
| `root.foundation-research` | root | 基礎研究の確立 | — | 0 | 25 | 研究記録、実験方法、知識の共有を整え、13分野へ枝分かれする最初の研究基盤を築く。 |
| `branch.agriculture-food` | branch | 農業・食料分野 | `root.foundation-research` | 1 | 35 | 食料生産、土壌、栽培、保存、食料供給を発展させる。 |
| `branch.water-sanitation` | branch | 水資源・衛生分野 | `root.foundation-research` | 1 | 37 | 水の確保、浄化、配水、衛生インフラを整える。 |
| `branch.construction-urban` | branch | 建築・都市分野 | `root.foundation-research` | 1 | 39 | 住居、建設技術、都市設計、公共空間を整備する。 |
| `branch.materials-manufacturing` | branch | 素材・製造分野 | `root.foundation-research` | 2 | 41 | 素材の発見から高精度な製造と再資源化までを発展させる。 |
| `branch.energy` | branch | エネルギー分野 | `root.foundation-research` | 2 | 43 | 発電、蓄電、送電、省エネルギーの基盤を築く。 |
| `branch.transport-logistics` | branch | 交通・物流分野 | `root.foundation-research` | 2 | 45 | 人と物の移動を安全かつ効率的につなぐ。 |
| `branch.communication-information` | branch | 通信・情報分野 | `root.foundation-research` | 3 | 47 | 通信網、データ基盤、情報共有とサイバー保全を発展させる。 |
| `branch.medicine-life-science` | branch | 医療・生命科学分野 | `root.foundation-research` | 3 | 49 | 予防、診断、公衆衛生、生命科学の研究を進める。 |
| `branch.education-science` | branch | 教育・科学分野 | `root.foundation-research` | 3 | 51 | 学びの仕組み、基礎科学、研究機関を育てる。 |
| `branch.environment-climate` | branch | 環境・気候分野 | `root.foundation-research` | 4 | 53 | 生態系、気候、水と大気の環境を守り、回復させる。 |
| `branch.computation-automation` | branch | 計算・自動化分野 | `root.foundation-research` | 4 | 55 | 計算基盤、ロボット、制御、意思決定支援を発展させる。 |
| `branch.aerospace` | branch | 航空・宇宙分野 | `root.foundation-research` | 4 | 57 | 大気圏飛行、軌道、探査、宇宙インフラを研究する。 |
| `branch.governance-culture` | branch | 社会制度・文化分野 | `root.foundation-research` | 5 | 59 | 公共制度、文化、合意形成、長期的な社会運営を整える。 |

## 7. 技術ノード全件(1,300)

タイプはすべて `technology`。説明は §2 の定型文。効果は §4(Lv1〜9は次Lvの前提のみ、Lv10はなし)。

### 農業・食料(`agriculture-food`)

#### 01 土壌科学

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.01.01` | 土壌科学：原理の発見 | `branch.agriculture-food` | 1 | 23 |
| `tech.agriculture-food.01.02` | 土壌科学：基礎設計 | `tech.agriculture-food.01.01` | 1 | 26 |
| `tech.agriculture-food.01.03` | 土壌科学：実験技術 | `tech.agriculture-food.01.02` | 1 | 29 |
| `tech.agriculture-food.01.04` | 土壌科学：実用化 | `tech.agriculture-food.01.03` | 1 | 32 |
| `tech.agriculture-food.01.05` | 土壌科学：高効率化 | `tech.agriculture-food.01.04` | 2 | 35 |
| `tech.agriculture-food.01.06` | 土壌科学：自動化 | `tech.agriculture-food.01.05` | 2 | 38 |
| `tech.agriculture-food.01.07` | 土壌科学：統合システム | `tech.agriculture-food.01.06` | 2 | 41 |
| `tech.agriculture-food.01.08` | 土壌科学：高度最適化 | `tech.agriculture-food.01.07` | 2 | 44 |
| `tech.agriculture-food.01.09` | 土壌科学：広域展開 | `tech.agriculture-food.01.08` | 3 | 47 |
| `tech.agriculture-food.01.10` | 土壌科学：次世代技術 | `tech.agriculture-food.01.09` | 3 | 50 |

#### 02 作物育種

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.02.01` | 作物育種：原理の発見 | `branch.agriculture-food` | 1 | 25 |
| `tech.agriculture-food.02.02` | 作物育種：基礎設計 | `tech.agriculture-food.02.01` | 1 | 28 |
| `tech.agriculture-food.02.03` | 作物育種：実験技術 | `tech.agriculture-food.02.02` | 1 | 31 |
| `tech.agriculture-food.02.04` | 作物育種：実用化 | `tech.agriculture-food.02.03` | 1 | 34 |
| `tech.agriculture-food.02.05` | 作物育種：高効率化 | `tech.agriculture-food.02.04` | 2 | 37 |
| `tech.agriculture-food.02.06` | 作物育種：自動化 | `tech.agriculture-food.02.05` | 2 | 40 |
| `tech.agriculture-food.02.07` | 作物育種：統合システム | `tech.agriculture-food.02.06` | 2 | 43 |
| `tech.agriculture-food.02.08` | 作物育種：高度最適化 | `tech.agriculture-food.02.07` | 2 | 46 |
| `tech.agriculture-food.02.09` | 作物育種：広域展開 | `tech.agriculture-food.02.08` | 3 | 49 |
| `tech.agriculture-food.02.10` | 作物育種：次世代技術 | `tech.agriculture-food.02.09` | 3 | 52 |

#### 03 水耕栽培

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.03.01` | 水耕栽培：原理の発見 | `branch.agriculture-food` | 1 | 27 |
| `tech.agriculture-food.03.02` | 水耕栽培：基礎設計 | `tech.agriculture-food.03.01` | 1 | 30 |
| `tech.agriculture-food.03.03` | 水耕栽培：実験技術 | `tech.agriculture-food.03.02` | 1 | 33 |
| `tech.agriculture-food.03.04` | 水耕栽培：実用化 | `tech.agriculture-food.03.03` | 1 | 36 |
| `tech.agriculture-food.03.05` | 水耕栽培：高効率化 | `tech.agriculture-food.03.04` | 2 | 39 |
| `tech.agriculture-food.03.06` | 水耕栽培：自動化 | `tech.agriculture-food.03.05` | 2 | 42 |
| `tech.agriculture-food.03.07` | 水耕栽培：統合システム | `tech.agriculture-food.03.06` | 2 | 45 |
| `tech.agriculture-food.03.08` | 水耕栽培：高度最適化 | `tech.agriculture-food.03.07` | 2 | 48 |
| `tech.agriculture-food.03.09` | 水耕栽培：広域展開 | `tech.agriculture-food.03.08` | 3 | 51 |
| `tech.agriculture-food.03.10` | 水耕栽培：次世代技術 | `tech.agriculture-food.03.09` | 3 | 54 |

#### 04 精密農業

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.04.01` | 精密農業：原理の発見 | `branch.agriculture-food` | 1 | 29 |
| `tech.agriculture-food.04.02` | 精密農業：基礎設計 | `tech.agriculture-food.04.01` | 1 | 32 |
| `tech.agriculture-food.04.03` | 精密農業：実験技術 | `tech.agriculture-food.04.02` | 1 | 35 |
| `tech.agriculture-food.04.04` | 精密農業：実用化 | `tech.agriculture-food.04.03` | 1 | 38 |
| `tech.agriculture-food.04.05` | 精密農業：高効率化 | `tech.agriculture-food.04.04` | 2 | 41 |
| `tech.agriculture-food.04.06` | 精密農業：自動化 | `tech.agriculture-food.04.05` | 2 | 44 |
| `tech.agriculture-food.04.07` | 精密農業：統合システム | `tech.agriculture-food.04.06` | 2 | 47 |
| `tech.agriculture-food.04.08` | 精密農業：高度最適化 | `tech.agriculture-food.04.07` | 2 | 50 |
| `tech.agriculture-food.04.09` | 精密農業：広域展開 | `tech.agriculture-food.04.08` | 3 | 53 |
| `tech.agriculture-food.04.10` | 精密農業：次世代技術 | `tech.agriculture-food.04.09` | 3 | 56 |

#### 05 食料保存

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.05.01` | 食料保存：原理の発見 | `branch.agriculture-food` | 2 | 31 |
| `tech.agriculture-food.05.02` | 食料保存：基礎設計 | `tech.agriculture-food.05.01` | 2 | 34 |
| `tech.agriculture-food.05.03` | 食料保存：実験技術 | `tech.agriculture-food.05.02` | 2 | 37 |
| `tech.agriculture-food.05.04` | 食料保存：実用化 | `tech.agriculture-food.05.03` | 2 | 40 |
| `tech.agriculture-food.05.05` | 食料保存：高効率化 | `tech.agriculture-food.05.04` | 3 | 43 |
| `tech.agriculture-food.05.06` | 食料保存：自動化 | `tech.agriculture-food.05.05` | 3 | 46 |
| `tech.agriculture-food.05.07` | 食料保存：統合システム | `tech.agriculture-food.05.06` | 3 | 49 |
| `tech.agriculture-food.05.08` | 食料保存：高度最適化 | `tech.agriculture-food.05.07` | 3 | 52 |
| `tech.agriculture-food.05.09` | 食料保存：広域展開 | `tech.agriculture-food.05.08` | 4 | 55 |
| `tech.agriculture-food.05.10` | 食料保存：次世代技術 | `tech.agriculture-food.05.09` | 4 | 58 |

#### 06 食品加工

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.06.01` | 食品加工：原理の発見 | `branch.agriculture-food` | 2 | 33 |
| `tech.agriculture-food.06.02` | 食品加工：基礎設計 | `tech.agriculture-food.06.01` | 2 | 36 |
| `tech.agriculture-food.06.03` | 食品加工：実験技術 | `tech.agriculture-food.06.02` | 2 | 39 |
| `tech.agriculture-food.06.04` | 食品加工：実用化 | `tech.agriculture-food.06.03` | 2 | 42 |
| `tech.agriculture-food.06.05` | 食品加工：高効率化 | `tech.agriculture-food.06.04` | 3 | 45 |
| `tech.agriculture-food.06.06` | 食品加工：自動化 | `tech.agriculture-food.06.05` | 3 | 48 |
| `tech.agriculture-food.06.07` | 食品加工：統合システム | `tech.agriculture-food.06.06` | 3 | 51 |
| `tech.agriculture-food.06.08` | 食品加工：高度最適化 | `tech.agriculture-food.06.07` | 3 | 54 |
| `tech.agriculture-food.06.09` | 食品加工：広域展開 | `tech.agriculture-food.06.08` | 4 | 57 |
| `tech.agriculture-food.06.10` | 食品加工：次世代技術 | `tech.agriculture-food.06.09` | 4 | 60 |

#### 07 畜産システム

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.07.01` | 畜産システム：原理の発見 | `branch.agriculture-food` | 2 | 35 |
| `tech.agriculture-food.07.02` | 畜産システム：基礎設計 | `tech.agriculture-food.07.01` | 2 | 38 |
| `tech.agriculture-food.07.03` | 畜産システム：実験技術 | `tech.agriculture-food.07.02` | 2 | 41 |
| `tech.agriculture-food.07.04` | 畜産システム：実用化 | `tech.agriculture-food.07.03` | 2 | 44 |
| `tech.agriculture-food.07.05` | 畜産システム：高効率化 | `tech.agriculture-food.07.04` | 3 | 47 |
| `tech.agriculture-food.07.06` | 畜産システム：自動化 | `tech.agriculture-food.07.05` | 3 | 50 |
| `tech.agriculture-food.07.07` | 畜産システム：統合システム | `tech.agriculture-food.07.06` | 3 | 53 |
| `tech.agriculture-food.07.08` | 畜産システム：高度最適化 | `tech.agriculture-food.07.07` | 3 | 56 |
| `tech.agriculture-food.07.09` | 畜産システム：広域展開 | `tech.agriculture-food.07.08` | 4 | 59 |
| `tech.agriculture-food.07.10` | 畜産システム：次世代技術 | `tech.agriculture-food.07.09` | 4 | 62 |

#### 08 水産養殖

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.08.01` | 水産養殖：原理の発見 | `branch.agriculture-food` | 2 | 37 |
| `tech.agriculture-food.08.02` | 水産養殖：基礎設計 | `tech.agriculture-food.08.01` | 2 | 40 |
| `tech.agriculture-food.08.03` | 水産養殖：実験技術 | `tech.agriculture-food.08.02` | 2 | 43 |
| `tech.agriculture-food.08.04` | 水産養殖：実用化 | `tech.agriculture-food.08.03` | 2 | 46 |
| `tech.agriculture-food.08.05` | 水産養殖：高効率化 | `tech.agriculture-food.08.04` | 3 | 49 |
| `tech.agriculture-food.08.06` | 水産養殖：自動化 | `tech.agriculture-food.08.05` | 3 | 52 |
| `tech.agriculture-food.08.07` | 水産養殖：統合システム | `tech.agriculture-food.08.06` | 3 | 55 |
| `tech.agriculture-food.08.08` | 水産養殖：高度最適化 | `tech.agriculture-food.08.07` | 3 | 58 |
| `tech.agriculture-food.08.09` | 水産養殖：広域展開 | `tech.agriculture-food.08.08` | 4 | 61 |
| `tech.agriculture-food.08.10` | 水産養殖：次世代技術 | `tech.agriculture-food.08.09` | 4 | 64 |

#### 09 食料物流

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.09.01` | 食料物流：原理の発見 | `branch.agriculture-food` | 3 | 39 |
| `tech.agriculture-food.09.02` | 食料物流：基礎設計 | `tech.agriculture-food.09.01` | 3 | 42 |
| `tech.agriculture-food.09.03` | 食料物流：実験技術 | `tech.agriculture-food.09.02` | 3 | 45 |
| `tech.agriculture-food.09.04` | 食料物流：実用化 | `tech.agriculture-food.09.03` | 3 | 48 |
| `tech.agriculture-food.09.05` | 食料物流：高効率化 | `tech.agriculture-food.09.04` | 4 | 51 |
| `tech.agriculture-food.09.06` | 食料物流：自動化 | `tech.agriculture-food.09.05` | 4 | 54 |
| `tech.agriculture-food.09.07` | 食料物流：統合システム | `tech.agriculture-food.09.06` | 4 | 57 |
| `tech.agriculture-food.09.08` | 食料物流：高度最適化 | `tech.agriculture-food.09.07` | 4 | 60 |
| `tech.agriculture-food.09.09` | 食料物流：広域展開 | `tech.agriculture-food.09.08` | 5 | 63 |
| `tech.agriculture-food.09.10` | 食料物流：次世代技術 | `tech.agriculture-food.09.09` | 5 | 66 |

#### 10 循環型農業

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.agriculture-food.10.01` | 循環型農業：原理の発見 | `branch.agriculture-food` | 3 | 41 |
| `tech.agriculture-food.10.02` | 循環型農業：基礎設計 | `tech.agriculture-food.10.01` | 3 | 44 |
| `tech.agriculture-food.10.03` | 循環型農業：実験技術 | `tech.agriculture-food.10.02` | 3 | 47 |
| `tech.agriculture-food.10.04` | 循環型農業：実用化 | `tech.agriculture-food.10.03` | 3 | 50 |
| `tech.agriculture-food.10.05` | 循環型農業：高効率化 | `tech.agriculture-food.10.04` | 4 | 53 |
| `tech.agriculture-food.10.06` | 循環型農業：自動化 | `tech.agriculture-food.10.05` | 4 | 56 |
| `tech.agriculture-food.10.07` | 循環型農業：統合システム | `tech.agriculture-food.10.06` | 4 | 59 |
| `tech.agriculture-food.10.08` | 循環型農業：高度最適化 | `tech.agriculture-food.10.07` | 4 | 62 |
| `tech.agriculture-food.10.09` | 循環型農業：広域展開 | `tech.agriculture-food.10.08` | 5 | 65 |
| `tech.agriculture-food.10.10` | 循環型農業：次世代技術 | `tech.agriculture-food.10.09` | 5 | 68 |

### 水資源・衛生(`water-sanitation`)

#### 01 水源調査

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.01.01` | 水源調査：原理の発見 | `branch.water-sanitation` | 1 | 25 |
| `tech.water-sanitation.01.02` | 水源調査：基礎設計 | `tech.water-sanitation.01.01` | 1 | 28 |
| `tech.water-sanitation.01.03` | 水源調査：実験技術 | `tech.water-sanitation.01.02` | 1 | 31 |
| `tech.water-sanitation.01.04` | 水源調査：実用化 | `tech.water-sanitation.01.03` | 1 | 34 |
| `tech.water-sanitation.01.05` | 水源調査：高効率化 | `tech.water-sanitation.01.04` | 2 | 37 |
| `tech.water-sanitation.01.06` | 水源調査：自動化 | `tech.water-sanitation.01.05` | 2 | 40 |
| `tech.water-sanitation.01.07` | 水源調査：統合システム | `tech.water-sanitation.01.06` | 2 | 43 |
| `tech.water-sanitation.01.08` | 水源調査：高度最適化 | `tech.water-sanitation.01.07` | 2 | 46 |
| `tech.water-sanitation.01.09` | 水源調査：広域展開 | `tech.water-sanitation.01.08` | 3 | 49 |
| `tech.water-sanitation.01.10` | 水源調査：次世代技術 | `tech.water-sanitation.01.09` | 3 | 52 |

#### 02 浄水処理

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.02.01` | 浄水処理：原理の発見 | `branch.water-sanitation` | 1 | 27 |
| `tech.water-sanitation.02.02` | 浄水処理：基礎設計 | `tech.water-sanitation.02.01` | 1 | 30 |
| `tech.water-sanitation.02.03` | 浄水処理：実験技術 | `tech.water-sanitation.02.02` | 1 | 33 |
| `tech.water-sanitation.02.04` | 浄水処理：実用化 | `tech.water-sanitation.02.03` | 1 | 36 |
| `tech.water-sanitation.02.05` | 浄水処理：高効率化 | `tech.water-sanitation.02.04` | 2 | 39 |
| `tech.water-sanitation.02.06` | 浄水処理：自動化 | `tech.water-sanitation.02.05` | 2 | 42 |
| `tech.water-sanitation.02.07` | 浄水処理：統合システム | `tech.water-sanitation.02.06` | 2 | 45 |
| `tech.water-sanitation.02.08` | 浄水処理：高度最適化 | `tech.water-sanitation.02.07` | 2 | 48 |
| `tech.water-sanitation.02.09` | 浄水処理：広域展開 | `tech.water-sanitation.02.08` | 3 | 51 |
| `tech.water-sanitation.02.10` | 浄水処理：次世代技術 | `tech.water-sanitation.02.09` | 3 | 54 |

#### 03 海水淡水化

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.03.01` | 海水淡水化：原理の発見 | `branch.water-sanitation` | 1 | 29 |
| `tech.water-sanitation.03.02` | 海水淡水化：基礎設計 | `tech.water-sanitation.03.01` | 1 | 32 |
| `tech.water-sanitation.03.03` | 海水淡水化：実験技術 | `tech.water-sanitation.03.02` | 1 | 35 |
| `tech.water-sanitation.03.04` | 海水淡水化：実用化 | `tech.water-sanitation.03.03` | 1 | 38 |
| `tech.water-sanitation.03.05` | 海水淡水化：高効率化 | `tech.water-sanitation.03.04` | 2 | 41 |
| `tech.water-sanitation.03.06` | 海水淡水化：自動化 | `tech.water-sanitation.03.05` | 2 | 44 |
| `tech.water-sanitation.03.07` | 海水淡水化：統合システム | `tech.water-sanitation.03.06` | 2 | 47 |
| `tech.water-sanitation.03.08` | 海水淡水化：高度最適化 | `tech.water-sanitation.03.07` | 2 | 50 |
| `tech.water-sanitation.03.09` | 海水淡水化：広域展開 | `tech.water-sanitation.03.08` | 3 | 53 |
| `tech.water-sanitation.03.10` | 海水淡水化：次世代技術 | `tech.water-sanitation.03.09` | 3 | 56 |

#### 04 配水網

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.04.01` | 配水網：原理の発見 | `branch.water-sanitation` | 1 | 31 |
| `tech.water-sanitation.04.02` | 配水網：基礎設計 | `tech.water-sanitation.04.01` | 1 | 34 |
| `tech.water-sanitation.04.03` | 配水網：実験技術 | `tech.water-sanitation.04.02` | 1 | 37 |
| `tech.water-sanitation.04.04` | 配水網：実用化 | `tech.water-sanitation.04.03` | 1 | 40 |
| `tech.water-sanitation.04.05` | 配水網：高効率化 | `tech.water-sanitation.04.04` | 2 | 43 |
| `tech.water-sanitation.04.06` | 配水網：自動化 | `tech.water-sanitation.04.05` | 2 | 46 |
| `tech.water-sanitation.04.07` | 配水網：統合システム | `tech.water-sanitation.04.06` | 2 | 49 |
| `tech.water-sanitation.04.08` | 配水網：高度最適化 | `tech.water-sanitation.04.07` | 2 | 52 |
| `tech.water-sanitation.04.09` | 配水網：広域展開 | `tech.water-sanitation.04.08` | 3 | 55 |
| `tech.water-sanitation.04.10` | 配水網：次世代技術 | `tech.water-sanitation.04.09` | 3 | 58 |

#### 05 排水処理

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.05.01` | 排水処理：原理の発見 | `branch.water-sanitation` | 2 | 33 |
| `tech.water-sanitation.05.02` | 排水処理：基礎設計 | `tech.water-sanitation.05.01` | 2 | 36 |
| `tech.water-sanitation.05.03` | 排水処理：実験技術 | `tech.water-sanitation.05.02` | 2 | 39 |
| `tech.water-sanitation.05.04` | 排水処理：実用化 | `tech.water-sanitation.05.03` | 2 | 42 |
| `tech.water-sanitation.05.05` | 排水処理：高効率化 | `tech.water-sanitation.05.04` | 3 | 45 |
| `tech.water-sanitation.05.06` | 排水処理：自動化 | `tech.water-sanitation.05.05` | 3 | 48 |
| `tech.water-sanitation.05.07` | 排水処理：統合システム | `tech.water-sanitation.05.06` | 3 | 51 |
| `tech.water-sanitation.05.08` | 排水処理：高度最適化 | `tech.water-sanitation.05.07` | 3 | 54 |
| `tech.water-sanitation.05.09` | 排水処理：広域展開 | `tech.water-sanitation.05.08` | 4 | 57 |
| `tech.water-sanitation.05.10` | 排水処理：次世代技術 | `tech.water-sanitation.05.09` | 4 | 60 |

#### 06 水質監視

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.06.01` | 水質監視：原理の発見 | `branch.water-sanitation` | 2 | 35 |
| `tech.water-sanitation.06.02` | 水質監視：基礎設計 | `tech.water-sanitation.06.01` | 2 | 38 |
| `tech.water-sanitation.06.03` | 水質監視：実験技術 | `tech.water-sanitation.06.02` | 2 | 41 |
| `tech.water-sanitation.06.04` | 水質監視：実用化 | `tech.water-sanitation.06.03` | 2 | 44 |
| `tech.water-sanitation.06.05` | 水質監視：高効率化 | `tech.water-sanitation.06.04` | 3 | 47 |
| `tech.water-sanitation.06.06` | 水質監視：自動化 | `tech.water-sanitation.06.05` | 3 | 50 |
| `tech.water-sanitation.06.07` | 水質監視：統合システム | `tech.water-sanitation.06.06` | 3 | 53 |
| `tech.water-sanitation.06.08` | 水質監視：高度最適化 | `tech.water-sanitation.06.07` | 3 | 56 |
| `tech.water-sanitation.06.09` | 水質監視：広域展開 | `tech.water-sanitation.06.08` | 4 | 59 |
| `tech.water-sanitation.06.10` | 水質監視：次世代技術 | `tech.water-sanitation.06.09` | 4 | 62 |

#### 07 衛生設備

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.07.01` | 衛生設備：原理の発見 | `branch.water-sanitation` | 2 | 37 |
| `tech.water-sanitation.07.02` | 衛生設備：基礎設計 | `tech.water-sanitation.07.01` | 2 | 40 |
| `tech.water-sanitation.07.03` | 衛生設備：実験技術 | `tech.water-sanitation.07.02` | 2 | 43 |
| `tech.water-sanitation.07.04` | 衛生設備：実用化 | `tech.water-sanitation.07.03` | 2 | 46 |
| `tech.water-sanitation.07.05` | 衛生設備：高効率化 | `tech.water-sanitation.07.04` | 3 | 49 |
| `tech.water-sanitation.07.06` | 衛生設備：自動化 | `tech.water-sanitation.07.05` | 3 | 52 |
| `tech.water-sanitation.07.07` | 衛生設備：統合システム | `tech.water-sanitation.07.06` | 3 | 55 |
| `tech.water-sanitation.07.08` | 衛生設備：高度最適化 | `tech.water-sanitation.07.07` | 3 | 58 |
| `tech.water-sanitation.07.09` | 衛生設備：広域展開 | `tech.water-sanitation.07.08` | 4 | 61 |
| `tech.water-sanitation.07.10` | 衛生設備：次世代技術 | `tech.water-sanitation.07.09` | 4 | 64 |

#### 08 雨水利用

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.08.01` | 雨水利用：原理の発見 | `branch.water-sanitation` | 2 | 39 |
| `tech.water-sanitation.08.02` | 雨水利用：基礎設計 | `tech.water-sanitation.08.01` | 2 | 42 |
| `tech.water-sanitation.08.03` | 雨水利用：実験技術 | `tech.water-sanitation.08.02` | 2 | 45 |
| `tech.water-sanitation.08.04` | 雨水利用：実用化 | `tech.water-sanitation.08.03` | 2 | 48 |
| `tech.water-sanitation.08.05` | 雨水利用：高効率化 | `tech.water-sanitation.08.04` | 3 | 51 |
| `tech.water-sanitation.08.06` | 雨水利用：自動化 | `tech.water-sanitation.08.05` | 3 | 54 |
| `tech.water-sanitation.08.07` | 雨水利用：統合システム | `tech.water-sanitation.08.06` | 3 | 57 |
| `tech.water-sanitation.08.08` | 雨水利用：高度最適化 | `tech.water-sanitation.08.07` | 3 | 60 |
| `tech.water-sanitation.08.09` | 雨水利用：広域展開 | `tech.water-sanitation.08.08` | 4 | 63 |
| `tech.water-sanitation.08.10` | 雨水利用：次世代技術 | `tech.water-sanitation.08.09` | 4 | 66 |

#### 09 水循環管理

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.09.01` | 水循環管理：原理の発見 | `branch.water-sanitation` | 3 | 41 |
| `tech.water-sanitation.09.02` | 水循環管理：基礎設計 | `tech.water-sanitation.09.01` | 3 | 44 |
| `tech.water-sanitation.09.03` | 水循環管理：実験技術 | `tech.water-sanitation.09.02` | 3 | 47 |
| `tech.water-sanitation.09.04` | 水循環管理：実用化 | `tech.water-sanitation.09.03` | 3 | 50 |
| `tech.water-sanitation.09.05` | 水循環管理：高効率化 | `tech.water-sanitation.09.04` | 4 | 53 |
| `tech.water-sanitation.09.06` | 水循環管理：自動化 | `tech.water-sanitation.09.05` | 4 | 56 |
| `tech.water-sanitation.09.07` | 水循環管理：統合システム | `tech.water-sanitation.09.06` | 4 | 59 |
| `tech.water-sanitation.09.08` | 水循環管理：高度最適化 | `tech.water-sanitation.09.07` | 4 | 62 |
| `tech.water-sanitation.09.09` | 水循環管理：広域展開 | `tech.water-sanitation.09.08` | 5 | 65 |
| `tech.water-sanitation.09.10` | 水循環管理：次世代技術 | `tech.water-sanitation.09.09` | 5 | 68 |

#### 10 災害時給水

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.water-sanitation.10.01` | 災害時給水：原理の発見 | `branch.water-sanitation` | 3 | 43 |
| `tech.water-sanitation.10.02` | 災害時給水：基礎設計 | `tech.water-sanitation.10.01` | 3 | 46 |
| `tech.water-sanitation.10.03` | 災害時給水：実験技術 | `tech.water-sanitation.10.02` | 3 | 49 |
| `tech.water-sanitation.10.04` | 災害時給水：実用化 | `tech.water-sanitation.10.03` | 3 | 52 |
| `tech.water-sanitation.10.05` | 災害時給水：高効率化 | `tech.water-sanitation.10.04` | 4 | 55 |
| `tech.water-sanitation.10.06` | 災害時給水：自動化 | `tech.water-sanitation.10.05` | 4 | 58 |
| `tech.water-sanitation.10.07` | 災害時給水：統合システム | `tech.water-sanitation.10.06` | 4 | 61 |
| `tech.water-sanitation.10.08` | 災害時給水：高度最適化 | `tech.water-sanitation.10.07` | 4 | 64 |
| `tech.water-sanitation.10.09` | 災害時給水：広域展開 | `tech.water-sanitation.10.08` | 5 | 67 |
| `tech.water-sanitation.10.10` | 災害時給水：次世代技術 | `tech.water-sanitation.10.09` | 5 | 70 |

### 建築・都市(`construction-urban`)

#### 01 基礎建築

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.01.01` | 基礎建築：原理の発見 | `branch.construction-urban` | 1 | 27 |
| `tech.construction-urban.01.02` | 基礎建築：基礎設計 | `tech.construction-urban.01.01` | 1 | 30 |
| `tech.construction-urban.01.03` | 基礎建築：実験技術 | `tech.construction-urban.01.02` | 1 | 33 |
| `tech.construction-urban.01.04` | 基礎建築：実用化 | `tech.construction-urban.01.03` | 1 | 36 |
| `tech.construction-urban.01.05` | 基礎建築：高効率化 | `tech.construction-urban.01.04` | 2 | 39 |
| `tech.construction-urban.01.06` | 基礎建築：自動化 | `tech.construction-urban.01.05` | 2 | 42 |
| `tech.construction-urban.01.07` | 基礎建築：統合システム | `tech.construction-urban.01.06` | 2 | 45 |
| `tech.construction-urban.01.08` | 基礎建築：高度最適化 | `tech.construction-urban.01.07` | 2 | 48 |
| `tech.construction-urban.01.09` | 基礎建築：広域展開 | `tech.construction-urban.01.08` | 3 | 51 |
| `tech.construction-urban.01.10` | 基礎建築：次世代技術 | `tech.construction-urban.01.09` | 3 | 54 |

#### 02 耐震構造

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.02.01` | 耐震構造：原理の発見 | `branch.construction-urban` | 1 | 29 |
| `tech.construction-urban.02.02` | 耐震構造：基礎設計 | `tech.construction-urban.02.01` | 1 | 32 |
| `tech.construction-urban.02.03` | 耐震構造：実験技術 | `tech.construction-urban.02.02` | 1 | 35 |
| `tech.construction-urban.02.04` | 耐震構造：実用化 | `tech.construction-urban.02.03` | 1 | 38 |
| `tech.construction-urban.02.05` | 耐震構造：高効率化 | `tech.construction-urban.02.04` | 2 | 41 |
| `tech.construction-urban.02.06` | 耐震構造：自動化 | `tech.construction-urban.02.05` | 2 | 44 |
| `tech.construction-urban.02.07` | 耐震構造：統合システム | `tech.construction-urban.02.06` | 2 | 47 |
| `tech.construction-urban.02.08` | 耐震構造：高度最適化 | `tech.construction-urban.02.07` | 2 | 50 |
| `tech.construction-urban.02.09` | 耐震構造：広域展開 | `tech.construction-urban.02.08` | 3 | 53 |
| `tech.construction-urban.02.10` | 耐震構造：次世代技術 | `tech.construction-urban.02.09` | 3 | 56 |

#### 03 高層建築

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.03.01` | 高層建築：原理の発見 | `branch.construction-urban` | 1 | 31 |
| `tech.construction-urban.03.02` | 高層建築：基礎設計 | `tech.construction-urban.03.01` | 1 | 34 |
| `tech.construction-urban.03.03` | 高層建築：実験技術 | `tech.construction-urban.03.02` | 1 | 37 |
| `tech.construction-urban.03.04` | 高層建築：実用化 | `tech.construction-urban.03.03` | 1 | 40 |
| `tech.construction-urban.03.05` | 高層建築：高効率化 | `tech.construction-urban.03.04` | 2 | 43 |
| `tech.construction-urban.03.06` | 高層建築：自動化 | `tech.construction-urban.03.05` | 2 | 46 |
| `tech.construction-urban.03.07` | 高層建築：統合システム | `tech.construction-urban.03.06` | 2 | 49 |
| `tech.construction-urban.03.08` | 高層建築：高度最適化 | `tech.construction-urban.03.07` | 2 | 52 |
| `tech.construction-urban.03.09` | 高層建築：広域展開 | `tech.construction-urban.03.08` | 3 | 55 |
| `tech.construction-urban.03.10` | 高層建築：次世代技術 | `tech.construction-urban.03.09` | 3 | 58 |

#### 04 都市計画

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.04.01` | 都市計画：原理の発見 | `branch.construction-urban` | 1 | 33 |
| `tech.construction-urban.04.02` | 都市計画：基礎設計 | `tech.construction-urban.04.01` | 1 | 36 |
| `tech.construction-urban.04.03` | 都市計画：実験技術 | `tech.construction-urban.04.02` | 1 | 39 |
| `tech.construction-urban.04.04` | 都市計画：実用化 | `tech.construction-urban.04.03` | 1 | 42 |
| `tech.construction-urban.04.05` | 都市計画：高効率化 | `tech.construction-urban.04.04` | 2 | 45 |
| `tech.construction-urban.04.06` | 都市計画：自動化 | `tech.construction-urban.04.05` | 2 | 48 |
| `tech.construction-urban.04.07` | 都市計画：統合システム | `tech.construction-urban.04.06` | 2 | 51 |
| `tech.construction-urban.04.08` | 都市計画：高度最適化 | `tech.construction-urban.04.07` | 2 | 54 |
| `tech.construction-urban.04.09` | 都市計画：広域展開 | `tech.construction-urban.04.08` | 3 | 57 |
| `tech.construction-urban.04.10` | 都市計画：次世代技術 | `tech.construction-urban.04.09` | 3 | 60 |

#### 05 道路設計

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.05.01` | 道路設計：原理の発見 | `branch.construction-urban` | 2 | 35 |
| `tech.construction-urban.05.02` | 道路設計：基礎設計 | `tech.construction-urban.05.01` | 2 | 38 |
| `tech.construction-urban.05.03` | 道路設計：実験技術 | `tech.construction-urban.05.02` | 2 | 41 |
| `tech.construction-urban.05.04` | 道路設計：実用化 | `tech.construction-urban.05.03` | 2 | 44 |
| `tech.construction-urban.05.05` | 道路設計：高効率化 | `tech.construction-urban.05.04` | 3 | 47 |
| `tech.construction-urban.05.06` | 道路設計：自動化 | `tech.construction-urban.05.05` | 3 | 50 |
| `tech.construction-urban.05.07` | 道路設計：統合システム | `tech.construction-urban.05.06` | 3 | 53 |
| `tech.construction-urban.05.08` | 道路設計：高度最適化 | `tech.construction-urban.05.07` | 3 | 56 |
| `tech.construction-urban.05.09` | 道路設計：広域展開 | `tech.construction-urban.05.08` | 4 | 59 |
| `tech.construction-urban.05.10` | 道路設計：次世代技術 | `tech.construction-urban.05.09` | 4 | 62 |

#### 06 公共施設

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.06.01` | 公共施設：原理の発見 | `branch.construction-urban` | 2 | 37 |
| `tech.construction-urban.06.02` | 公共施設：基礎設計 | `tech.construction-urban.06.01` | 2 | 40 |
| `tech.construction-urban.06.03` | 公共施設：実験技術 | `tech.construction-urban.06.02` | 2 | 43 |
| `tech.construction-urban.06.04` | 公共施設：実用化 | `tech.construction-urban.06.03` | 2 | 46 |
| `tech.construction-urban.06.05` | 公共施設：高効率化 | `tech.construction-urban.06.04` | 3 | 49 |
| `tech.construction-urban.06.06` | 公共施設：自動化 | `tech.construction-urban.06.05` | 3 | 52 |
| `tech.construction-urban.06.07` | 公共施設：統合システム | `tech.construction-urban.06.06` | 3 | 55 |
| `tech.construction-urban.06.08` | 公共施設：高度最適化 | `tech.construction-urban.06.07` | 3 | 58 |
| `tech.construction-urban.06.09` | 公共施設：広域展開 | `tech.construction-urban.06.08` | 4 | 61 |
| `tech.construction-urban.06.10` | 公共施設：次世代技術 | `tech.construction-urban.06.09` | 4 | 64 |

#### 07 住宅断熱

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.07.01` | 住宅断熱：原理の発見 | `branch.construction-urban` | 2 | 39 |
| `tech.construction-urban.07.02` | 住宅断熱：基礎設計 | `tech.construction-urban.07.01` | 2 | 42 |
| `tech.construction-urban.07.03` | 住宅断熱：実験技術 | `tech.construction-urban.07.02` | 2 | 45 |
| `tech.construction-urban.07.04` | 住宅断熱：実用化 | `tech.construction-urban.07.03` | 2 | 48 |
| `tech.construction-urban.07.05` | 住宅断熱：高効率化 | `tech.construction-urban.07.04` | 3 | 51 |
| `tech.construction-urban.07.06` | 住宅断熱：自動化 | `tech.construction-urban.07.05` | 3 | 54 |
| `tech.construction-urban.07.07` | 住宅断熱：統合システム | `tech.construction-urban.07.06` | 3 | 57 |
| `tech.construction-urban.07.08` | 住宅断熱：高度最適化 | `tech.construction-urban.07.07` | 3 | 60 |
| `tech.construction-urban.07.09` | 住宅断熱：広域展開 | `tech.construction-urban.07.08` | 4 | 63 |
| `tech.construction-urban.07.10` | 住宅断熱：次世代技術 | `tech.construction-urban.07.09` | 4 | 66 |

#### 08 地下空間

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.08.01` | 地下空間：原理の発見 | `branch.construction-urban` | 2 | 41 |
| `tech.construction-urban.08.02` | 地下空間：基礎設計 | `tech.construction-urban.08.01` | 2 | 44 |
| `tech.construction-urban.08.03` | 地下空間：実験技術 | `tech.construction-urban.08.02` | 2 | 47 |
| `tech.construction-urban.08.04` | 地下空間：実用化 | `tech.construction-urban.08.03` | 2 | 50 |
| `tech.construction-urban.08.05` | 地下空間：高効率化 | `tech.construction-urban.08.04` | 3 | 53 |
| `tech.construction-urban.08.06` | 地下空間：自動化 | `tech.construction-urban.08.05` | 3 | 56 |
| `tech.construction-urban.08.07` | 地下空間：統合システム | `tech.construction-urban.08.06` | 3 | 59 |
| `tech.construction-urban.08.08` | 地下空間：高度最適化 | `tech.construction-urban.08.07` | 3 | 62 |
| `tech.construction-urban.08.09` | 地下空間：広域展開 | `tech.construction-urban.08.08` | 4 | 65 |
| `tech.construction-urban.08.10` | 地下空間：次世代技術 | `tech.construction-urban.08.09` | 4 | 68 |

#### 09 スマートシティ

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.09.01` | スマートシティ：原理の発見 | `branch.construction-urban` | 3 | 43 |
| `tech.construction-urban.09.02` | スマートシティ：基礎設計 | `tech.construction-urban.09.01` | 3 | 46 |
| `tech.construction-urban.09.03` | スマートシティ：実験技術 | `tech.construction-urban.09.02` | 3 | 49 |
| `tech.construction-urban.09.04` | スマートシティ：実用化 | `tech.construction-urban.09.03` | 3 | 52 |
| `tech.construction-urban.09.05` | スマートシティ：高効率化 | `tech.construction-urban.09.04` | 4 | 55 |
| `tech.construction-urban.09.06` | スマートシティ：自動化 | `tech.construction-urban.09.05` | 4 | 58 |
| `tech.construction-urban.09.07` | スマートシティ：統合システム | `tech.construction-urban.09.06` | 4 | 61 |
| `tech.construction-urban.09.08` | スマートシティ：高度最適化 | `tech.construction-urban.09.07` | 4 | 64 |
| `tech.construction-urban.09.09` | スマートシティ：広域展開 | `tech.construction-urban.09.08` | 5 | 67 |
| `tech.construction-urban.09.10` | スマートシティ：次世代技術 | `tech.construction-urban.09.09` | 5 | 70 |

#### 10 居住環境

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.construction-urban.10.01` | 居住環境：原理の発見 | `branch.construction-urban` | 3 | 45 |
| `tech.construction-urban.10.02` | 居住環境：基礎設計 | `tech.construction-urban.10.01` | 3 | 48 |
| `tech.construction-urban.10.03` | 居住環境：実験技術 | `tech.construction-urban.10.02` | 3 | 51 |
| `tech.construction-urban.10.04` | 居住環境：実用化 | `tech.construction-urban.10.03` | 3 | 54 |
| `tech.construction-urban.10.05` | 居住環境：高効率化 | `tech.construction-urban.10.04` | 4 | 57 |
| `tech.construction-urban.10.06` | 居住環境：自動化 | `tech.construction-urban.10.05` | 4 | 60 |
| `tech.construction-urban.10.07` | 居住環境：統合システム | `tech.construction-urban.10.06` | 4 | 63 |
| `tech.construction-urban.10.08` | 居住環境：高度最適化 | `tech.construction-urban.10.07` | 4 | 66 |
| `tech.construction-urban.10.09` | 居住環境：広域展開 | `tech.construction-urban.10.08` | 5 | 69 |
| `tech.construction-urban.10.10` | 居住環境：次世代技術 | `tech.construction-urban.10.09` | 5 | 72 |

### 素材・製造(`materials-manufacturing`)

#### 01 金属精錬

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.01.01` | 金属精錬：原理の発見 | `branch.materials-manufacturing` | 2 | 29 |
| `tech.materials-manufacturing.01.02` | 金属精錬：基礎設計 | `tech.materials-manufacturing.01.01` | 2 | 32 |
| `tech.materials-manufacturing.01.03` | 金属精錬：実験技術 | `tech.materials-manufacturing.01.02` | 2 | 35 |
| `tech.materials-manufacturing.01.04` | 金属精錬：実用化 | `tech.materials-manufacturing.01.03` | 2 | 38 |
| `tech.materials-manufacturing.01.05` | 金属精錬：高効率化 | `tech.materials-manufacturing.01.04` | 3 | 41 |
| `tech.materials-manufacturing.01.06` | 金属精錬：自動化 | `tech.materials-manufacturing.01.05` | 3 | 44 |
| `tech.materials-manufacturing.01.07` | 金属精錬：統合システム | `tech.materials-manufacturing.01.06` | 3 | 47 |
| `tech.materials-manufacturing.01.08` | 金属精錬：高度最適化 | `tech.materials-manufacturing.01.07` | 3 | 50 |
| `tech.materials-manufacturing.01.09` | 金属精錬：広域展開 | `tech.materials-manufacturing.01.08` | 4 | 53 |
| `tech.materials-manufacturing.01.10` | 金属精錬：次世代技術 | `tech.materials-manufacturing.01.09` | 4 | 56 |

#### 02 合金設計

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.02.01` | 合金設計：原理の発見 | `branch.materials-manufacturing` | 2 | 31 |
| `tech.materials-manufacturing.02.02` | 合金設計：基礎設計 | `tech.materials-manufacturing.02.01` | 2 | 34 |
| `tech.materials-manufacturing.02.03` | 合金設計：実験技術 | `tech.materials-manufacturing.02.02` | 2 | 37 |
| `tech.materials-manufacturing.02.04` | 合金設計：実用化 | `tech.materials-manufacturing.02.03` | 2 | 40 |
| `tech.materials-manufacturing.02.05` | 合金設計：高効率化 | `tech.materials-manufacturing.02.04` | 3 | 43 |
| `tech.materials-manufacturing.02.06` | 合金設計：自動化 | `tech.materials-manufacturing.02.05` | 3 | 46 |
| `tech.materials-manufacturing.02.07` | 合金設計：統合システム | `tech.materials-manufacturing.02.06` | 3 | 49 |
| `tech.materials-manufacturing.02.08` | 合金設計：高度最適化 | `tech.materials-manufacturing.02.07` | 3 | 52 |
| `tech.materials-manufacturing.02.09` | 合金設計：広域展開 | `tech.materials-manufacturing.02.08` | 4 | 55 |
| `tech.materials-manufacturing.02.10` | 合金設計：次世代技術 | `tech.materials-manufacturing.02.09` | 4 | 58 |

#### 03 高分子材料

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.03.01` | 高分子材料：原理の発見 | `branch.materials-manufacturing` | 2 | 33 |
| `tech.materials-manufacturing.03.02` | 高分子材料：基礎設計 | `tech.materials-manufacturing.03.01` | 2 | 36 |
| `tech.materials-manufacturing.03.03` | 高分子材料：実験技術 | `tech.materials-manufacturing.03.02` | 2 | 39 |
| `tech.materials-manufacturing.03.04` | 高分子材料：実用化 | `tech.materials-manufacturing.03.03` | 2 | 42 |
| `tech.materials-manufacturing.03.05` | 高分子材料：高効率化 | `tech.materials-manufacturing.03.04` | 3 | 45 |
| `tech.materials-manufacturing.03.06` | 高分子材料：自動化 | `tech.materials-manufacturing.03.05` | 3 | 48 |
| `tech.materials-manufacturing.03.07` | 高分子材料：統合システム | `tech.materials-manufacturing.03.06` | 3 | 51 |
| `tech.materials-manufacturing.03.08` | 高分子材料：高度最適化 | `tech.materials-manufacturing.03.07` | 3 | 54 |
| `tech.materials-manufacturing.03.09` | 高分子材料：広域展開 | `tech.materials-manufacturing.03.08` | 4 | 57 |
| `tech.materials-manufacturing.03.10` | 高分子材料：次世代技術 | `tech.materials-manufacturing.03.09` | 4 | 60 |

#### 04 セラミックス

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.04.01` | セラミックス：原理の発見 | `branch.materials-manufacturing` | 2 | 35 |
| `tech.materials-manufacturing.04.02` | セラミックス：基礎設計 | `tech.materials-manufacturing.04.01` | 2 | 38 |
| `tech.materials-manufacturing.04.03` | セラミックス：実験技術 | `tech.materials-manufacturing.04.02` | 2 | 41 |
| `tech.materials-manufacturing.04.04` | セラミックス：実用化 | `tech.materials-manufacturing.04.03` | 2 | 44 |
| `tech.materials-manufacturing.04.05` | セラミックス：高効率化 | `tech.materials-manufacturing.04.04` | 3 | 47 |
| `tech.materials-manufacturing.04.06` | セラミックス：自動化 | `tech.materials-manufacturing.04.05` | 3 | 50 |
| `tech.materials-manufacturing.04.07` | セラミックス：統合システム | `tech.materials-manufacturing.04.06` | 3 | 53 |
| `tech.materials-manufacturing.04.08` | セラミックス：高度最適化 | `tech.materials-manufacturing.04.07` | 3 | 56 |
| `tech.materials-manufacturing.04.09` | セラミックス：広域展開 | `tech.materials-manufacturing.04.08` | 4 | 59 |
| `tech.materials-manufacturing.04.10` | セラミックス：次世代技術 | `tech.materials-manufacturing.04.09` | 4 | 62 |

#### 05 複合材料

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.05.01` | 複合材料：原理の発見 | `branch.materials-manufacturing` | 3 | 37 |
| `tech.materials-manufacturing.05.02` | 複合材料：基礎設計 | `tech.materials-manufacturing.05.01` | 3 | 40 |
| `tech.materials-manufacturing.05.03` | 複合材料：実験技術 | `tech.materials-manufacturing.05.02` | 3 | 43 |
| `tech.materials-manufacturing.05.04` | 複合材料：実用化 | `tech.materials-manufacturing.05.03` | 3 | 46 |
| `tech.materials-manufacturing.05.05` | 複合材料：高効率化 | `tech.materials-manufacturing.05.04` | 4 | 49 |
| `tech.materials-manufacturing.05.06` | 複合材料：自動化 | `tech.materials-manufacturing.05.05` | 4 | 52 |
| `tech.materials-manufacturing.05.07` | 複合材料：統合システム | `tech.materials-manufacturing.05.06` | 4 | 55 |
| `tech.materials-manufacturing.05.08` | 複合材料：高度最適化 | `tech.materials-manufacturing.05.07` | 4 | 58 |
| `tech.materials-manufacturing.05.09` | 複合材料：広域展開 | `tech.materials-manufacturing.05.08` | 5 | 61 |
| `tech.materials-manufacturing.05.10` | 複合材料：次世代技術 | `tech.materials-manufacturing.05.09` | 5 | 64 |

#### 06 精密加工

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.06.01` | 精密加工：原理の発見 | `branch.materials-manufacturing` | 3 | 39 |
| `tech.materials-manufacturing.06.02` | 精密加工：基礎設計 | `tech.materials-manufacturing.06.01` | 3 | 42 |
| `tech.materials-manufacturing.06.03` | 精密加工：実験技術 | `tech.materials-manufacturing.06.02` | 3 | 45 |
| `tech.materials-manufacturing.06.04` | 精密加工：実用化 | `tech.materials-manufacturing.06.03` | 3 | 48 |
| `tech.materials-manufacturing.06.05` | 精密加工：高効率化 | `tech.materials-manufacturing.06.04` | 4 | 51 |
| `tech.materials-manufacturing.06.06` | 精密加工：自動化 | `tech.materials-manufacturing.06.05` | 4 | 54 |
| `tech.materials-manufacturing.06.07` | 精密加工：統合システム | `tech.materials-manufacturing.06.06` | 4 | 57 |
| `tech.materials-manufacturing.06.08` | 精密加工：高度最適化 | `tech.materials-manufacturing.06.07` | 4 | 60 |
| `tech.materials-manufacturing.06.09` | 精密加工：広域展開 | `tech.materials-manufacturing.06.08` | 5 | 63 |
| `tech.materials-manufacturing.06.10` | 精密加工：次世代技術 | `tech.materials-manufacturing.06.09` | 5 | 66 |

#### 07 積層造形

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.07.01` | 積層造形：原理の発見 | `branch.materials-manufacturing` | 3 | 41 |
| `tech.materials-manufacturing.07.02` | 積層造形：基礎設計 | `tech.materials-manufacturing.07.01` | 3 | 44 |
| `tech.materials-manufacturing.07.03` | 積層造形：実験技術 | `tech.materials-manufacturing.07.02` | 3 | 47 |
| `tech.materials-manufacturing.07.04` | 積層造形：実用化 | `tech.materials-manufacturing.07.03` | 3 | 50 |
| `tech.materials-manufacturing.07.05` | 積層造形：高効率化 | `tech.materials-manufacturing.07.04` | 4 | 53 |
| `tech.materials-manufacturing.07.06` | 積層造形：自動化 | `tech.materials-manufacturing.07.05` | 4 | 56 |
| `tech.materials-manufacturing.07.07` | 積層造形：統合システム | `tech.materials-manufacturing.07.06` | 4 | 59 |
| `tech.materials-manufacturing.07.08` | 積層造形：高度最適化 | `tech.materials-manufacturing.07.07` | 4 | 62 |
| `tech.materials-manufacturing.07.09` | 積層造形：広域展開 | `tech.materials-manufacturing.07.08` | 5 | 65 |
| `tech.materials-manufacturing.07.10` | 積層造形：次世代技術 | `tech.materials-manufacturing.07.09` | 5 | 68 |

#### 08 品質管理

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.08.01` | 品質管理：原理の発見 | `branch.materials-manufacturing` | 3 | 43 |
| `tech.materials-manufacturing.08.02` | 品質管理：基礎設計 | `tech.materials-manufacturing.08.01` | 3 | 46 |
| `tech.materials-manufacturing.08.03` | 品質管理：実験技術 | `tech.materials-manufacturing.08.02` | 3 | 49 |
| `tech.materials-manufacturing.08.04` | 品質管理：実用化 | `tech.materials-manufacturing.08.03` | 3 | 52 |
| `tech.materials-manufacturing.08.05` | 品質管理：高効率化 | `tech.materials-manufacturing.08.04` | 4 | 55 |
| `tech.materials-manufacturing.08.06` | 品質管理：自動化 | `tech.materials-manufacturing.08.05` | 4 | 58 |
| `tech.materials-manufacturing.08.07` | 品質管理：統合システム | `tech.materials-manufacturing.08.06` | 4 | 61 |
| `tech.materials-manufacturing.08.08` | 品質管理：高度最適化 | `tech.materials-manufacturing.08.07` | 4 | 64 |
| `tech.materials-manufacturing.08.09` | 品質管理：広域展開 | `tech.materials-manufacturing.08.08` | 5 | 67 |
| `tech.materials-manufacturing.08.10` | 品質管理：次世代技術 | `tech.materials-manufacturing.08.09` | 5 | 70 |

#### 09 リサイクル素材

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.09.01` | リサイクル素材：原理の発見 | `branch.materials-manufacturing` | 4 | 45 |
| `tech.materials-manufacturing.09.02` | リサイクル素材：基礎設計 | `tech.materials-manufacturing.09.01` | 4 | 48 |
| `tech.materials-manufacturing.09.03` | リサイクル素材：実験技術 | `tech.materials-manufacturing.09.02` | 4 | 51 |
| `tech.materials-manufacturing.09.04` | リサイクル素材：実用化 | `tech.materials-manufacturing.09.03` | 4 | 54 |
| `tech.materials-manufacturing.09.05` | リサイクル素材：高効率化 | `tech.materials-manufacturing.09.04` | 5 | 57 |
| `tech.materials-manufacturing.09.06` | リサイクル素材：自動化 | `tech.materials-manufacturing.09.05` | 5 | 60 |
| `tech.materials-manufacturing.09.07` | リサイクル素材：統合システム | `tech.materials-manufacturing.09.06` | 5 | 63 |
| `tech.materials-manufacturing.09.08` | リサイクル素材：高度最適化 | `tech.materials-manufacturing.09.07` | 5 | 66 |
| `tech.materials-manufacturing.09.09` | リサイクル素材：広域展開 | `tech.materials-manufacturing.09.08` | 5 | 69 |
| `tech.materials-manufacturing.09.10` | リサイクル素材：次世代技術 | `tech.materials-manufacturing.09.09` | 5 | 72 |

#### 10 ナノ材料

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.materials-manufacturing.10.01` | ナノ材料：原理の発見 | `branch.materials-manufacturing` | 4 | 47 |
| `tech.materials-manufacturing.10.02` | ナノ材料：基礎設計 | `tech.materials-manufacturing.10.01` | 4 | 50 |
| `tech.materials-manufacturing.10.03` | ナノ材料：実験技術 | `tech.materials-manufacturing.10.02` | 4 | 53 |
| `tech.materials-manufacturing.10.04` | ナノ材料：実用化 | `tech.materials-manufacturing.10.03` | 4 | 56 |
| `tech.materials-manufacturing.10.05` | ナノ材料：高効率化 | `tech.materials-manufacturing.10.04` | 5 | 59 |
| `tech.materials-manufacturing.10.06` | ナノ材料：自動化 | `tech.materials-manufacturing.10.05` | 5 | 62 |
| `tech.materials-manufacturing.10.07` | ナノ材料：統合システム | `tech.materials-manufacturing.10.06` | 5 | 65 |
| `tech.materials-manufacturing.10.08` | ナノ材料：高度最適化 | `tech.materials-manufacturing.10.07` | 5 | 68 |
| `tech.materials-manufacturing.10.09` | ナノ材料：広域展開 | `tech.materials-manufacturing.10.08` | 5 | 71 |
| `tech.materials-manufacturing.10.10` | ナノ材料：次世代技術 | `tech.materials-manufacturing.10.09` | 5 | 74 |

### エネルギー(`energy`)

#### 01 太陽光発電

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.01.01` | 太陽光発電：原理の発見 | `branch.energy` | 2 | 31 |
| `tech.energy.01.02` | 太陽光発電：基礎設計 | `tech.energy.01.01` | 2 | 34 |
| `tech.energy.01.03` | 太陽光発電：実験技術 | `tech.energy.01.02` | 2 | 37 |
| `tech.energy.01.04` | 太陽光発電：実用化 | `tech.energy.01.03` | 2 | 40 |
| `tech.energy.01.05` | 太陽光発電：高効率化 | `tech.energy.01.04` | 3 | 43 |
| `tech.energy.01.06` | 太陽光発電：自動化 | `tech.energy.01.05` | 3 | 46 |
| `tech.energy.01.07` | 太陽光発電：統合システム | `tech.energy.01.06` | 3 | 49 |
| `tech.energy.01.08` | 太陽光発電：高度最適化 | `tech.energy.01.07` | 3 | 52 |
| `tech.energy.01.09` | 太陽光発電：広域展開 | `tech.energy.01.08` | 4 | 55 |
| `tech.energy.01.10` | 太陽光発電：次世代技術 | `tech.energy.01.09` | 4 | 58 |

#### 02 風力発電

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.02.01` | 風力発電：原理の発見 | `branch.energy` | 2 | 33 |
| `tech.energy.02.02` | 風力発電：基礎設計 | `tech.energy.02.01` | 2 | 36 |
| `tech.energy.02.03` | 風力発電：実験技術 | `tech.energy.02.02` | 2 | 39 |
| `tech.energy.02.04` | 風力発電：実用化 | `tech.energy.02.03` | 2 | 42 |
| `tech.energy.02.05` | 風力発電：高効率化 | `tech.energy.02.04` | 3 | 45 |
| `tech.energy.02.06` | 風力発電：自動化 | `tech.energy.02.05` | 3 | 48 |
| `tech.energy.02.07` | 風力発電：統合システム | `tech.energy.02.06` | 3 | 51 |
| `tech.energy.02.08` | 風力発電：高度最適化 | `tech.energy.02.07` | 3 | 54 |
| `tech.energy.02.09` | 風力発電：広域展開 | `tech.energy.02.08` | 4 | 57 |
| `tech.energy.02.10` | 風力発電：次世代技術 | `tech.energy.02.09` | 4 | 60 |

#### 03 水力発電

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.03.01` | 水力発電：原理の発見 | `branch.energy` | 2 | 35 |
| `tech.energy.03.02` | 水力発電：基礎設計 | `tech.energy.03.01` | 2 | 38 |
| `tech.energy.03.03` | 水力発電：実験技術 | `tech.energy.03.02` | 2 | 41 |
| `tech.energy.03.04` | 水力発電：実用化 | `tech.energy.03.03` | 2 | 44 |
| `tech.energy.03.05` | 水力発電：高効率化 | `tech.energy.03.04` | 3 | 47 |
| `tech.energy.03.06` | 水力発電：自動化 | `tech.energy.03.05` | 3 | 50 |
| `tech.energy.03.07` | 水力発電：統合システム | `tech.energy.03.06` | 3 | 53 |
| `tech.energy.03.08` | 水力発電：高度最適化 | `tech.energy.03.07` | 3 | 56 |
| `tech.energy.03.09` | 水力発電：広域展開 | `tech.energy.03.08` | 4 | 59 |
| `tech.energy.03.10` | 水力発電：次世代技術 | `tech.energy.03.09` | 4 | 62 |

#### 04 地熱利用

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.04.01` | 地熱利用：原理の発見 | `branch.energy` | 2 | 37 |
| `tech.energy.04.02` | 地熱利用：基礎設計 | `tech.energy.04.01` | 2 | 40 |
| `tech.energy.04.03` | 地熱利用：実験技術 | `tech.energy.04.02` | 2 | 43 |
| `tech.energy.04.04` | 地熱利用：実用化 | `tech.energy.04.03` | 2 | 46 |
| `tech.energy.04.05` | 地熱利用：高効率化 | `tech.energy.04.04` | 3 | 49 |
| `tech.energy.04.06` | 地熱利用：自動化 | `tech.energy.04.05` | 3 | 52 |
| `tech.energy.04.07` | 地熱利用：統合システム | `tech.energy.04.06` | 3 | 55 |
| `tech.energy.04.08` | 地熱利用：高度最適化 | `tech.energy.04.07` | 3 | 58 |
| `tech.energy.04.09` | 地熱利用：広域展開 | `tech.energy.04.08` | 4 | 61 |
| `tech.energy.04.10` | 地熱利用：次世代技術 | `tech.energy.04.09` | 4 | 64 |

#### 05 蓄電池

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.05.01` | 蓄電池：原理の発見 | `branch.energy` | 3 | 39 |
| `tech.energy.05.02` | 蓄電池：基礎設計 | `tech.energy.05.01` | 3 | 42 |
| `tech.energy.05.03` | 蓄電池：実験技術 | `tech.energy.05.02` | 3 | 45 |
| `tech.energy.05.04` | 蓄電池：実用化 | `tech.energy.05.03` | 3 | 48 |
| `tech.energy.05.05` | 蓄電池：高効率化 | `tech.energy.05.04` | 4 | 51 |
| `tech.energy.05.06` | 蓄電池：自動化 | `tech.energy.05.05` | 4 | 54 |
| `tech.energy.05.07` | 蓄電池：統合システム | `tech.energy.05.06` | 4 | 57 |
| `tech.energy.05.08` | 蓄電池：高度最適化 | `tech.energy.05.07` | 4 | 60 |
| `tech.energy.05.09` | 蓄電池：広域展開 | `tech.energy.05.08` | 5 | 63 |
| `tech.energy.05.10` | 蓄電池：次世代技術 | `tech.energy.05.09` | 5 | 66 |

#### 06 送電網

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.06.01` | 送電網：原理の発見 | `branch.energy` | 3 | 41 |
| `tech.energy.06.02` | 送電網：基礎設計 | `tech.energy.06.01` | 3 | 44 |
| `tech.energy.06.03` | 送電網：実験技術 | `tech.energy.06.02` | 3 | 47 |
| `tech.energy.06.04` | 送電網：実用化 | `tech.energy.06.03` | 3 | 50 |
| `tech.energy.06.05` | 送電網：高効率化 | `tech.energy.06.04` | 4 | 53 |
| `tech.energy.06.06` | 送電網：自動化 | `tech.energy.06.05` | 4 | 56 |
| `tech.energy.06.07` | 送電網：統合システム | `tech.energy.06.06` | 4 | 59 |
| `tech.energy.06.08` | 送電網：高度最適化 | `tech.energy.06.07` | 4 | 62 |
| `tech.energy.06.09` | 送電網：広域展開 | `tech.energy.06.08` | 5 | 65 |
| `tech.energy.06.10` | 送電網：次世代技術 | `tech.energy.06.09` | 5 | 68 |

#### 07 熱利用

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.07.01` | 熱利用：原理の発見 | `branch.energy` | 3 | 43 |
| `tech.energy.07.02` | 熱利用：基礎設計 | `tech.energy.07.01` | 3 | 46 |
| `tech.energy.07.03` | 熱利用：実験技術 | `tech.energy.07.02` | 3 | 49 |
| `tech.energy.07.04` | 熱利用：実用化 | `tech.energy.07.03` | 3 | 52 |
| `tech.energy.07.05` | 熱利用：高効率化 | `tech.energy.07.04` | 4 | 55 |
| `tech.energy.07.06` | 熱利用：自動化 | `tech.energy.07.05` | 4 | 58 |
| `tech.energy.07.07` | 熱利用：統合システム | `tech.energy.07.06` | 4 | 61 |
| `tech.energy.07.08` | 熱利用：高度最適化 | `tech.energy.07.07` | 4 | 64 |
| `tech.energy.07.09` | 熱利用：広域展開 | `tech.energy.07.08` | 5 | 67 |
| `tech.energy.07.10` | 熱利用：次世代技術 | `tech.energy.07.09` | 5 | 70 |

#### 08 水素エネルギー

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.08.01` | 水素エネルギー：原理の発見 | `branch.energy` | 3 | 45 |
| `tech.energy.08.02` | 水素エネルギー：基礎設計 | `tech.energy.08.01` | 3 | 48 |
| `tech.energy.08.03` | 水素エネルギー：実験技術 | `tech.energy.08.02` | 3 | 51 |
| `tech.energy.08.04` | 水素エネルギー：実用化 | `tech.energy.08.03` | 3 | 54 |
| `tech.energy.08.05` | 水素エネルギー：高効率化 | `tech.energy.08.04` | 4 | 57 |
| `tech.energy.08.06` | 水素エネルギー：自動化 | `tech.energy.08.05` | 4 | 60 |
| `tech.energy.08.07` | 水素エネルギー：統合システム | `tech.energy.08.06` | 4 | 63 |
| `tech.energy.08.08` | 水素エネルギー：高度最適化 | `tech.energy.08.07` | 4 | 66 |
| `tech.energy.08.09` | 水素エネルギー：広域展開 | `tech.energy.08.08` | 5 | 69 |
| `tech.energy.08.10` | 水素エネルギー：次世代技術 | `tech.energy.08.09` | 5 | 72 |

#### 09 核融合研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.09.01` | 核融合研究：原理の発見 | `branch.energy` | 4 | 47 |
| `tech.energy.09.02` | 核融合研究：基礎設計 | `tech.energy.09.01` | 4 | 50 |
| `tech.energy.09.03` | 核融合研究：実験技術 | `tech.energy.09.02` | 4 | 53 |
| `tech.energy.09.04` | 核融合研究：実用化 | `tech.energy.09.03` | 4 | 56 |
| `tech.energy.09.05` | 核融合研究：高効率化 | `tech.energy.09.04` | 5 | 59 |
| `tech.energy.09.06` | 核融合研究：自動化 | `tech.energy.09.05` | 5 | 62 |
| `tech.energy.09.07` | 核融合研究：統合システム | `tech.energy.09.06` | 5 | 65 |
| `tech.energy.09.08` | 核融合研究：高度最適化 | `tech.energy.09.07` | 5 | 68 |
| `tech.energy.09.09` | 核融合研究：広域展開 | `tech.energy.09.08` | 5 | 71 |
| `tech.energy.09.10` | 核融合研究：次世代技術 | `tech.energy.09.09` | 5 | 74 |

#### 10 地域エネルギー網

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.energy.10.01` | 地域エネルギー網：原理の発見 | `branch.energy` | 4 | 49 |
| `tech.energy.10.02` | 地域エネルギー網：基礎設計 | `tech.energy.10.01` | 4 | 52 |
| `tech.energy.10.03` | 地域エネルギー網：実験技術 | `tech.energy.10.02` | 4 | 55 |
| `tech.energy.10.04` | 地域エネルギー網：実用化 | `tech.energy.10.03` | 4 | 58 |
| `tech.energy.10.05` | 地域エネルギー網：高効率化 | `tech.energy.10.04` | 5 | 61 |
| `tech.energy.10.06` | 地域エネルギー網：自動化 | `tech.energy.10.05` | 5 | 64 |
| `tech.energy.10.07` | 地域エネルギー網：統合システム | `tech.energy.10.06` | 5 | 67 |
| `tech.energy.10.08` | 地域エネルギー網：高度最適化 | `tech.energy.10.07` | 5 | 70 |
| `tech.energy.10.09` | 地域エネルギー網：広域展開 | `tech.energy.10.08` | 5 | 73 |
| `tech.energy.10.10` | 地域エネルギー網：次世代技術 | `tech.energy.10.09` | 5 | 76 |

### 交通・物流(`transport-logistics`)

#### 01 道路交通

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.01.01` | 道路交通：原理の発見 | `branch.transport-logistics` | 2 | 33 |
| `tech.transport-logistics.01.02` | 道路交通：基礎設計 | `tech.transport-logistics.01.01` | 2 | 36 |
| `tech.transport-logistics.01.03` | 道路交通：実験技術 | `tech.transport-logistics.01.02` | 2 | 39 |
| `tech.transport-logistics.01.04` | 道路交通：実用化 | `tech.transport-logistics.01.03` | 2 | 42 |
| `tech.transport-logistics.01.05` | 道路交通：高効率化 | `tech.transport-logistics.01.04` | 3 | 45 |
| `tech.transport-logistics.01.06` | 道路交通：自動化 | `tech.transport-logistics.01.05` | 3 | 48 |
| `tech.transport-logistics.01.07` | 道路交通：統合システム | `tech.transport-logistics.01.06` | 3 | 51 |
| `tech.transport-logistics.01.08` | 道路交通：高度最適化 | `tech.transport-logistics.01.07` | 3 | 54 |
| `tech.transport-logistics.01.09` | 道路交通：広域展開 | `tech.transport-logistics.01.08` | 4 | 57 |
| `tech.transport-logistics.01.10` | 道路交通：次世代技術 | `tech.transport-logistics.01.09` | 4 | 60 |

#### 02 鉄道網

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.02.01` | 鉄道網：原理の発見 | `branch.transport-logistics` | 2 | 35 |
| `tech.transport-logistics.02.02` | 鉄道網：基礎設計 | `tech.transport-logistics.02.01` | 2 | 38 |
| `tech.transport-logistics.02.03` | 鉄道網：実験技術 | `tech.transport-logistics.02.02` | 2 | 41 |
| `tech.transport-logistics.02.04` | 鉄道網：実用化 | `tech.transport-logistics.02.03` | 2 | 44 |
| `tech.transport-logistics.02.05` | 鉄道網：高効率化 | `tech.transport-logistics.02.04` | 3 | 47 |
| `tech.transport-logistics.02.06` | 鉄道網：自動化 | `tech.transport-logistics.02.05` | 3 | 50 |
| `tech.transport-logistics.02.07` | 鉄道網：統合システム | `tech.transport-logistics.02.06` | 3 | 53 |
| `tech.transport-logistics.02.08` | 鉄道網：高度最適化 | `tech.transport-logistics.02.07` | 3 | 56 |
| `tech.transport-logistics.02.09` | 鉄道網：広域展開 | `tech.transport-logistics.02.08` | 4 | 59 |
| `tech.transport-logistics.02.10` | 鉄道網：次世代技術 | `tech.transport-logistics.02.09` | 4 | 62 |

#### 03 公共交通

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.03.01` | 公共交通：原理の発見 | `branch.transport-logistics` | 2 | 37 |
| `tech.transport-logistics.03.02` | 公共交通：基礎設計 | `tech.transport-logistics.03.01` | 2 | 40 |
| `tech.transport-logistics.03.03` | 公共交通：実験技術 | `tech.transport-logistics.03.02` | 2 | 43 |
| `tech.transport-logistics.03.04` | 公共交通：実用化 | `tech.transport-logistics.03.03` | 2 | 46 |
| `tech.transport-logistics.03.05` | 公共交通：高効率化 | `tech.transport-logistics.03.04` | 3 | 49 |
| `tech.transport-logistics.03.06` | 公共交通：自動化 | `tech.transport-logistics.03.05` | 3 | 52 |
| `tech.transport-logistics.03.07` | 公共交通：統合システム | `tech.transport-logistics.03.06` | 3 | 55 |
| `tech.transport-logistics.03.08` | 公共交通：高度最適化 | `tech.transport-logistics.03.07` | 3 | 58 |
| `tech.transport-logistics.03.09` | 公共交通：広域展開 | `tech.transport-logistics.03.08` | 4 | 61 |
| `tech.transport-logistics.03.10` | 公共交通：次世代技術 | `tech.transport-logistics.03.09` | 4 | 64 |

#### 04 貨物輸送

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.04.01` | 貨物輸送：原理の発見 | `branch.transport-logistics` | 2 | 39 |
| `tech.transport-logistics.04.02` | 貨物輸送：基礎設計 | `tech.transport-logistics.04.01` | 2 | 42 |
| `tech.transport-logistics.04.03` | 貨物輸送：実験技術 | `tech.transport-logistics.04.02` | 2 | 45 |
| `tech.transport-logistics.04.04` | 貨物輸送：実用化 | `tech.transport-logistics.04.03` | 2 | 48 |
| `tech.transport-logistics.04.05` | 貨物輸送：高効率化 | `tech.transport-logistics.04.04` | 3 | 51 |
| `tech.transport-logistics.04.06` | 貨物輸送：自動化 | `tech.transport-logistics.04.05` | 3 | 54 |
| `tech.transport-logistics.04.07` | 貨物輸送：統合システム | `tech.transport-logistics.04.06` | 3 | 57 |
| `tech.transport-logistics.04.08` | 貨物輸送：高度最適化 | `tech.transport-logistics.04.07` | 3 | 60 |
| `tech.transport-logistics.04.09` | 貨物輸送：広域展開 | `tech.transport-logistics.04.08` | 4 | 63 |
| `tech.transport-logistics.04.10` | 貨物輸送：次世代技術 | `tech.transport-logistics.04.09` | 4 | 66 |

#### 05 港湾物流

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.05.01` | 港湾物流：原理の発見 | `branch.transport-logistics` | 3 | 41 |
| `tech.transport-logistics.05.02` | 港湾物流：基礎設計 | `tech.transport-logistics.05.01` | 3 | 44 |
| `tech.transport-logistics.05.03` | 港湾物流：実験技術 | `tech.transport-logistics.05.02` | 3 | 47 |
| `tech.transport-logistics.05.04` | 港湾物流：実用化 | `tech.transport-logistics.05.03` | 3 | 50 |
| `tech.transport-logistics.05.05` | 港湾物流：高効率化 | `tech.transport-logistics.05.04` | 4 | 53 |
| `tech.transport-logistics.05.06` | 港湾物流：自動化 | `tech.transport-logistics.05.05` | 4 | 56 |
| `tech.transport-logistics.05.07` | 港湾物流：統合システム | `tech.transport-logistics.05.06` | 4 | 59 |
| `tech.transport-logistics.05.08` | 港湾物流：高度最適化 | `tech.transport-logistics.05.07` | 4 | 62 |
| `tech.transport-logistics.05.09` | 港湾物流：広域展開 | `tech.transport-logistics.05.08` | 5 | 65 |
| `tech.transport-logistics.05.10` | 港湾物流：次世代技術 | `tech.transport-logistics.05.09` | 5 | 68 |

#### 06 航空輸送

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.06.01` | 航空輸送：原理の発見 | `branch.transport-logistics` | 3 | 43 |
| `tech.transport-logistics.06.02` | 航空輸送：基礎設計 | `tech.transport-logistics.06.01` | 3 | 46 |
| `tech.transport-logistics.06.03` | 航空輸送：実験技術 | `tech.transport-logistics.06.02` | 3 | 49 |
| `tech.transport-logistics.06.04` | 航空輸送：実用化 | `tech.transport-logistics.06.03` | 3 | 52 |
| `tech.transport-logistics.06.05` | 航空輸送：高効率化 | `tech.transport-logistics.06.04` | 4 | 55 |
| `tech.transport-logistics.06.06` | 航空輸送：自動化 | `tech.transport-logistics.06.05` | 4 | 58 |
| `tech.transport-logistics.06.07` | 航空輸送：統合システム | `tech.transport-logistics.06.06` | 4 | 61 |
| `tech.transport-logistics.06.08` | 航空輸送：高度最適化 | `tech.transport-logistics.06.07` | 4 | 64 |
| `tech.transport-logistics.06.09` | 航空輸送：広域展開 | `tech.transport-logistics.06.08` | 5 | 67 |
| `tech.transport-logistics.06.10` | 航空輸送：次世代技術 | `tech.transport-logistics.06.09` | 5 | 70 |

#### 07 自動運転

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.07.01` | 自動運転：原理の発見 | `branch.transport-logistics` | 3 | 45 |
| `tech.transport-logistics.07.02` | 自動運転：基礎設計 | `tech.transport-logistics.07.01` | 3 | 48 |
| `tech.transport-logistics.07.03` | 自動運転：実験技術 | `tech.transport-logistics.07.02` | 3 | 51 |
| `tech.transport-logistics.07.04` | 自動運転：実用化 | `tech.transport-logistics.07.03` | 3 | 54 |
| `tech.transport-logistics.07.05` | 自動運転：高効率化 | `tech.transport-logistics.07.04` | 4 | 57 |
| `tech.transport-logistics.07.06` | 自動運転：自動化 | `tech.transport-logistics.07.05` | 4 | 60 |
| `tech.transport-logistics.07.07` | 自動運転：統合システム | `tech.transport-logistics.07.06` | 4 | 63 |
| `tech.transport-logistics.07.08` | 自動運転：高度最適化 | `tech.transport-logistics.07.07` | 4 | 66 |
| `tech.transport-logistics.07.09` | 自動運転：広域展開 | `tech.transport-logistics.07.08` | 5 | 69 |
| `tech.transport-logistics.07.10` | 自動運転：次世代技術 | `tech.transport-logistics.07.09` | 5 | 72 |

#### 08 交通管制

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.08.01` | 交通管制：原理の発見 | `branch.transport-logistics` | 3 | 47 |
| `tech.transport-logistics.08.02` | 交通管制：基礎設計 | `tech.transport-logistics.08.01` | 3 | 50 |
| `tech.transport-logistics.08.03` | 交通管制：実験技術 | `tech.transport-logistics.08.02` | 3 | 53 |
| `tech.transport-logistics.08.04` | 交通管制：実用化 | `tech.transport-logistics.08.03` | 3 | 56 |
| `tech.transport-logistics.08.05` | 交通管制：高効率化 | `tech.transport-logistics.08.04` | 4 | 59 |
| `tech.transport-logistics.08.06` | 交通管制：自動化 | `tech.transport-logistics.08.05` | 4 | 62 |
| `tech.transport-logistics.08.07` | 交通管制：統合システム | `tech.transport-logistics.08.06` | 4 | 65 |
| `tech.transport-logistics.08.08` | 交通管制：高度最適化 | `tech.transport-logistics.08.07` | 4 | 68 |
| `tech.transport-logistics.08.09` | 交通管制：広域展開 | `tech.transport-logistics.08.08` | 5 | 71 |
| `tech.transport-logistics.08.10` | 交通管制：次世代技術 | `tech.transport-logistics.08.09` | 5 | 74 |

#### 09 物流ロボット

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.09.01` | 物流ロボット：原理の発見 | `branch.transport-logistics` | 4 | 49 |
| `tech.transport-logistics.09.02` | 物流ロボット：基礎設計 | `tech.transport-logistics.09.01` | 4 | 52 |
| `tech.transport-logistics.09.03` | 物流ロボット：実験技術 | `tech.transport-logistics.09.02` | 4 | 55 |
| `tech.transport-logistics.09.04` | 物流ロボット：実用化 | `tech.transport-logistics.09.03` | 4 | 58 |
| `tech.transport-logistics.09.05` | 物流ロボット：高効率化 | `tech.transport-logistics.09.04` | 5 | 61 |
| `tech.transport-logistics.09.06` | 物流ロボット：自動化 | `tech.transport-logistics.09.05` | 5 | 64 |
| `tech.transport-logistics.09.07` | 物流ロボット：統合システム | `tech.transport-logistics.09.06` | 5 | 67 |
| `tech.transport-logistics.09.08` | 物流ロボット：高度最適化 | `tech.transport-logistics.09.07` | 5 | 70 |
| `tech.transport-logistics.09.09` | 物流ロボット：広域展開 | `tech.transport-logistics.09.08` | 5 | 73 |
| `tech.transport-logistics.09.10` | 物流ロボット：次世代技術 | `tech.transport-logistics.09.09` | 5 | 76 |

#### 10 惑星規模輸送

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.transport-logistics.10.01` | 惑星規模輸送：原理の発見 | `branch.transport-logistics` | 4 | 51 |
| `tech.transport-logistics.10.02` | 惑星規模輸送：基礎設計 | `tech.transport-logistics.10.01` | 4 | 54 |
| `tech.transport-logistics.10.03` | 惑星規模輸送：実験技術 | `tech.transport-logistics.10.02` | 4 | 57 |
| `tech.transport-logistics.10.04` | 惑星規模輸送：実用化 | `tech.transport-logistics.10.03` | 4 | 60 |
| `tech.transport-logistics.10.05` | 惑星規模輸送：高効率化 | `tech.transport-logistics.10.04` | 5 | 63 |
| `tech.transport-logistics.10.06` | 惑星規模輸送：自動化 | `tech.transport-logistics.10.05` | 5 | 66 |
| `tech.transport-logistics.10.07` | 惑星規模輸送：統合システム | `tech.transport-logistics.10.06` | 5 | 69 |
| `tech.transport-logistics.10.08` | 惑星規模輸送：高度最適化 | `tech.transport-logistics.10.07` | 5 | 72 |
| `tech.transport-logistics.10.09` | 惑星規模輸送：広域展開 | `tech.transport-logistics.10.08` | 5 | 75 |
| `tech.transport-logistics.10.10` | 惑星規模輸送：次世代技術 | `tech.transport-logistics.10.09` | 5 | 78 |

### 通信・情報(`communication-information`)

#### 01 有線通信

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.01.01` | 有線通信：原理の発見 | `branch.communication-information` | 3 | 35 |
| `tech.communication-information.01.02` | 有線通信：基礎設計 | `tech.communication-information.01.01` | 3 | 38 |
| `tech.communication-information.01.03` | 有線通信：実験技術 | `tech.communication-information.01.02` | 3 | 41 |
| `tech.communication-information.01.04` | 有線通信：実用化 | `tech.communication-information.01.03` | 3 | 44 |
| `tech.communication-information.01.05` | 有線通信：高効率化 | `tech.communication-information.01.04` | 4 | 47 |
| `tech.communication-information.01.06` | 有線通信：自動化 | `tech.communication-information.01.05` | 4 | 50 |
| `tech.communication-information.01.07` | 有線通信：統合システム | `tech.communication-information.01.06` | 4 | 53 |
| `tech.communication-information.01.08` | 有線通信：高度最適化 | `tech.communication-information.01.07` | 4 | 56 |
| `tech.communication-information.01.09` | 有線通信：広域展開 | `tech.communication-information.01.08` | 5 | 59 |
| `tech.communication-information.01.10` | 有線通信：次世代技術 | `tech.communication-information.01.09` | 5 | 62 |

#### 02 無線通信

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.02.01` | 無線通信：原理の発見 | `branch.communication-information` | 3 | 37 |
| `tech.communication-information.02.02` | 無線通信：基礎設計 | `tech.communication-information.02.01` | 3 | 40 |
| `tech.communication-information.02.03` | 無線通信：実験技術 | `tech.communication-information.02.02` | 3 | 43 |
| `tech.communication-information.02.04` | 無線通信：実用化 | `tech.communication-information.02.03` | 3 | 46 |
| `tech.communication-information.02.05` | 無線通信：高効率化 | `tech.communication-information.02.04` | 4 | 49 |
| `tech.communication-information.02.06` | 無線通信：自動化 | `tech.communication-information.02.05` | 4 | 52 |
| `tech.communication-information.02.07` | 無線通信：統合システム | `tech.communication-information.02.06` | 4 | 55 |
| `tech.communication-information.02.08` | 無線通信：高度最適化 | `tech.communication-information.02.07` | 4 | 58 |
| `tech.communication-information.02.09` | 無線通信：広域展開 | `tech.communication-information.02.08` | 5 | 61 |
| `tech.communication-information.02.10` | 無線通信：次世代技術 | `tech.communication-information.02.09` | 5 | 64 |

#### 03 光通信

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.03.01` | 光通信：原理の発見 | `branch.communication-information` | 3 | 39 |
| `tech.communication-information.03.02` | 光通信：基礎設計 | `tech.communication-information.03.01` | 3 | 42 |
| `tech.communication-information.03.03` | 光通信：実験技術 | `tech.communication-information.03.02` | 3 | 45 |
| `tech.communication-information.03.04` | 光通信：実用化 | `tech.communication-information.03.03` | 3 | 48 |
| `tech.communication-information.03.05` | 光通信：高効率化 | `tech.communication-information.03.04` | 4 | 51 |
| `tech.communication-information.03.06` | 光通信：自動化 | `tech.communication-information.03.05` | 4 | 54 |
| `tech.communication-information.03.07` | 光通信：統合システム | `tech.communication-information.03.06` | 4 | 57 |
| `tech.communication-information.03.08` | 光通信：高度最適化 | `tech.communication-information.03.07` | 4 | 60 |
| `tech.communication-information.03.09` | 光通信：広域展開 | `tech.communication-information.03.08` | 5 | 63 |
| `tech.communication-information.03.10` | 光通信：次世代技術 | `tech.communication-information.03.09` | 5 | 66 |

#### 04 衛星通信

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.04.01` | 衛星通信：原理の発見 | `branch.communication-information` | 3 | 41 |
| `tech.communication-information.04.02` | 衛星通信：基礎設計 | `tech.communication-information.04.01` | 3 | 44 |
| `tech.communication-information.04.03` | 衛星通信：実験技術 | `tech.communication-information.04.02` | 3 | 47 |
| `tech.communication-information.04.04` | 衛星通信：実用化 | `tech.communication-information.04.03` | 3 | 50 |
| `tech.communication-information.04.05` | 衛星通信：高効率化 | `tech.communication-information.04.04` | 4 | 53 |
| `tech.communication-information.04.06` | 衛星通信：自動化 | `tech.communication-information.04.05` | 4 | 56 |
| `tech.communication-information.04.07` | 衛星通信：統合システム | `tech.communication-information.04.06` | 4 | 59 |
| `tech.communication-information.04.08` | 衛星通信：高度最適化 | `tech.communication-information.04.07` | 4 | 62 |
| `tech.communication-information.04.09` | 衛星通信：広域展開 | `tech.communication-information.04.08` | 5 | 65 |
| `tech.communication-information.04.10` | 衛星通信：次世代技術 | `tech.communication-information.04.09` | 5 | 68 |

#### 05 データセンター

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.05.01` | データセンター：原理の発見 | `branch.communication-information` | 4 | 43 |
| `tech.communication-information.05.02` | データセンター：基礎設計 | `tech.communication-information.05.01` | 4 | 46 |
| `tech.communication-information.05.03` | データセンター：実験技術 | `tech.communication-information.05.02` | 4 | 49 |
| `tech.communication-information.05.04` | データセンター：実用化 | `tech.communication-information.05.03` | 4 | 52 |
| `tech.communication-information.05.05` | データセンター：高効率化 | `tech.communication-information.05.04` | 5 | 55 |
| `tech.communication-information.05.06` | データセンター：自動化 | `tech.communication-information.05.05` | 5 | 58 |
| `tech.communication-information.05.07` | データセンター：統合システム | `tech.communication-information.05.06` | 5 | 61 |
| `tech.communication-information.05.08` | データセンター：高度最適化 | `tech.communication-information.05.07` | 5 | 64 |
| `tech.communication-information.05.09` | データセンター：広域展開 | `tech.communication-information.05.08` | 5 | 67 |
| `tech.communication-information.05.10` | データセンター：次世代技術 | `tech.communication-information.05.09` | 5 | 70 |

#### 06 分散ネットワーク

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.06.01` | 分散ネットワーク：原理の発見 | `branch.communication-information` | 4 | 45 |
| `tech.communication-information.06.02` | 分散ネットワーク：基礎設計 | `tech.communication-information.06.01` | 4 | 48 |
| `tech.communication-information.06.03` | 分散ネットワーク：実験技術 | `tech.communication-information.06.02` | 4 | 51 |
| `tech.communication-information.06.04` | 分散ネットワーク：実用化 | `tech.communication-information.06.03` | 4 | 54 |
| `tech.communication-information.06.05` | 分散ネットワーク：高効率化 | `tech.communication-information.06.04` | 5 | 57 |
| `tech.communication-information.06.06` | 分散ネットワーク：自動化 | `tech.communication-information.06.05` | 5 | 60 |
| `tech.communication-information.06.07` | 分散ネットワーク：統合システム | `tech.communication-information.06.06` | 5 | 63 |
| `tech.communication-information.06.08` | 分散ネットワーク：高度最適化 | `tech.communication-information.06.07` | 5 | 66 |
| `tech.communication-information.06.09` | 分散ネットワーク：広域展開 | `tech.communication-information.06.08` | 5 | 69 |
| `tech.communication-information.06.10` | 分散ネットワーク：次世代技術 | `tech.communication-information.06.09` | 5 | 72 |

#### 07 情報検索

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.07.01` | 情報検索：原理の発見 | `branch.communication-information` | 4 | 47 |
| `tech.communication-information.07.02` | 情報検索：基礎設計 | `tech.communication-information.07.01` | 4 | 50 |
| `tech.communication-information.07.03` | 情報検索：実験技術 | `tech.communication-information.07.02` | 4 | 53 |
| `tech.communication-information.07.04` | 情報検索：実用化 | `tech.communication-information.07.03` | 4 | 56 |
| `tech.communication-information.07.05` | 情報検索：高効率化 | `tech.communication-information.07.04` | 5 | 59 |
| `tech.communication-information.07.06` | 情報検索：自動化 | `tech.communication-information.07.05` | 5 | 62 |
| `tech.communication-information.07.07` | 情報検索：統合システム | `tech.communication-information.07.06` | 5 | 65 |
| `tech.communication-information.07.08` | 情報検索：高度最適化 | `tech.communication-information.07.07` | 5 | 68 |
| `tech.communication-information.07.09` | 情報検索：広域展開 | `tech.communication-information.07.08` | 5 | 71 |
| `tech.communication-information.07.10` | 情報検索：次世代技術 | `tech.communication-information.07.09` | 5 | 74 |

#### 08 デジタルID

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.08.01` | デジタルID：原理の発見 | `branch.communication-information` | 4 | 49 |
| `tech.communication-information.08.02` | デジタルID：基礎設計 | `tech.communication-information.08.01` | 4 | 52 |
| `tech.communication-information.08.03` | デジタルID：実験技術 | `tech.communication-information.08.02` | 4 | 55 |
| `tech.communication-information.08.04` | デジタルID：実用化 | `tech.communication-information.08.03` | 4 | 58 |
| `tech.communication-information.08.05` | デジタルID：高効率化 | `tech.communication-information.08.04` | 5 | 61 |
| `tech.communication-information.08.06` | デジタルID：自動化 | `tech.communication-information.08.05` | 5 | 64 |
| `tech.communication-information.08.07` | デジタルID：統合システム | `tech.communication-information.08.06` | 5 | 67 |
| `tech.communication-information.08.08` | デジタルID：高度最適化 | `tech.communication-information.08.07` | 5 | 70 |
| `tech.communication-information.08.09` | デジタルID：広域展開 | `tech.communication-information.08.08` | 5 | 73 |
| `tech.communication-information.08.10` | デジタルID：次世代技術 | `tech.communication-information.08.09` | 5 | 76 |

#### 09 サイバー保全

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.09.01` | サイバー保全：原理の発見 | `branch.communication-information` | 5 | 51 |
| `tech.communication-information.09.02` | サイバー保全：基礎設計 | `tech.communication-information.09.01` | 5 | 54 |
| `tech.communication-information.09.03` | サイバー保全：実験技術 | `tech.communication-information.09.02` | 5 | 57 |
| `tech.communication-information.09.04` | サイバー保全：実用化 | `tech.communication-information.09.03` | 5 | 60 |
| `tech.communication-information.09.05` | サイバー保全：高効率化 | `tech.communication-information.09.04` | 5 | 63 |
| `tech.communication-information.09.06` | サイバー保全：自動化 | `tech.communication-information.09.05` | 5 | 66 |
| `tech.communication-information.09.07` | サイバー保全：統合システム | `tech.communication-information.09.06` | 5 | 69 |
| `tech.communication-information.09.08` | サイバー保全：高度最適化 | `tech.communication-information.09.07` | 5 | 72 |
| `tech.communication-information.09.09` | サイバー保全：広域展開 | `tech.communication-information.09.08` | 5 | 75 |
| `tech.communication-information.09.10` | サイバー保全：次世代技術 | `tech.communication-information.09.09` | 5 | 78 |

#### 10 惑星情報網

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.communication-information.10.01` | 惑星情報網：原理の発見 | `branch.communication-information` | 5 | 53 |
| `tech.communication-information.10.02` | 惑星情報網：基礎設計 | `tech.communication-information.10.01` | 5 | 56 |
| `tech.communication-information.10.03` | 惑星情報網：実験技術 | `tech.communication-information.10.02` | 5 | 59 |
| `tech.communication-information.10.04` | 惑星情報網：実用化 | `tech.communication-information.10.03` | 5 | 62 |
| `tech.communication-information.10.05` | 惑星情報網：高効率化 | `tech.communication-information.10.04` | 5 | 65 |
| `tech.communication-information.10.06` | 惑星情報網：自動化 | `tech.communication-information.10.05` | 5 | 68 |
| `tech.communication-information.10.07` | 惑星情報網：統合システム | `tech.communication-information.10.06` | 5 | 71 |
| `tech.communication-information.10.08` | 惑星情報網：高度最適化 | `tech.communication-information.10.07` | 5 | 74 |
| `tech.communication-information.10.09` | 惑星情報網：広域展開 | `tech.communication-information.10.08` | 5 | 77 |
| `tech.communication-information.10.10` | 惑星情報網：次世代技術 | `tech.communication-information.10.09` | 5 | 80 |

### 医療・生命科学(`medicine-life-science`)

#### 01 公衆衛生

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.01.01` | 公衆衛生：原理の発見 | `branch.medicine-life-science` | 3 | 37 |
| `tech.medicine-life-science.01.02` | 公衆衛生：基礎設計 | `tech.medicine-life-science.01.01` | 3 | 40 |
| `tech.medicine-life-science.01.03` | 公衆衛生：実験技術 | `tech.medicine-life-science.01.02` | 3 | 43 |
| `tech.medicine-life-science.01.04` | 公衆衛生：実用化 | `tech.medicine-life-science.01.03` | 3 | 46 |
| `tech.medicine-life-science.01.05` | 公衆衛生：高効率化 | `tech.medicine-life-science.01.04` | 4 | 49 |
| `tech.medicine-life-science.01.06` | 公衆衛生：自動化 | `tech.medicine-life-science.01.05` | 4 | 52 |
| `tech.medicine-life-science.01.07` | 公衆衛生：統合システム | `tech.medicine-life-science.01.06` | 4 | 55 |
| `tech.medicine-life-science.01.08` | 公衆衛生：高度最適化 | `tech.medicine-life-science.01.07` | 4 | 58 |
| `tech.medicine-life-science.01.09` | 公衆衛生：広域展開 | `tech.medicine-life-science.01.08` | 5 | 61 |
| `tech.medicine-life-science.01.10` | 公衆衛生：次世代技術 | `tech.medicine-life-science.01.09` | 5 | 64 |

#### 02 診断技術

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.02.01` | 診断技術：原理の発見 | `branch.medicine-life-science` | 3 | 39 |
| `tech.medicine-life-science.02.02` | 診断技術：基礎設計 | `tech.medicine-life-science.02.01` | 3 | 42 |
| `tech.medicine-life-science.02.03` | 診断技術：実験技術 | `tech.medicine-life-science.02.02` | 3 | 45 |
| `tech.medicine-life-science.02.04` | 診断技術：実用化 | `tech.medicine-life-science.02.03` | 3 | 48 |
| `tech.medicine-life-science.02.05` | 診断技術：高効率化 | `tech.medicine-life-science.02.04` | 4 | 51 |
| `tech.medicine-life-science.02.06` | 診断技術：自動化 | `tech.medicine-life-science.02.05` | 4 | 54 |
| `tech.medicine-life-science.02.07` | 診断技術：統合システム | `tech.medicine-life-science.02.06` | 4 | 57 |
| `tech.medicine-life-science.02.08` | 診断技術：高度最適化 | `tech.medicine-life-science.02.07` | 4 | 60 |
| `tech.medicine-life-science.02.09` | 診断技術：広域展開 | `tech.medicine-life-science.02.08` | 5 | 63 |
| `tech.medicine-life-science.02.10` | 診断技術：次世代技術 | `tech.medicine-life-science.02.09` | 5 | 66 |

#### 03 医療機器

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.03.01` | 医療機器：原理の発見 | `branch.medicine-life-science` | 3 | 41 |
| `tech.medicine-life-science.03.02` | 医療機器：基礎設計 | `tech.medicine-life-science.03.01` | 3 | 44 |
| `tech.medicine-life-science.03.03` | 医療機器：実験技術 | `tech.medicine-life-science.03.02` | 3 | 47 |
| `tech.medicine-life-science.03.04` | 医療機器：実用化 | `tech.medicine-life-science.03.03` | 3 | 50 |
| `tech.medicine-life-science.03.05` | 医療機器：高効率化 | `tech.medicine-life-science.03.04` | 4 | 53 |
| `tech.medicine-life-science.03.06` | 医療機器：自動化 | `tech.medicine-life-science.03.05` | 4 | 56 |
| `tech.medicine-life-science.03.07` | 医療機器：統合システム | `tech.medicine-life-science.03.06` | 4 | 59 |
| `tech.medicine-life-science.03.08` | 医療機器：高度最適化 | `tech.medicine-life-science.03.07` | 4 | 62 |
| `tech.medicine-life-science.03.09` | 医療機器：広域展開 | `tech.medicine-life-science.03.08` | 5 | 65 |
| `tech.medicine-life-science.03.10` | 医療機器：次世代技術 | `tech.medicine-life-science.03.09` | 5 | 68 |

#### 04 創薬研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.04.01` | 創薬研究：原理の発見 | `branch.medicine-life-science` | 3 | 43 |
| `tech.medicine-life-science.04.02` | 創薬研究：基礎設計 | `tech.medicine-life-science.04.01` | 3 | 46 |
| `tech.medicine-life-science.04.03` | 創薬研究：実験技術 | `tech.medicine-life-science.04.02` | 3 | 49 |
| `tech.medicine-life-science.04.04` | 創薬研究：実用化 | `tech.medicine-life-science.04.03` | 3 | 52 |
| `tech.medicine-life-science.04.05` | 創薬研究：高効率化 | `tech.medicine-life-science.04.04` | 4 | 55 |
| `tech.medicine-life-science.04.06` | 創薬研究：自動化 | `tech.medicine-life-science.04.05` | 4 | 58 |
| `tech.medicine-life-science.04.07` | 創薬研究：統合システム | `tech.medicine-life-science.04.06` | 4 | 61 |
| `tech.medicine-life-science.04.08` | 創薬研究：高度最適化 | `tech.medicine-life-science.04.07` | 4 | 64 |
| `tech.medicine-life-science.04.09` | 創薬研究：広域展開 | `tech.medicine-life-science.04.08` | 5 | 67 |
| `tech.medicine-life-science.04.10` | 創薬研究：次世代技術 | `tech.medicine-life-science.04.09` | 5 | 70 |

#### 05 再生医療

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.05.01` | 再生医療：原理の発見 | `branch.medicine-life-science` | 4 | 45 |
| `tech.medicine-life-science.05.02` | 再生医療：基礎設計 | `tech.medicine-life-science.05.01` | 4 | 48 |
| `tech.medicine-life-science.05.03` | 再生医療：実験技術 | `tech.medicine-life-science.05.02` | 4 | 51 |
| `tech.medicine-life-science.05.04` | 再生医療：実用化 | `tech.medicine-life-science.05.03` | 4 | 54 |
| `tech.medicine-life-science.05.05` | 再生医療：高効率化 | `tech.medicine-life-science.05.04` | 5 | 57 |
| `tech.medicine-life-science.05.06` | 再生医療：自動化 | `tech.medicine-life-science.05.05` | 5 | 60 |
| `tech.medicine-life-science.05.07` | 再生医療：統合システム | `tech.medicine-life-science.05.06` | 5 | 63 |
| `tech.medicine-life-science.05.08` | 再生医療：高度最適化 | `tech.medicine-life-science.05.07` | 5 | 66 |
| `tech.medicine-life-science.05.09` | 再生医療：広域展開 | `tech.medicine-life-science.05.08` | 5 | 69 |
| `tech.medicine-life-science.05.10` | 再生医療：次世代技術 | `tech.medicine-life-science.05.09` | 5 | 72 |

#### 06 遺伝学

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.06.01` | 遺伝学：原理の発見 | `branch.medicine-life-science` | 4 | 47 |
| `tech.medicine-life-science.06.02` | 遺伝学：基礎設計 | `tech.medicine-life-science.06.01` | 4 | 50 |
| `tech.medicine-life-science.06.03` | 遺伝学：実験技術 | `tech.medicine-life-science.06.02` | 4 | 53 |
| `tech.medicine-life-science.06.04` | 遺伝学：実用化 | `tech.medicine-life-science.06.03` | 4 | 56 |
| `tech.medicine-life-science.06.05` | 遺伝学：高効率化 | `tech.medicine-life-science.06.04` | 5 | 59 |
| `tech.medicine-life-science.06.06` | 遺伝学：自動化 | `tech.medicine-life-science.06.05` | 5 | 62 |
| `tech.medicine-life-science.06.07` | 遺伝学：統合システム | `tech.medicine-life-science.06.06` | 5 | 65 |
| `tech.medicine-life-science.06.08` | 遺伝学：高度最適化 | `tech.medicine-life-science.06.07` | 5 | 68 |
| `tech.medicine-life-science.06.09` | 遺伝学：広域展開 | `tech.medicine-life-science.06.08` | 5 | 71 |
| `tech.medicine-life-science.06.10` | 遺伝学：次世代技術 | `tech.medicine-life-science.06.09` | 5 | 74 |

#### 07 微生物研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.07.01` | 微生物研究：原理の発見 | `branch.medicine-life-science` | 4 | 49 |
| `tech.medicine-life-science.07.02` | 微生物研究：基礎設計 | `tech.medicine-life-science.07.01` | 4 | 52 |
| `tech.medicine-life-science.07.03` | 微生物研究：実験技術 | `tech.medicine-life-science.07.02` | 4 | 55 |
| `tech.medicine-life-science.07.04` | 微生物研究：実用化 | `tech.medicine-life-science.07.03` | 4 | 58 |
| `tech.medicine-life-science.07.05` | 微生物研究：高効率化 | `tech.medicine-life-science.07.04` | 5 | 61 |
| `tech.medicine-life-science.07.06` | 微生物研究：自動化 | `tech.medicine-life-science.07.05` | 5 | 64 |
| `tech.medicine-life-science.07.07` | 微生物研究：統合システム | `tech.medicine-life-science.07.06` | 5 | 67 |
| `tech.medicine-life-science.07.08` | 微生物研究：高度最適化 | `tech.medicine-life-science.07.07` | 5 | 70 |
| `tech.medicine-life-science.07.09` | 微生物研究：広域展開 | `tech.medicine-life-science.07.08` | 5 | 73 |
| `tech.medicine-life-science.07.10` | 微生物研究：次世代技術 | `tech.medicine-life-science.07.09` | 5 | 76 |

#### 08 医療データ

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.08.01` | 医療データ：原理の発見 | `branch.medicine-life-science` | 4 | 51 |
| `tech.medicine-life-science.08.02` | 医療データ：基礎設計 | `tech.medicine-life-science.08.01` | 4 | 54 |
| `tech.medicine-life-science.08.03` | 医療データ：実験技術 | `tech.medicine-life-science.08.02` | 4 | 57 |
| `tech.medicine-life-science.08.04` | 医療データ：実用化 | `tech.medicine-life-science.08.03` | 4 | 60 |
| `tech.medicine-life-science.08.05` | 医療データ：高効率化 | `tech.medicine-life-science.08.04` | 5 | 63 |
| `tech.medicine-life-science.08.06` | 医療データ：自動化 | `tech.medicine-life-science.08.05` | 5 | 66 |
| `tech.medicine-life-science.08.07` | 医療データ：統合システム | `tech.medicine-life-science.08.06` | 5 | 69 |
| `tech.medicine-life-science.08.08` | 医療データ：高度最適化 | `tech.medicine-life-science.08.07` | 5 | 72 |
| `tech.medicine-life-science.08.09` | 医療データ：広域展開 | `tech.medicine-life-science.08.08` | 5 | 75 |
| `tech.medicine-life-science.08.10` | 医療データ：次世代技術 | `tech.medicine-life-science.08.09` | 5 | 78 |

#### 09 遠隔医療

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.09.01` | 遠隔医療：原理の発見 | `branch.medicine-life-science` | 5 | 53 |
| `tech.medicine-life-science.09.02` | 遠隔医療：基礎設計 | `tech.medicine-life-science.09.01` | 5 | 56 |
| `tech.medicine-life-science.09.03` | 遠隔医療：実験技術 | `tech.medicine-life-science.09.02` | 5 | 59 |
| `tech.medicine-life-science.09.04` | 遠隔医療：実用化 | `tech.medicine-life-science.09.03` | 5 | 62 |
| `tech.medicine-life-science.09.05` | 遠隔医療：高効率化 | `tech.medicine-life-science.09.04` | 5 | 65 |
| `tech.medicine-life-science.09.06` | 遠隔医療：自動化 | `tech.medicine-life-science.09.05` | 5 | 68 |
| `tech.medicine-life-science.09.07` | 遠隔医療：統合システム | `tech.medicine-life-science.09.06` | 5 | 71 |
| `tech.medicine-life-science.09.08` | 遠隔医療：高度最適化 | `tech.medicine-life-science.09.07` | 5 | 74 |
| `tech.medicine-life-science.09.09` | 遠隔医療：広域展開 | `tech.medicine-life-science.09.08` | 5 | 77 |
| `tech.medicine-life-science.09.10` | 遠隔医療：次世代技術 | `tech.medicine-life-science.09.09` | 5 | 80 |

#### 10 予防医療システム

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.medicine-life-science.10.01` | 予防医療システム：原理の発見 | `branch.medicine-life-science` | 5 | 55 |
| `tech.medicine-life-science.10.02` | 予防医療システム：基礎設計 | `tech.medicine-life-science.10.01` | 5 | 58 |
| `tech.medicine-life-science.10.03` | 予防医療システム：実験技術 | `tech.medicine-life-science.10.02` | 5 | 61 |
| `tech.medicine-life-science.10.04` | 予防医療システム：実用化 | `tech.medicine-life-science.10.03` | 5 | 64 |
| `tech.medicine-life-science.10.05` | 予防医療システム：高効率化 | `tech.medicine-life-science.10.04` | 5 | 67 |
| `tech.medicine-life-science.10.06` | 予防医療システム：自動化 | `tech.medicine-life-science.10.05` | 5 | 70 |
| `tech.medicine-life-science.10.07` | 予防医療システム：統合システム | `tech.medicine-life-science.10.06` | 5 | 73 |
| `tech.medicine-life-science.10.08` | 予防医療システム：高度最適化 | `tech.medicine-life-science.10.07` | 5 | 76 |
| `tech.medicine-life-science.10.09` | 予防医療システム：広域展開 | `tech.medicine-life-science.10.08` | 5 | 79 |
| `tech.medicine-life-science.10.10` | 予防医療システム：次世代技術 | `tech.medicine-life-science.10.09` | 5 | 82 |

### 教育・科学(`education-science`)

#### 01 基礎教育

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.01.01` | 基礎教育：原理の発見 | `branch.education-science` | 3 | 39 |
| `tech.education-science.01.02` | 基礎教育：基礎設計 | `tech.education-science.01.01` | 3 | 42 |
| `tech.education-science.01.03` | 基礎教育：実験技術 | `tech.education-science.01.02` | 3 | 45 |
| `tech.education-science.01.04` | 基礎教育：実用化 | `tech.education-science.01.03` | 3 | 48 |
| `tech.education-science.01.05` | 基礎教育：高効率化 | `tech.education-science.01.04` | 4 | 51 |
| `tech.education-science.01.06` | 基礎教育：自動化 | `tech.education-science.01.05` | 4 | 54 |
| `tech.education-science.01.07` | 基礎教育：統合システム | `tech.education-science.01.06` | 4 | 57 |
| `tech.education-science.01.08` | 基礎教育：高度最適化 | `tech.education-science.01.07` | 4 | 60 |
| `tech.education-science.01.09` | 基礎教育：広域展開 | `tech.education-science.01.08` | 5 | 63 |
| `tech.education-science.01.10` | 基礎教育：次世代技術 | `tech.education-science.01.09` | 5 | 66 |

#### 02 個別最適学習

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.02.01` | 個別最適学習：原理の発見 | `branch.education-science` | 3 | 41 |
| `tech.education-science.02.02` | 個別最適学習：基礎設計 | `tech.education-science.02.01` | 3 | 44 |
| `tech.education-science.02.03` | 個別最適学習：実験技術 | `tech.education-science.02.02` | 3 | 47 |
| `tech.education-science.02.04` | 個別最適学習：実用化 | `tech.education-science.02.03` | 3 | 50 |
| `tech.education-science.02.05` | 個別最適学習：高効率化 | `tech.education-science.02.04` | 4 | 53 |
| `tech.education-science.02.06` | 個別最適学習：自動化 | `tech.education-science.02.05` | 4 | 56 |
| `tech.education-science.02.07` | 個別最適学習：統合システム | `tech.education-science.02.06` | 4 | 59 |
| `tech.education-science.02.08` | 個別最適学習：高度最適化 | `tech.education-science.02.07` | 4 | 62 |
| `tech.education-science.02.09` | 個別最適学習：広域展開 | `tech.education-science.02.08` | 5 | 65 |
| `tech.education-science.02.10` | 個別最適学習：次世代技術 | `tech.education-science.02.09` | 5 | 68 |

#### 03 科学実験

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.03.01` | 科学実験：原理の発見 | `branch.education-science` | 3 | 43 |
| `tech.education-science.03.02` | 科学実験：基礎設計 | `tech.education-science.03.01` | 3 | 46 |
| `tech.education-science.03.03` | 科学実験：実験技術 | `tech.education-science.03.02` | 3 | 49 |
| `tech.education-science.03.04` | 科学実験：実用化 | `tech.education-science.03.03` | 3 | 52 |
| `tech.education-science.03.05` | 科学実験：高効率化 | `tech.education-science.03.04` | 4 | 55 |
| `tech.education-science.03.06` | 科学実験：自動化 | `tech.education-science.03.05` | 4 | 58 |
| `tech.education-science.03.07` | 科学実験：統合システム | `tech.education-science.03.06` | 4 | 61 |
| `tech.education-science.03.08` | 科学実験：高度最適化 | `tech.education-science.03.07` | 4 | 64 |
| `tech.education-science.03.09` | 科学実験：広域展開 | `tech.education-science.03.08` | 5 | 67 |
| `tech.education-science.03.10` | 科学実験：次世代技術 | `tech.education-science.03.09` | 5 | 70 |

#### 04 数学研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.04.01` | 数学研究：原理の発見 | `branch.education-science` | 3 | 45 |
| `tech.education-science.04.02` | 数学研究：基礎設計 | `tech.education-science.04.01` | 3 | 48 |
| `tech.education-science.04.03` | 数学研究：実験技術 | `tech.education-science.04.02` | 3 | 51 |
| `tech.education-science.04.04` | 数学研究：実用化 | `tech.education-science.04.03` | 3 | 54 |
| `tech.education-science.04.05` | 数学研究：高効率化 | `tech.education-science.04.04` | 4 | 57 |
| `tech.education-science.04.06` | 数学研究：自動化 | `tech.education-science.04.05` | 4 | 60 |
| `tech.education-science.04.07` | 数学研究：統合システム | `tech.education-science.04.06` | 4 | 63 |
| `tech.education-science.04.08` | 数学研究：高度最適化 | `tech.education-science.04.07` | 4 | 66 |
| `tech.education-science.04.09` | 数学研究：広域展開 | `tech.education-science.04.08` | 5 | 69 |
| `tech.education-science.04.10` | 数学研究：次世代技術 | `tech.education-science.04.09` | 5 | 72 |

#### 05 物理研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.05.01` | 物理研究：原理の発見 | `branch.education-science` | 4 | 47 |
| `tech.education-science.05.02` | 物理研究：基礎設計 | `tech.education-science.05.01` | 4 | 50 |
| `tech.education-science.05.03` | 物理研究：実験技術 | `tech.education-science.05.02` | 4 | 53 |
| `tech.education-science.05.04` | 物理研究：実用化 | `tech.education-science.05.03` | 4 | 56 |
| `tech.education-science.05.05` | 物理研究：高効率化 | `tech.education-science.05.04` | 5 | 59 |
| `tech.education-science.05.06` | 物理研究：自動化 | `tech.education-science.05.05` | 5 | 62 |
| `tech.education-science.05.07` | 物理研究：統合システム | `tech.education-science.05.06` | 5 | 65 |
| `tech.education-science.05.08` | 物理研究：高度最適化 | `tech.education-science.05.07` | 5 | 68 |
| `tech.education-science.05.09` | 物理研究：広域展開 | `tech.education-science.05.08` | 5 | 71 |
| `tech.education-science.05.10` | 物理研究：次世代技術 | `tech.education-science.05.09` | 5 | 74 |

#### 06 化学研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.06.01` | 化学研究：原理の発見 | `branch.education-science` | 4 | 49 |
| `tech.education-science.06.02` | 化学研究：基礎設計 | `tech.education-science.06.01` | 4 | 52 |
| `tech.education-science.06.03` | 化学研究：実験技術 | `tech.education-science.06.02` | 4 | 55 |
| `tech.education-science.06.04` | 化学研究：実用化 | `tech.education-science.06.03` | 4 | 58 |
| `tech.education-science.06.05` | 化学研究：高効率化 | `tech.education-science.06.04` | 5 | 61 |
| `tech.education-science.06.06` | 化学研究：自動化 | `tech.education-science.06.05` | 5 | 64 |
| `tech.education-science.06.07` | 化学研究：統合システム | `tech.education-science.06.06` | 5 | 67 |
| `tech.education-science.06.08` | 化学研究：高度最適化 | `tech.education-science.06.07` | 5 | 70 |
| `tech.education-science.06.09` | 化学研究：広域展開 | `tech.education-science.06.08` | 5 | 73 |
| `tech.education-science.06.10` | 化学研究：次世代技術 | `tech.education-science.06.09` | 5 | 76 |

#### 07 生物研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.07.01` | 生物研究：原理の発見 | `branch.education-science` | 4 | 51 |
| `tech.education-science.07.02` | 生物研究：基礎設計 | `tech.education-science.07.01` | 4 | 54 |
| `tech.education-science.07.03` | 生物研究：実験技術 | `tech.education-science.07.02` | 4 | 57 |
| `tech.education-science.07.04` | 生物研究：実用化 | `tech.education-science.07.03` | 4 | 60 |
| `tech.education-science.07.05` | 生物研究：高効率化 | `tech.education-science.07.04` | 5 | 63 |
| `tech.education-science.07.06` | 生物研究：自動化 | `tech.education-science.07.05` | 5 | 66 |
| `tech.education-science.07.07` | 生物研究：統合システム | `tech.education-science.07.06` | 5 | 69 |
| `tech.education-science.07.08` | 生物研究：高度最適化 | `tech.education-science.07.07` | 5 | 72 |
| `tech.education-science.07.09` | 生物研究：広域展開 | `tech.education-science.07.08` | 5 | 75 |
| `tech.education-science.07.10` | 生物研究：次世代技術 | `tech.education-science.07.09` | 5 | 78 |

#### 08 研究図書館

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.08.01` | 研究図書館：原理の発見 | `branch.education-science` | 4 | 53 |
| `tech.education-science.08.02` | 研究図書館：基礎設計 | `tech.education-science.08.01` | 4 | 56 |
| `tech.education-science.08.03` | 研究図書館：実験技術 | `tech.education-science.08.02` | 4 | 59 |
| `tech.education-science.08.04` | 研究図書館：実用化 | `tech.education-science.08.03` | 4 | 62 |
| `tech.education-science.08.05` | 研究図書館：高効率化 | `tech.education-science.08.04` | 5 | 65 |
| `tech.education-science.08.06` | 研究図書館：自動化 | `tech.education-science.08.05` | 5 | 68 |
| `tech.education-science.08.07` | 研究図書館：統合システム | `tech.education-science.08.06` | 5 | 71 |
| `tech.education-science.08.08` | 研究図書館：高度最適化 | `tech.education-science.08.07` | 5 | 74 |
| `tech.education-science.08.09` | 研究図書館：広域展開 | `tech.education-science.08.08` | 5 | 77 |
| `tech.education-science.08.10` | 研究図書館：次世代技術 | `tech.education-science.08.09` | 5 | 80 |

#### 09 学術交流

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.09.01` | 学術交流：原理の発見 | `branch.education-science` | 5 | 55 |
| `tech.education-science.09.02` | 学術交流：基礎設計 | `tech.education-science.09.01` | 5 | 58 |
| `tech.education-science.09.03` | 学術交流：実験技術 | `tech.education-science.09.02` | 5 | 61 |
| `tech.education-science.09.04` | 学術交流：実用化 | `tech.education-science.09.03` | 5 | 64 |
| `tech.education-science.09.05` | 学術交流：高効率化 | `tech.education-science.09.04` | 5 | 67 |
| `tech.education-science.09.06` | 学術交流：自動化 | `tech.education-science.09.05` | 5 | 70 |
| `tech.education-science.09.07` | 学術交流：統合システム | `tech.education-science.09.06` | 5 | 73 |
| `tech.education-science.09.08` | 学術交流：高度最適化 | `tech.education-science.09.07` | 5 | 76 |
| `tech.education-science.09.09` | 学術交流：広域展開 | `tech.education-science.09.08` | 5 | 79 |
| `tech.education-science.09.10` | 学術交流：次世代技術 | `tech.education-science.09.09` | 5 | 82 |

#### 10 オープンサイエンス

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.education-science.10.01` | オープンサイエンス：原理の発見 | `branch.education-science` | 5 | 57 |
| `tech.education-science.10.02` | オープンサイエンス：基礎設計 | `tech.education-science.10.01` | 5 | 60 |
| `tech.education-science.10.03` | オープンサイエンス：実験技術 | `tech.education-science.10.02` | 5 | 63 |
| `tech.education-science.10.04` | オープンサイエンス：実用化 | `tech.education-science.10.03` | 5 | 66 |
| `tech.education-science.10.05` | オープンサイエンス：高効率化 | `tech.education-science.10.04` | 5 | 69 |
| `tech.education-science.10.06` | オープンサイエンス：自動化 | `tech.education-science.10.05` | 5 | 72 |
| `tech.education-science.10.07` | オープンサイエンス：統合システム | `tech.education-science.10.06` | 5 | 75 |
| `tech.education-science.10.08` | オープンサイエンス：高度最適化 | `tech.education-science.10.07` | 5 | 78 |
| `tech.education-science.10.09` | オープンサイエンス：広域展開 | `tech.education-science.10.08` | 5 | 81 |
| `tech.education-science.10.10` | オープンサイエンス：次世代技術 | `tech.education-science.10.09` | 5 | 84 |

### 環境・気候(`environment-climate`)

#### 01 森林再生

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.01.01` | 森林再生：原理の発見 | `branch.environment-climate` | 4 | 41 |
| `tech.environment-climate.01.02` | 森林再生：基礎設計 | `tech.environment-climate.01.01` | 4 | 44 |
| `tech.environment-climate.01.03` | 森林再生：実験技術 | `tech.environment-climate.01.02` | 4 | 47 |
| `tech.environment-climate.01.04` | 森林再生：実用化 | `tech.environment-climate.01.03` | 4 | 50 |
| `tech.environment-climate.01.05` | 森林再生：高効率化 | `tech.environment-climate.01.04` | 5 | 53 |
| `tech.environment-climate.01.06` | 森林再生：自動化 | `tech.environment-climate.01.05` | 5 | 56 |
| `tech.environment-climate.01.07` | 森林再生：統合システム | `tech.environment-climate.01.06` | 5 | 59 |
| `tech.environment-climate.01.08` | 森林再生：高度最適化 | `tech.environment-climate.01.07` | 5 | 62 |
| `tech.environment-climate.01.09` | 森林再生：広域展開 | `tech.environment-climate.01.08` | 5 | 65 |
| `tech.environment-climate.01.10` | 森林再生：次世代技術 | `tech.environment-climate.01.09` | 5 | 68 |

#### 02 生物多様性

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.02.01` | 生物多様性：原理の発見 | `branch.environment-climate` | 4 | 43 |
| `tech.environment-climate.02.02` | 生物多様性：基礎設計 | `tech.environment-climate.02.01` | 4 | 46 |
| `tech.environment-climate.02.03` | 生物多様性：実験技術 | `tech.environment-climate.02.02` | 4 | 49 |
| `tech.environment-climate.02.04` | 生物多様性：実用化 | `tech.environment-climate.02.03` | 4 | 52 |
| `tech.environment-climate.02.05` | 生物多様性：高効率化 | `tech.environment-climate.02.04` | 5 | 55 |
| `tech.environment-climate.02.06` | 生物多様性：自動化 | `tech.environment-climate.02.05` | 5 | 58 |
| `tech.environment-climate.02.07` | 生物多様性：統合システム | `tech.environment-climate.02.06` | 5 | 61 |
| `tech.environment-climate.02.08` | 生物多様性：高度最適化 | `tech.environment-climate.02.07` | 5 | 64 |
| `tech.environment-climate.02.09` | 生物多様性：広域展開 | `tech.environment-climate.02.08` | 5 | 67 |
| `tech.environment-climate.02.10` | 生物多様性：次世代技術 | `tech.environment-climate.02.09` | 5 | 70 |

#### 03 土壌回復

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.03.01` | 土壌回復：原理の発見 | `branch.environment-climate` | 4 | 45 |
| `tech.environment-climate.03.02` | 土壌回復：基礎設計 | `tech.environment-climate.03.01` | 4 | 48 |
| `tech.environment-climate.03.03` | 土壌回復：実験技術 | `tech.environment-climate.03.02` | 4 | 51 |
| `tech.environment-climate.03.04` | 土壌回復：実用化 | `tech.environment-climate.03.03` | 4 | 54 |
| `tech.environment-climate.03.05` | 土壌回復：高効率化 | `tech.environment-climate.03.04` | 5 | 57 |
| `tech.environment-climate.03.06` | 土壌回復：自動化 | `tech.environment-climate.03.05` | 5 | 60 |
| `tech.environment-climate.03.07` | 土壌回復：統合システム | `tech.environment-climate.03.06` | 5 | 63 |
| `tech.environment-climate.03.08` | 土壌回復：高度最適化 | `tech.environment-climate.03.07` | 5 | 66 |
| `tech.environment-climate.03.09` | 土壌回復：広域展開 | `tech.environment-climate.03.08` | 5 | 69 |
| `tech.environment-climate.03.10` | 土壌回復：次世代技術 | `tech.environment-climate.03.09` | 5 | 72 |

#### 04 大気観測

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.04.01` | 大気観測：原理の発見 | `branch.environment-climate` | 4 | 47 |
| `tech.environment-climate.04.02` | 大気観測：基礎設計 | `tech.environment-climate.04.01` | 4 | 50 |
| `tech.environment-climate.04.03` | 大気観測：実験技術 | `tech.environment-climate.04.02` | 4 | 53 |
| `tech.environment-climate.04.04` | 大気観測：実用化 | `tech.environment-climate.04.03` | 4 | 56 |
| `tech.environment-climate.04.05` | 大気観測：高効率化 | `tech.environment-climate.04.04` | 5 | 59 |
| `tech.environment-climate.04.06` | 大気観測：自動化 | `tech.environment-climate.04.05` | 5 | 62 |
| `tech.environment-climate.04.07` | 大気観測：統合システム | `tech.environment-climate.04.06` | 5 | 65 |
| `tech.environment-climate.04.08` | 大気観測：高度最適化 | `tech.environment-climate.04.07` | 5 | 68 |
| `tech.environment-climate.04.09` | 大気観測：広域展開 | `tech.environment-climate.04.08` | 5 | 71 |
| `tech.environment-climate.04.10` | 大気観測：次世代技術 | `tech.environment-climate.04.09` | 5 | 74 |

#### 05 気候モデル

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.05.01` | 気候モデル：原理の発見 | `branch.environment-climate` | 5 | 49 |
| `tech.environment-climate.05.02` | 気候モデル：基礎設計 | `tech.environment-climate.05.01` | 5 | 52 |
| `tech.environment-climate.05.03` | 気候モデル：実験技術 | `tech.environment-climate.05.02` | 5 | 55 |
| `tech.environment-climate.05.04` | 気候モデル：実用化 | `tech.environment-climate.05.03` | 5 | 58 |
| `tech.environment-climate.05.05` | 気候モデル：高効率化 | `tech.environment-climate.05.04` | 5 | 61 |
| `tech.environment-climate.05.06` | 気候モデル：自動化 | `tech.environment-climate.05.05` | 5 | 64 |
| `tech.environment-climate.05.07` | 気候モデル：統合システム | `tech.environment-climate.05.06` | 5 | 67 |
| `tech.environment-climate.05.08` | 気候モデル：高度最適化 | `tech.environment-climate.05.07` | 5 | 70 |
| `tech.environment-climate.05.09` | 気候モデル：広域展開 | `tech.environment-climate.05.08` | 5 | 73 |
| `tech.environment-climate.05.10` | 気候モデル：次世代技術 | `tech.environment-climate.05.09` | 5 | 76 |

#### 06 廃棄物削減

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.06.01` | 廃棄物削減：原理の発見 | `branch.environment-climate` | 5 | 51 |
| `tech.environment-climate.06.02` | 廃棄物削減：基礎設計 | `tech.environment-climate.06.01` | 5 | 54 |
| `tech.environment-climate.06.03` | 廃棄物削減：実験技術 | `tech.environment-climate.06.02` | 5 | 57 |
| `tech.environment-climate.06.04` | 廃棄物削減：実用化 | `tech.environment-climate.06.03` | 5 | 60 |
| `tech.environment-climate.06.05` | 廃棄物削減：高効率化 | `tech.environment-climate.06.04` | 5 | 63 |
| `tech.environment-climate.06.06` | 廃棄物削減：自動化 | `tech.environment-climate.06.05` | 5 | 66 |
| `tech.environment-climate.06.07` | 廃棄物削減：統合システム | `tech.environment-climate.06.06` | 5 | 69 |
| `tech.environment-climate.06.08` | 廃棄物削減：高度最適化 | `tech.environment-climate.06.07` | 5 | 72 |
| `tech.environment-climate.06.09` | 廃棄物削減：広域展開 | `tech.environment-climate.06.08` | 5 | 75 |
| `tech.environment-climate.06.10` | 廃棄物削減：次世代技術 | `tech.environment-climate.06.09` | 5 | 78 |

#### 07 海洋保全

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.07.01` | 海洋保全：原理の発見 | `branch.environment-climate` | 5 | 53 |
| `tech.environment-climate.07.02` | 海洋保全：基礎設計 | `tech.environment-climate.07.01` | 5 | 56 |
| `tech.environment-climate.07.03` | 海洋保全：実験技術 | `tech.environment-climate.07.02` | 5 | 59 |
| `tech.environment-climate.07.04` | 海洋保全：実用化 | `tech.environment-climate.07.03` | 5 | 62 |
| `tech.environment-climate.07.05` | 海洋保全：高効率化 | `tech.environment-climate.07.04` | 5 | 65 |
| `tech.environment-climate.07.06` | 海洋保全：自動化 | `tech.environment-climate.07.05` | 5 | 68 |
| `tech.environment-climate.07.07` | 海洋保全：統合システム | `tech.environment-climate.07.06` | 5 | 71 |
| `tech.environment-climate.07.08` | 海洋保全：高度最適化 | `tech.environment-climate.07.07` | 5 | 74 |
| `tech.environment-climate.07.09` | 海洋保全：広域展開 | `tech.environment-climate.07.08` | 5 | 77 |
| `tech.environment-climate.07.10` | 海洋保全：次世代技術 | `tech.environment-climate.07.09` | 5 | 80 |

#### 08 環境センサー

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.08.01` | 環境センサー：原理の発見 | `branch.environment-climate` | 5 | 55 |
| `tech.environment-climate.08.02` | 環境センサー：基礎設計 | `tech.environment-climate.08.01` | 5 | 58 |
| `tech.environment-climate.08.03` | 環境センサー：実験技術 | `tech.environment-climate.08.02` | 5 | 61 |
| `tech.environment-climate.08.04` | 環境センサー：実用化 | `tech.environment-climate.08.03` | 5 | 64 |
| `tech.environment-climate.08.05` | 環境センサー：高効率化 | `tech.environment-climate.08.04` | 5 | 67 |
| `tech.environment-climate.08.06` | 環境センサー：自動化 | `tech.environment-climate.08.05` | 5 | 70 |
| `tech.environment-climate.08.07` | 環境センサー：統合システム | `tech.environment-climate.08.06` | 5 | 73 |
| `tech.environment-climate.08.08` | 環境センサー：高度最適化 | `tech.environment-climate.08.07` | 5 | 76 |
| `tech.environment-climate.08.09` | 環境センサー：広域展開 | `tech.environment-climate.08.08` | 5 | 79 |
| `tech.environment-climate.08.10` | 環境センサー：次世代技術 | `tech.environment-climate.08.09` | 5 | 82 |

#### 09 循環経済

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.09.01` | 循環経済：原理の発見 | `branch.environment-climate` | 5 | 57 |
| `tech.environment-climate.09.02` | 循環経済：基礎設計 | `tech.environment-climate.09.01` | 5 | 60 |
| `tech.environment-climate.09.03` | 循環経済：実験技術 | `tech.environment-climate.09.02` | 5 | 63 |
| `tech.environment-climate.09.04` | 循環経済：実用化 | `tech.environment-climate.09.03` | 5 | 66 |
| `tech.environment-climate.09.05` | 循環経済：高効率化 | `tech.environment-climate.09.04` | 5 | 69 |
| `tech.environment-climate.09.06` | 循環経済：自動化 | `tech.environment-climate.09.05` | 5 | 72 |
| `tech.environment-climate.09.07` | 循環経済：統合システム | `tech.environment-climate.09.06` | 5 | 75 |
| `tech.environment-climate.09.08` | 循環経済：高度最適化 | `tech.environment-climate.09.07` | 5 | 78 |
| `tech.environment-climate.09.09` | 循環経済：広域展開 | `tech.environment-climate.09.08` | 5 | 81 |
| `tech.environment-climate.09.10` | 循環経済：次世代技術 | `tech.environment-climate.09.09` | 5 | 84 |

#### 10 惑星環境管理

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.environment-climate.10.01` | 惑星環境管理：原理の発見 | `branch.environment-climate` | 5 | 59 |
| `tech.environment-climate.10.02` | 惑星環境管理：基礎設計 | `tech.environment-climate.10.01` | 5 | 62 |
| `tech.environment-climate.10.03` | 惑星環境管理：実験技術 | `tech.environment-climate.10.02` | 5 | 65 |
| `tech.environment-climate.10.04` | 惑星環境管理：実用化 | `tech.environment-climate.10.03` | 5 | 68 |
| `tech.environment-climate.10.05` | 惑星環境管理：高効率化 | `tech.environment-climate.10.04` | 5 | 71 |
| `tech.environment-climate.10.06` | 惑星環境管理：自動化 | `tech.environment-climate.10.05` | 5 | 74 |
| `tech.environment-climate.10.07` | 惑星環境管理：統合システム | `tech.environment-climate.10.06` | 5 | 77 |
| `tech.environment-climate.10.08` | 惑星環境管理：高度最適化 | `tech.environment-climate.10.07` | 5 | 80 |
| `tech.environment-climate.10.09` | 惑星環境管理：広域展開 | `tech.environment-climate.10.08` | 5 | 83 |
| `tech.environment-climate.10.10` | 惑星環境管理：次世代技術 | `tech.environment-climate.10.09` | 5 | 86 |

### 計算・自動化(`computation-automation`)

#### 01 計算機設計

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.01.01` | 計算機設計：原理の発見 | `branch.computation-automation` | 4 | 43 |
| `tech.computation-automation.01.02` | 計算機設計：基礎設計 | `tech.computation-automation.01.01` | 4 | 46 |
| `tech.computation-automation.01.03` | 計算機設計：実験技術 | `tech.computation-automation.01.02` | 4 | 49 |
| `tech.computation-automation.01.04` | 計算機設計：実用化 | `tech.computation-automation.01.03` | 4 | 52 |
| `tech.computation-automation.01.05` | 計算機設計：高効率化 | `tech.computation-automation.01.04` | 5 | 55 |
| `tech.computation-automation.01.06` | 計算機設計：自動化 | `tech.computation-automation.01.05` | 5 | 58 |
| `tech.computation-automation.01.07` | 計算機設計：統合システム | `tech.computation-automation.01.06` | 5 | 61 |
| `tech.computation-automation.01.08` | 計算機設計：高度最適化 | `tech.computation-automation.01.07` | 5 | 64 |
| `tech.computation-automation.01.09` | 計算機設計：広域展開 | `tech.computation-automation.01.08` | 5 | 67 |
| `tech.computation-automation.01.10` | 計算機設計：次世代技術 | `tech.computation-automation.01.09` | 5 | 70 |

#### 02 ソフトウェア工学

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.02.01` | ソフトウェア工学：原理の発見 | `branch.computation-automation` | 4 | 45 |
| `tech.computation-automation.02.02` | ソフトウェア工学：基礎設計 | `tech.computation-automation.02.01` | 4 | 48 |
| `tech.computation-automation.02.03` | ソフトウェア工学：実験技術 | `tech.computation-automation.02.02` | 4 | 51 |
| `tech.computation-automation.02.04` | ソフトウェア工学：実用化 | `tech.computation-automation.02.03` | 4 | 54 |
| `tech.computation-automation.02.05` | ソフトウェア工学：高効率化 | `tech.computation-automation.02.04` | 5 | 57 |
| `tech.computation-automation.02.06` | ソフトウェア工学：自動化 | `tech.computation-automation.02.05` | 5 | 60 |
| `tech.computation-automation.02.07` | ソフトウェア工学：統合システム | `tech.computation-automation.02.06` | 5 | 63 |
| `tech.computation-automation.02.08` | ソフトウェア工学：高度最適化 | `tech.computation-automation.02.07` | 5 | 66 |
| `tech.computation-automation.02.09` | ソフトウェア工学：広域展開 | `tech.computation-automation.02.08` | 5 | 69 |
| `tech.computation-automation.02.10` | ソフトウェア工学：次世代技術 | `tech.computation-automation.02.09` | 5 | 72 |

#### 03 データ解析

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.03.01` | データ解析：原理の発見 | `branch.computation-automation` | 4 | 47 |
| `tech.computation-automation.03.02` | データ解析：基礎設計 | `tech.computation-automation.03.01` | 4 | 50 |
| `tech.computation-automation.03.03` | データ解析：実験技術 | `tech.computation-automation.03.02` | 4 | 53 |
| `tech.computation-automation.03.04` | データ解析：実用化 | `tech.computation-automation.03.03` | 4 | 56 |
| `tech.computation-automation.03.05` | データ解析：高効率化 | `tech.computation-automation.03.04` | 5 | 59 |
| `tech.computation-automation.03.06` | データ解析：自動化 | `tech.computation-automation.03.05` | 5 | 62 |
| `tech.computation-automation.03.07` | データ解析：統合システム | `tech.computation-automation.03.06` | 5 | 65 |
| `tech.computation-automation.03.08` | データ解析：高度最適化 | `tech.computation-automation.03.07` | 5 | 68 |
| `tech.computation-automation.03.09` | データ解析：広域展開 | `tech.computation-automation.03.08` | 5 | 71 |
| `tech.computation-automation.03.10` | データ解析：次世代技術 | `tech.computation-automation.03.09` | 5 | 74 |

#### 04 機械学習

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.04.01` | 機械学習：原理の発見 | `branch.computation-automation` | 4 | 49 |
| `tech.computation-automation.04.02` | 機械学習：基礎設計 | `tech.computation-automation.04.01` | 4 | 52 |
| `tech.computation-automation.04.03` | 機械学習：実験技術 | `tech.computation-automation.04.02` | 4 | 55 |
| `tech.computation-automation.04.04` | 機械学習：実用化 | `tech.computation-automation.04.03` | 4 | 58 |
| `tech.computation-automation.04.05` | 機械学習：高効率化 | `tech.computation-automation.04.04` | 5 | 61 |
| `tech.computation-automation.04.06` | 機械学習：自動化 | `tech.computation-automation.04.05` | 5 | 64 |
| `tech.computation-automation.04.07` | 機械学習：統合システム | `tech.computation-automation.04.06` | 5 | 67 |
| `tech.computation-automation.04.08` | 機械学習：高度最適化 | `tech.computation-automation.04.07` | 5 | 70 |
| `tech.computation-automation.04.09` | 機械学習：広域展開 | `tech.computation-automation.04.08` | 5 | 73 |
| `tech.computation-automation.04.10` | 機械学習：次世代技術 | `tech.computation-automation.04.09` | 5 | 76 |

#### 05 ロボット工学

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.05.01` | ロボット工学：原理の発見 | `branch.computation-automation` | 5 | 51 |
| `tech.computation-automation.05.02` | ロボット工学：基礎設計 | `tech.computation-automation.05.01` | 5 | 54 |
| `tech.computation-automation.05.03` | ロボット工学：実験技術 | `tech.computation-automation.05.02` | 5 | 57 |
| `tech.computation-automation.05.04` | ロボット工学：実用化 | `tech.computation-automation.05.03` | 5 | 60 |
| `tech.computation-automation.05.05` | ロボット工学：高効率化 | `tech.computation-automation.05.04` | 5 | 63 |
| `tech.computation-automation.05.06` | ロボット工学：自動化 | `tech.computation-automation.05.05` | 5 | 66 |
| `tech.computation-automation.05.07` | ロボット工学：統合システム | `tech.computation-automation.05.06` | 5 | 69 |
| `tech.computation-automation.05.08` | ロボット工学：高度最適化 | `tech.computation-automation.05.07` | 5 | 72 |
| `tech.computation-automation.05.09` | ロボット工学：広域展開 | `tech.computation-automation.05.08` | 5 | 75 |
| `tech.computation-automation.05.10` | ロボット工学：次世代技術 | `tech.computation-automation.05.09` | 5 | 78 |

#### 06 制御システム

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.06.01` | 制御システム：原理の発見 | `branch.computation-automation` | 5 | 53 |
| `tech.computation-automation.06.02` | 制御システム：基礎設計 | `tech.computation-automation.06.01` | 5 | 56 |
| `tech.computation-automation.06.03` | 制御システム：実験技術 | `tech.computation-automation.06.02` | 5 | 59 |
| `tech.computation-automation.06.04` | 制御システム：実用化 | `tech.computation-automation.06.03` | 5 | 62 |
| `tech.computation-automation.06.05` | 制御システム：高効率化 | `tech.computation-automation.06.04` | 5 | 65 |
| `tech.computation-automation.06.06` | 制御システム：自動化 | `tech.computation-automation.06.05` | 5 | 68 |
| `tech.computation-automation.06.07` | 制御システム：統合システム | `tech.computation-automation.06.06` | 5 | 71 |
| `tech.computation-automation.06.08` | 制御システム：高度最適化 | `tech.computation-automation.06.07` | 5 | 74 |
| `tech.computation-automation.06.09` | 制御システム：広域展開 | `tech.computation-automation.06.08` | 5 | 77 |
| `tech.computation-automation.06.10` | 制御システム：次世代技術 | `tech.computation-automation.06.09` | 5 | 80 |

#### 07 シミュレーション

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.07.01` | シミュレーション：原理の発見 | `branch.computation-automation` | 5 | 55 |
| `tech.computation-automation.07.02` | シミュレーション：基礎設計 | `tech.computation-automation.07.01` | 5 | 58 |
| `tech.computation-automation.07.03` | シミュレーション：実験技術 | `tech.computation-automation.07.02` | 5 | 61 |
| `tech.computation-automation.07.04` | シミュレーション：実用化 | `tech.computation-automation.07.03` | 5 | 64 |
| `tech.computation-automation.07.05` | シミュレーション：高効率化 | `tech.computation-automation.07.04` | 5 | 67 |
| `tech.computation-automation.07.06` | シミュレーション：自動化 | `tech.computation-automation.07.05` | 5 | 70 |
| `tech.computation-automation.07.07` | シミュレーション：統合システム | `tech.computation-automation.07.06` | 5 | 73 |
| `tech.computation-automation.07.08` | シミュレーション：高度最適化 | `tech.computation-automation.07.07` | 5 | 76 |
| `tech.computation-automation.07.09` | シミュレーション：広域展開 | `tech.computation-automation.07.08` | 5 | 79 |
| `tech.computation-automation.07.10` | シミュレーション：次世代技術 | `tech.computation-automation.07.09` | 5 | 82 |

#### 08 自律システム

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.08.01` | 自律システム：原理の発見 | `branch.computation-automation` | 5 | 57 |
| `tech.computation-automation.08.02` | 自律システム：基礎設計 | `tech.computation-automation.08.01` | 5 | 60 |
| `tech.computation-automation.08.03` | 自律システム：実験技術 | `tech.computation-automation.08.02` | 5 | 63 |
| `tech.computation-automation.08.04` | 自律システム：実用化 | `tech.computation-automation.08.03` | 5 | 66 |
| `tech.computation-automation.08.05` | 自律システム：高効率化 | `tech.computation-automation.08.04` | 5 | 69 |
| `tech.computation-automation.08.06` | 自律システム：自動化 | `tech.computation-automation.08.05` | 5 | 72 |
| `tech.computation-automation.08.07` | 自律システム：統合システム | `tech.computation-automation.08.06` | 5 | 75 |
| `tech.computation-automation.08.08` | 自律システム：高度最適化 | `tech.computation-automation.08.07` | 5 | 78 |
| `tech.computation-automation.08.09` | 自律システム：広域展開 | `tech.computation-automation.08.08` | 5 | 81 |
| `tech.computation-automation.08.10` | 自律システム：次世代技術 | `tech.computation-automation.08.09` | 5 | 84 |

#### 09 量子計算研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.09.01` | 量子計算研究：原理の発見 | `branch.computation-automation` | 5 | 59 |
| `tech.computation-automation.09.02` | 量子計算研究：基礎設計 | `tech.computation-automation.09.01` | 5 | 62 |
| `tech.computation-automation.09.03` | 量子計算研究：実験技術 | `tech.computation-automation.09.02` | 5 | 65 |
| `tech.computation-automation.09.04` | 量子計算研究：実用化 | `tech.computation-automation.09.03` | 5 | 68 |
| `tech.computation-automation.09.05` | 量子計算研究：高効率化 | `tech.computation-automation.09.04` | 5 | 71 |
| `tech.computation-automation.09.06` | 量子計算研究：自動化 | `tech.computation-automation.09.05` | 5 | 74 |
| `tech.computation-automation.09.07` | 量子計算研究：統合システム | `tech.computation-automation.09.06` | 5 | 77 |
| `tech.computation-automation.09.08` | 量子計算研究：高度最適化 | `tech.computation-automation.09.07` | 5 | 80 |
| `tech.computation-automation.09.09` | 量子計算研究：広域展開 | `tech.computation-automation.09.08` | 5 | 83 |
| `tech.computation-automation.09.10` | 量子計算研究：次世代技術 | `tech.computation-automation.09.09` | 5 | 86 |

#### 10 統合運用AI

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.computation-automation.10.01` | 統合運用AI：原理の発見 | `branch.computation-automation` | 5 | 61 |
| `tech.computation-automation.10.02` | 統合運用AI：基礎設計 | `tech.computation-automation.10.01` | 5 | 64 |
| `tech.computation-automation.10.03` | 統合運用AI：実験技術 | `tech.computation-automation.10.02` | 5 | 67 |
| `tech.computation-automation.10.04` | 統合運用AI：実用化 | `tech.computation-automation.10.03` | 5 | 70 |
| `tech.computation-automation.10.05` | 統合運用AI：高効率化 | `tech.computation-automation.10.04` | 5 | 73 |
| `tech.computation-automation.10.06` | 統合運用AI：自動化 | `tech.computation-automation.10.05` | 5 | 76 |
| `tech.computation-automation.10.07` | 統合運用AI：統合システム | `tech.computation-automation.10.06` | 5 | 79 |
| `tech.computation-automation.10.08` | 統合運用AI：高度最適化 | `tech.computation-automation.10.07` | 5 | 82 |
| `tech.computation-automation.10.09` | 統合運用AI：広域展開 | `tech.computation-automation.10.08` | 5 | 85 |
| `tech.computation-automation.10.10` | 統合運用AI：次世代技術 | `tech.computation-automation.10.09` | 5 | 88 |

### 航空・宇宙(`aerospace`)

#### 01 航空力学

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.01.01` | 航空力学：原理の発見 | `branch.aerospace` | 4 | 45 |
| `tech.aerospace.01.02` | 航空力学：基礎設計 | `tech.aerospace.01.01` | 4 | 48 |
| `tech.aerospace.01.03` | 航空力学：実験技術 | `tech.aerospace.01.02` | 4 | 51 |
| `tech.aerospace.01.04` | 航空力学：実用化 | `tech.aerospace.01.03` | 4 | 54 |
| `tech.aerospace.01.05` | 航空力学：高効率化 | `tech.aerospace.01.04` | 5 | 57 |
| `tech.aerospace.01.06` | 航空力学：自動化 | `tech.aerospace.01.05` | 5 | 60 |
| `tech.aerospace.01.07` | 航空力学：統合システム | `tech.aerospace.01.06` | 5 | 63 |
| `tech.aerospace.01.08` | 航空力学：高度最適化 | `tech.aerospace.01.07` | 5 | 66 |
| `tech.aerospace.01.09` | 航空力学：広域展開 | `tech.aerospace.01.08` | 5 | 69 |
| `tech.aerospace.01.10` | 航空力学：次世代技術 | `tech.aerospace.01.09` | 5 | 72 |

#### 02 飛行制御

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.02.01` | 飛行制御：原理の発見 | `branch.aerospace` | 4 | 47 |
| `tech.aerospace.02.02` | 飛行制御：基礎設計 | `tech.aerospace.02.01` | 4 | 50 |
| `tech.aerospace.02.03` | 飛行制御：実験技術 | `tech.aerospace.02.02` | 4 | 53 |
| `tech.aerospace.02.04` | 飛行制御：実用化 | `tech.aerospace.02.03` | 4 | 56 |
| `tech.aerospace.02.05` | 飛行制御：高効率化 | `tech.aerospace.02.04` | 5 | 59 |
| `tech.aerospace.02.06` | 飛行制御：自動化 | `tech.aerospace.02.05` | 5 | 62 |
| `tech.aerospace.02.07` | 飛行制御：統合システム | `tech.aerospace.02.06` | 5 | 65 |
| `tech.aerospace.02.08` | 飛行制御：高度最適化 | `tech.aerospace.02.07` | 5 | 68 |
| `tech.aerospace.02.09` | 飛行制御：広域展開 | `tech.aerospace.02.08` | 5 | 71 |
| `tech.aerospace.02.10` | 飛行制御：次世代技術 | `tech.aerospace.02.09` | 5 | 74 |

#### 03 軽量機体

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.03.01` | 軽量機体：原理の発見 | `branch.aerospace` | 4 | 49 |
| `tech.aerospace.03.02` | 軽量機体：基礎設計 | `tech.aerospace.03.01` | 4 | 52 |
| `tech.aerospace.03.03` | 軽量機体：実験技術 | `tech.aerospace.03.02` | 4 | 55 |
| `tech.aerospace.03.04` | 軽量機体：実用化 | `tech.aerospace.03.03` | 4 | 58 |
| `tech.aerospace.03.05` | 軽量機体：高効率化 | `tech.aerospace.03.04` | 5 | 61 |
| `tech.aerospace.03.06` | 軽量機体：自動化 | `tech.aerospace.03.05` | 5 | 64 |
| `tech.aerospace.03.07` | 軽量機体：統合システム | `tech.aerospace.03.06` | 5 | 67 |
| `tech.aerospace.03.08` | 軽量機体：高度最適化 | `tech.aerospace.03.07` | 5 | 70 |
| `tech.aerospace.03.09` | 軽量機体：広域展開 | `tech.aerospace.03.08` | 5 | 73 |
| `tech.aerospace.03.10` | 軽量機体：次世代技術 | `tech.aerospace.03.09` | 5 | 76 |

#### 04 ロケット工学

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.04.01` | ロケット工学：原理の発見 | `branch.aerospace` | 4 | 51 |
| `tech.aerospace.04.02` | ロケット工学：基礎設計 | `tech.aerospace.04.01` | 4 | 54 |
| `tech.aerospace.04.03` | ロケット工学：実験技術 | `tech.aerospace.04.02` | 4 | 57 |
| `tech.aerospace.04.04` | ロケット工学：実用化 | `tech.aerospace.04.03` | 4 | 60 |
| `tech.aerospace.04.05` | ロケット工学：高効率化 | `tech.aerospace.04.04` | 5 | 63 |
| `tech.aerospace.04.06` | ロケット工学：自動化 | `tech.aerospace.04.05` | 5 | 66 |
| `tech.aerospace.04.07` | ロケット工学：統合システム | `tech.aerospace.04.06` | 5 | 69 |
| `tech.aerospace.04.08` | ロケット工学：高度最適化 | `tech.aerospace.04.07` | 5 | 72 |
| `tech.aerospace.04.09` | ロケット工学：広域展開 | `tech.aerospace.04.08` | 5 | 75 |
| `tech.aerospace.04.10` | ロケット工学：次世代技術 | `tech.aerospace.04.09` | 5 | 78 |

#### 05 軌道力学

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.05.01` | 軌道力学：原理の発見 | `branch.aerospace` | 5 | 53 |
| `tech.aerospace.05.02` | 軌道力学：基礎設計 | `tech.aerospace.05.01` | 5 | 56 |
| `tech.aerospace.05.03` | 軌道力学：実験技術 | `tech.aerospace.05.02` | 5 | 59 |
| `tech.aerospace.05.04` | 軌道力学：実用化 | `tech.aerospace.05.03` | 5 | 62 |
| `tech.aerospace.05.05` | 軌道力学：高効率化 | `tech.aerospace.05.04` | 5 | 65 |
| `tech.aerospace.05.06` | 軌道力学：自動化 | `tech.aerospace.05.05` | 5 | 68 |
| `tech.aerospace.05.07` | 軌道力学：統合システム | `tech.aerospace.05.06` | 5 | 71 |
| `tech.aerospace.05.08` | 軌道力学：高度最適化 | `tech.aerospace.05.07` | 5 | 74 |
| `tech.aerospace.05.09` | 軌道力学：広域展開 | `tech.aerospace.05.08` | 5 | 77 |
| `tech.aerospace.05.10` | 軌道力学：次世代技術 | `tech.aerospace.05.09` | 5 | 80 |

#### 06 人工衛星

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.06.01` | 人工衛星：原理の発見 | `branch.aerospace` | 5 | 55 |
| `tech.aerospace.06.02` | 人工衛星：基礎設計 | `tech.aerospace.06.01` | 5 | 58 |
| `tech.aerospace.06.03` | 人工衛星：実験技術 | `tech.aerospace.06.02` | 5 | 61 |
| `tech.aerospace.06.04` | 人工衛星：実用化 | `tech.aerospace.06.03` | 5 | 64 |
| `tech.aerospace.06.05` | 人工衛星：高効率化 | `tech.aerospace.06.04` | 5 | 67 |
| `tech.aerospace.06.06` | 人工衛星：自動化 | `tech.aerospace.06.05` | 5 | 70 |
| `tech.aerospace.06.07` | 人工衛星：統合システム | `tech.aerospace.06.06` | 5 | 73 |
| `tech.aerospace.06.08` | 人工衛星：高度最適化 | `tech.aerospace.06.07` | 5 | 76 |
| `tech.aerospace.06.09` | 人工衛星：広域展開 | `tech.aerospace.06.08` | 5 | 79 |
| `tech.aerospace.06.10` | 人工衛星：次世代技術 | `tech.aerospace.06.09` | 5 | 82 |

#### 07 惑星探査

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.07.01` | 惑星探査：原理の発見 | `branch.aerospace` | 5 | 57 |
| `tech.aerospace.07.02` | 惑星探査：基礎設計 | `tech.aerospace.07.01` | 5 | 60 |
| `tech.aerospace.07.03` | 惑星探査：実験技術 | `tech.aerospace.07.02` | 5 | 63 |
| `tech.aerospace.07.04` | 惑星探査：実用化 | `tech.aerospace.07.03` | 5 | 66 |
| `tech.aerospace.07.05` | 惑星探査：高効率化 | `tech.aerospace.07.04` | 5 | 69 |
| `tech.aerospace.07.06` | 惑星探査：自動化 | `tech.aerospace.07.05` | 5 | 72 |
| `tech.aerospace.07.07` | 惑星探査：統合システム | `tech.aerospace.07.06` | 5 | 75 |
| `tech.aerospace.07.08` | 惑星探査：高度最適化 | `tech.aerospace.07.07` | 5 | 78 |
| `tech.aerospace.07.09` | 惑星探査：広域展開 | `tech.aerospace.07.08` | 5 | 81 |
| `tech.aerospace.07.10` | 惑星探査：次世代技術 | `tech.aerospace.07.09` | 5 | 84 |

#### 08 宇宙居住

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.08.01` | 宇宙居住：原理の発見 | `branch.aerospace` | 5 | 59 |
| `tech.aerospace.08.02` | 宇宙居住：基礎設計 | `tech.aerospace.08.01` | 5 | 62 |
| `tech.aerospace.08.03` | 宇宙居住：実験技術 | `tech.aerospace.08.02` | 5 | 65 |
| `tech.aerospace.08.04` | 宇宙居住：実用化 | `tech.aerospace.08.03` | 5 | 68 |
| `tech.aerospace.08.05` | 宇宙居住：高効率化 | `tech.aerospace.08.04` | 5 | 71 |
| `tech.aerospace.08.06` | 宇宙居住：自動化 | `tech.aerospace.08.05` | 5 | 74 |
| `tech.aerospace.08.07` | 宇宙居住：統合システム | `tech.aerospace.08.06` | 5 | 77 |
| `tech.aerospace.08.08` | 宇宙居住：高度最適化 | `tech.aerospace.08.07` | 5 | 80 |
| `tech.aerospace.08.09` | 宇宙居住：広域展開 | `tech.aerospace.08.08` | 5 | 83 |
| `tech.aerospace.08.10` | 宇宙居住：次世代技術 | `tech.aerospace.08.09` | 5 | 86 |

#### 09 宇宙資源科学

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.09.01` | 宇宙資源科学：原理の発見 | `branch.aerospace` | 5 | 61 |
| `tech.aerospace.09.02` | 宇宙資源科学：基礎設計 | `tech.aerospace.09.01` | 5 | 64 |
| `tech.aerospace.09.03` | 宇宙資源科学：実験技術 | `tech.aerospace.09.02` | 5 | 67 |
| `tech.aerospace.09.04` | 宇宙資源科学：実用化 | `tech.aerospace.09.03` | 5 | 70 |
| `tech.aerospace.09.05` | 宇宙資源科学：高効率化 | `tech.aerospace.09.04` | 5 | 73 |
| `tech.aerospace.09.06` | 宇宙資源科学：自動化 | `tech.aerospace.09.05` | 5 | 76 |
| `tech.aerospace.09.07` | 宇宙資源科学：統合システム | `tech.aerospace.09.06` | 5 | 79 |
| `tech.aerospace.09.08` | 宇宙資源科学：高度最適化 | `tech.aerospace.09.07` | 5 | 82 |
| `tech.aerospace.09.09` | 宇宙資源科学：広域展開 | `tech.aerospace.09.08` | 5 | 85 |
| `tech.aerospace.09.10` | 宇宙資源科学：次世代技術 | `tech.aerospace.09.09` | 5 | 88 |

#### 10 恒星間航行研究

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.aerospace.10.01` | 恒星間航行研究：原理の発見 | `branch.aerospace` | 5 | 63 |
| `tech.aerospace.10.02` | 恒星間航行研究：基礎設計 | `tech.aerospace.10.01` | 5 | 66 |
| `tech.aerospace.10.03` | 恒星間航行研究：実験技術 | `tech.aerospace.10.02` | 5 | 69 |
| `tech.aerospace.10.04` | 恒星間航行研究：実用化 | `tech.aerospace.10.03` | 5 | 72 |
| `tech.aerospace.10.05` | 恒星間航行研究：高効率化 | `tech.aerospace.10.04` | 5 | 75 |
| `tech.aerospace.10.06` | 恒星間航行研究：自動化 | `tech.aerospace.10.05` | 5 | 78 |
| `tech.aerospace.10.07` | 恒星間航行研究：統合システム | `tech.aerospace.10.06` | 5 | 81 |
| `tech.aerospace.10.08` | 恒星間航行研究：高度最適化 | `tech.aerospace.10.07` | 5 | 84 |
| `tech.aerospace.10.09` | 恒星間航行研究：広域展開 | `tech.aerospace.10.08` | 5 | 87 |
| `tech.aerospace.10.10` | 恒星間航行研究：次世代技術 | `tech.aerospace.10.09` | 5 | 90 |

### 社会制度・文化(`governance-culture`)

#### 01 公共行政

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.01.01` | 公共行政：原理の発見 | `branch.governance-culture` | 5 | 47 |
| `tech.governance-culture.01.02` | 公共行政：基礎設計 | `tech.governance-culture.01.01` | 5 | 50 |
| `tech.governance-culture.01.03` | 公共行政：実験技術 | `tech.governance-culture.01.02` | 5 | 53 |
| `tech.governance-culture.01.04` | 公共行政：実用化 | `tech.governance-culture.01.03` | 5 | 56 |
| `tech.governance-culture.01.05` | 公共行政：高効率化 | `tech.governance-culture.01.04` | 5 | 59 |
| `tech.governance-culture.01.06` | 公共行政：自動化 | `tech.governance-culture.01.05` | 5 | 62 |
| `tech.governance-culture.01.07` | 公共行政：統合システム | `tech.governance-culture.01.06` | 5 | 65 |
| `tech.governance-culture.01.08` | 公共行政：高度最適化 | `tech.governance-culture.01.07` | 5 | 68 |
| `tech.governance-culture.01.09` | 公共行政：広域展開 | `tech.governance-culture.01.08` | 5 | 71 |
| `tech.governance-culture.01.10` | 公共行政：次世代技術 | `tech.governance-culture.01.09` | 5 | 74 |

#### 02 法制度

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.02.01` | 法制度：原理の発見 | `branch.governance-culture` | 5 | 49 |
| `tech.governance-culture.02.02` | 法制度：基礎設計 | `tech.governance-culture.02.01` | 5 | 52 |
| `tech.governance-culture.02.03` | 法制度：実験技術 | `tech.governance-culture.02.02` | 5 | 55 |
| `tech.governance-culture.02.04` | 法制度：実用化 | `tech.governance-culture.02.03` | 5 | 58 |
| `tech.governance-culture.02.05` | 法制度：高効率化 | `tech.governance-culture.02.04` | 5 | 61 |
| `tech.governance-culture.02.06` | 法制度：自動化 | `tech.governance-culture.02.05` | 5 | 64 |
| `tech.governance-culture.02.07` | 法制度：統合システム | `tech.governance-culture.02.06` | 5 | 67 |
| `tech.governance-culture.02.08` | 法制度：高度最適化 | `tech.governance-culture.02.07` | 5 | 70 |
| `tech.governance-culture.02.09` | 法制度：広域展開 | `tech.governance-culture.02.08` | 5 | 73 |
| `tech.governance-culture.02.10` | 法制度：次世代技術 | `tech.governance-culture.02.09` | 5 | 76 |

#### 03 地域自治

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.03.01` | 地域自治：原理の発見 | `branch.governance-culture` | 5 | 51 |
| `tech.governance-culture.03.02` | 地域自治：基礎設計 | `tech.governance-culture.03.01` | 5 | 54 |
| `tech.governance-culture.03.03` | 地域自治：実験技術 | `tech.governance-culture.03.02` | 5 | 57 |
| `tech.governance-culture.03.04` | 地域自治：実用化 | `tech.governance-culture.03.03` | 5 | 60 |
| `tech.governance-culture.03.05` | 地域自治：高効率化 | `tech.governance-culture.03.04` | 5 | 63 |
| `tech.governance-culture.03.06` | 地域自治：自動化 | `tech.governance-culture.03.05` | 5 | 66 |
| `tech.governance-culture.03.07` | 地域自治：統合システム | `tech.governance-culture.03.06` | 5 | 69 |
| `tech.governance-culture.03.08` | 地域自治：高度最適化 | `tech.governance-culture.03.07` | 5 | 72 |
| `tech.governance-culture.03.09` | 地域自治：広域展開 | `tech.governance-culture.03.08` | 5 | 75 |
| `tech.governance-culture.03.10` | 地域自治：次世代技術 | `tech.governance-culture.03.09` | 5 | 78 |

#### 04 教育制度

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.04.01` | 教育制度：原理の発見 | `branch.governance-culture` | 5 | 53 |
| `tech.governance-culture.04.02` | 教育制度：基礎設計 | `tech.governance-culture.04.01` | 5 | 56 |
| `tech.governance-culture.04.03` | 教育制度：実験技術 | `tech.governance-culture.04.02` | 5 | 59 |
| `tech.governance-culture.04.04` | 教育制度：実用化 | `tech.governance-culture.04.03` | 5 | 62 |
| `tech.governance-culture.04.05` | 教育制度：高効率化 | `tech.governance-culture.04.04` | 5 | 65 |
| `tech.governance-culture.04.06` | 教育制度：自動化 | `tech.governance-culture.04.05` | 5 | 68 |
| `tech.governance-culture.04.07` | 教育制度：統合システム | `tech.governance-culture.04.06` | 5 | 71 |
| `tech.governance-culture.04.08` | 教育制度：高度最適化 | `tech.governance-culture.04.07` | 5 | 74 |
| `tech.governance-culture.04.09` | 教育制度：広域展開 | `tech.governance-culture.04.08` | 5 | 77 |
| `tech.governance-culture.04.10` | 教育制度：次世代技術 | `tech.governance-culture.04.09` | 5 | 80 |

#### 05 文化保存

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.05.01` | 文化保存：原理の発見 | `branch.governance-culture` | 5 | 55 |
| `tech.governance-culture.05.02` | 文化保存：基礎設計 | `tech.governance-culture.05.01` | 5 | 58 |
| `tech.governance-culture.05.03` | 文化保存：実験技術 | `tech.governance-culture.05.02` | 5 | 61 |
| `tech.governance-culture.05.04` | 文化保存：実用化 | `tech.governance-culture.05.03` | 5 | 64 |
| `tech.governance-culture.05.05` | 文化保存：高効率化 | `tech.governance-culture.05.04` | 5 | 67 |
| `tech.governance-culture.05.06` | 文化保存：自動化 | `tech.governance-culture.05.05` | 5 | 70 |
| `tech.governance-culture.05.07` | 文化保存：統合システム | `tech.governance-culture.05.06` | 5 | 73 |
| `tech.governance-culture.05.08` | 文化保存：高度最適化 | `tech.governance-culture.05.07` | 5 | 76 |
| `tech.governance-culture.05.09` | 文化保存：広域展開 | `tech.governance-culture.05.08` | 5 | 79 |
| `tech.governance-culture.05.10` | 文化保存：次世代技術 | `tech.governance-culture.05.09` | 5 | 82 |

#### 06 言語交流

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.06.01` | 言語交流：原理の発見 | `branch.governance-culture` | 5 | 57 |
| `tech.governance-culture.06.02` | 言語交流：基礎設計 | `tech.governance-culture.06.01` | 5 | 60 |
| `tech.governance-culture.06.03` | 言語交流：実験技術 | `tech.governance-culture.06.02` | 5 | 63 |
| `tech.governance-culture.06.04` | 言語交流：実用化 | `tech.governance-culture.06.03` | 5 | 66 |
| `tech.governance-culture.06.05` | 言語交流：高効率化 | `tech.governance-culture.06.04` | 5 | 69 |
| `tech.governance-culture.06.06` | 言語交流：自動化 | `tech.governance-culture.06.05` | 5 | 72 |
| `tech.governance-culture.06.07` | 言語交流：統合システム | `tech.governance-culture.06.06` | 5 | 75 |
| `tech.governance-culture.06.08` | 言語交流：高度最適化 | `tech.governance-culture.06.07` | 5 | 78 |
| `tech.governance-culture.06.09` | 言語交流：広域展開 | `tech.governance-culture.06.08` | 5 | 81 |
| `tech.governance-culture.06.10` | 言語交流：次世代技術 | `tech.governance-culture.06.09` | 5 | 84 |

#### 07 公共経済

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.07.01` | 公共経済：原理の発見 | `branch.governance-culture` | 5 | 59 |
| `tech.governance-culture.07.02` | 公共経済：基礎設計 | `tech.governance-culture.07.01` | 5 | 62 |
| `tech.governance-culture.07.03` | 公共経済：実験技術 | `tech.governance-culture.07.02` | 5 | 65 |
| `tech.governance-culture.07.04` | 公共経済：実用化 | `tech.governance-culture.07.03` | 5 | 68 |
| `tech.governance-culture.07.05` | 公共経済：高効率化 | `tech.governance-culture.07.04` | 5 | 71 |
| `tech.governance-culture.07.06` | 公共経済：自動化 | `tech.governance-culture.07.05` | 5 | 74 |
| `tech.governance-culture.07.07` | 公共経済：統合システム | `tech.governance-culture.07.06` | 5 | 77 |
| `tech.governance-culture.07.08` | 公共経済：高度最適化 | `tech.governance-culture.07.07` | 5 | 80 |
| `tech.governance-culture.07.09` | 公共経済：広域展開 | `tech.governance-culture.07.08` | 5 | 83 |
| `tech.governance-culture.07.10` | 公共経済：次世代技術 | `tech.governance-culture.07.09` | 5 | 86 |

#### 08 防災制度

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.08.01` | 防災制度：原理の発見 | `branch.governance-culture` | 5 | 61 |
| `tech.governance-culture.08.02` | 防災制度：基礎設計 | `tech.governance-culture.08.01` | 5 | 64 |
| `tech.governance-culture.08.03` | 防災制度：実験技術 | `tech.governance-culture.08.02` | 5 | 67 |
| `tech.governance-culture.08.04` | 防災制度：実用化 | `tech.governance-culture.08.03` | 5 | 70 |
| `tech.governance-culture.08.05` | 防災制度：高効率化 | `tech.governance-culture.08.04` | 5 | 73 |
| `tech.governance-culture.08.06` | 防災制度：自動化 | `tech.governance-culture.08.05` | 5 | 76 |
| `tech.governance-culture.08.07` | 防災制度：統合システム | `tech.governance-culture.08.06` | 5 | 79 |
| `tech.governance-culture.08.08` | 防災制度：高度最適化 | `tech.governance-culture.08.07` | 5 | 82 |
| `tech.governance-culture.08.09` | 防災制度：広域展開 | `tech.governance-culture.08.08` | 5 | 85 |
| `tech.governance-culture.08.10` | 防災制度：次世代技術 | `tech.governance-culture.08.09` | 5 | 88 |

#### 09 社会福祉

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.09.01` | 社会福祉：原理の発見 | `branch.governance-culture` | 5 | 63 |
| `tech.governance-culture.09.02` | 社会福祉：基礎設計 | `tech.governance-culture.09.01` | 5 | 66 |
| `tech.governance-culture.09.03` | 社会福祉：実験技術 | `tech.governance-culture.09.02` | 5 | 69 |
| `tech.governance-culture.09.04` | 社会福祉：実用化 | `tech.governance-culture.09.03` | 5 | 72 |
| `tech.governance-culture.09.05` | 社会福祉：高効率化 | `tech.governance-culture.09.04` | 5 | 75 |
| `tech.governance-culture.09.06` | 社会福祉：自動化 | `tech.governance-culture.09.05` | 5 | 78 |
| `tech.governance-culture.09.07` | 社会福祉：統合システム | `tech.governance-culture.09.06` | 5 | 81 |
| `tech.governance-culture.09.08` | 社会福祉：高度最適化 | `tech.governance-culture.09.07` | 5 | 84 |
| `tech.governance-culture.09.09` | 社会福祉：広域展開 | `tech.governance-culture.09.08` | 5 | 87 |
| `tech.governance-culture.09.10` | 社会福祉：次世代技術 | `tech.governance-culture.09.09` | 5 | 90 |

#### 10 惑星文明憲章

| ノードID | 名称 | 前提ノードID | Stage | MP |
|---|---|---|---:|---:|
| `tech.governance-culture.10.01` | 惑星文明憲章：原理の発見 | `branch.governance-culture` | 5 | 65 |
| `tech.governance-culture.10.02` | 惑星文明憲章：基礎設計 | `tech.governance-culture.10.01` | 5 | 68 |
| `tech.governance-culture.10.03` | 惑星文明憲章：実験技術 | `tech.governance-culture.10.02` | 5 | 71 |
| `tech.governance-culture.10.04` | 惑星文明憲章：実用化 | `tech.governance-culture.10.03` | 5 | 74 |
| `tech.governance-culture.10.05` | 惑星文明憲章：高効率化 | `tech.governance-culture.10.04` | 5 | 77 |
| `tech.governance-culture.10.06` | 惑星文明憲章：自動化 | `tech.governance-culture.10.05` | 5 | 80 |
| `tech.governance-culture.10.07` | 惑星文明憲章：統合システム | `tech.governance-culture.10.06` | 5 | 83 |
| `tech.governance-culture.10.08` | 惑星文明憲章：高度最適化 | `tech.governance-culture.10.07` | 5 | 86 |
| `tech.governance-culture.10.09` | 惑星文明憲章：広域展開 | `tech.governance-culture.10.08` | 5 | 89 |
| `tech.governance-culture.10.10` | 惑星文明憲章：次世代技術 | `tech.governance-culture.10.09` | 5 | 92 |
