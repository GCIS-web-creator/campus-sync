# Campus Sync 専用AI(自作・スロット方式)

外部AI/APIを使わず、ゼロから学習した小型モデルです。モデルは「文の型」だけを作り、時刻・日付・カロリーなどの値はアプリがDBから埋めます。

## ローカルで動かす
```bash
# ターミナル1: AIサーバー(初回は torch の読み込みに十数秒かかります)
cd ai
pip install -r requirements.txt
python serve.py            # → http://localhost:8000

# ターミナル2: アプリ
npm run dev                # 右下の丸いボタンからチャットを開く
```
別の場所でAIサーバーを動かす場合は、アプリ側の環境変数 `CAMPUS_AI_URL`(例: `https://xxxx.example.com/ask`)を設定します。未設定なら `http://localhost:8000/ask` を使います。

## 本番(Vercel)について【重要】
VercelではPythonのAIサーバーは動かせません。本番で使うには、`ai/` をどこか別のサーバー(RenderやRailway等の小さなCPUサーバー)で動かし、`CAMPUS_AI_URL` をVercelの環境変数に設定する必要があります。AIサーバーにつながらないときは「AIが今つながっていません」と表示するだけで、アプリ本体には影響しません。

## ファイル
- `components/CampusAIChat.tsx` … 右下のチャットUI(`app/layout.tsx` に追加済み。/admin では非表示)
- `app/api/campus-ai/route.ts` … Supabaseから学食・電車・課題を取り、AIサーバーに渡して、返ってきた型に値を埋める
- `ai/` … モデル本体・学習・評価・Colab用ノートブック(`campus_ai_train.ipynb`)

## 限界
- 1問1答です(「それは?」のような前の発言を踏まえた質問は未対応)。
- 対応分野は学食・鷹の台駅の電車・課題と、挨拶・お礼・使い方です。
- 質問の言い回しを増やすには、`ai/gen_data.py` に追加して再学習します。

---
## 【更新】推論はTypeScriptで動く(別サーバー不要)
- 本番では `ai/serve.py` は使いません(古い方式。ローカルでPython版を試したいときだけ)。`CAMPUS_AI_URL` も不要です。
- 推論は `lib/campus-ai/model.ts`(モデル)と `lib/campus-ai/answer.ts`(型の生成+スロット埋め)にあり、`app/api/campus-ai/route.ts` から直接呼ばれます。
- 重みは `lib/campus-ai/weights/campus_ai.bin`(約2.8MB)と `campus_ai.json`。`next.config.ts` の `outputFileTracingIncludes` でVercelの関数に同梱されます。
- 生成は貪欲(最も確率の高い文字を選ぶ)。Python版の temperature=0.1 とほぼ同じ動作です。

### 再学習したら(重みの入れ替え手順)
```
cd ai
python train.py ...                       # 学習 → campus_ai.pt
python export_weights.py campus_ai.pt ../lib/campus-ai/weights   # torch不要
```
### 検証(Python版=参照実装とTS版の一致を確認)
```
cd ai && python eval_np.py                # numpy参照実装で300件採点 → cases.json 出力
cd .. && npx tsx ai/verify_ts.ts          # TS版が同じ文を出すか(一致数・logits誤差・所要時間)
```
(`ref_np.py` はPyTorch版と同じ計算のnumpy実装。torchが無くても動く。)
モデルの形(d, layers, heads 等)を変えた場合は `model.ts` が `campus_ai.json` の設定を読むので基本そのまま動きますが、`ref_np.py` と `verify_ts.ts` で必ず再確認してください。

---
## 【v2 学習データ】(実際の質問で見つかった弱点への対応)
`gen_data.py` を v2 に更新しました(旧版は `legacy_v1/` に保存。**いま本番で動いている `campus_ai.pt` は v1 の学習なので、`legacy_v1/gen_data.py` の方と対応しています**)。
追加した分野: 売り切れ(個別/一覧)・食堂の混雑・教室の状況(全体は1つの文字列 {RL} に整えて差し込む/個別)・電車(方面を言わなければ両方向を答える/「何分後」/「N本目」)・さようなら。お断り文と挨拶・使い方の文も新しい対応分野に合わせて更新。
状況行とスロットの一覧は `gen_data.py` 冒頭の説明を参照。
- **v2のモデルはColabで最初から学習が必要**(`campus_ai_train.ipynb`。文字の種類が増えるため `--resume` は使えない)。
- **v2の重みができたら、アプリ側(`route.ts`、`lib/campus-ai/answer.ts`)も一緒に更新が必要**(状況行の形式が変わるため。重みだけ入れ替えると壊れる)。
- 評価は `python eval.py`(torchあり)または `python eval_np.py`(torchなし)。種類別の正解数と外れ例が出る。
