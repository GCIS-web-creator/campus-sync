# CampusSync 自作AI v2（TypeScript推論）差し替え

このZIPは、学習済み `campus_ai (1).pt` を TypeScript推論用の `campus_ai.bin` / `campus_ai.json` に変換し、v2の状況行に対応したAPI・回答処理をまとめたパッチです。

## 含まれる変更
- `lib/campus-ai/model.ts`: TypeScriptだけで推論する既存モデルコード
- `lib/campus-ai/answer.ts`: v2の状況行（国分寺/東村山/教室/投票/売切）
- `lib/campus-ai/weights/campus_ai.bin` と `campus_ai.json`: 添付されたチェックポイントから再変換した重み
- `app/api/campus-ai/route.ts`: 実データ取得（メニュー/時刻表/課題/教室/混雑投票/売り切れ）と回答への値埋め込み

確認したモデル設定：`vocab_size=618`, `d=256`, `layers=4`, `heads=4`, `block_size=192`。
Pythonファイルを本番で実行する必要はありません。`ai/` のPythonは学習や評価用です。

## Codespacesで反映
1. ZIPをCodespacesの `/workspaces/campus-sync` 直下へアップロードする。
2. ターミナルで、先に未保存の作業状況を確認する。

```bash
cd /workspaces/campus-sync
git status --short
```

3. 作業中のファイルを確認してから、パッチを展開する（このZIPは `app/api/campus-ai/route.ts` と `lib/campus-ai/**` だけを更新します）。

```bash
unzip -o campus-ai-v2-typescript-patch.zip -d /workspaces/campus-sync
```

4. ビルドを確認する。

```bash
npm run build
```

5. ビルドに成功したら `npm run dev` で起動し、チャットで「今日のメニューは？」「次の電車は？」「食堂の混み具合は？」「教室の状況は？」「こんにちは」を試す。

## 注意
- 既存の `components/CampusAIChat.tsx` と `app/layout.tsx` にチャットUIの導入が必要です。このパッチでは、現在のサイト設定を壊さないためその2ファイルを上書きしません。
- 課題の質問は、生徒がログインしていて、有効なSupabaseアクセストークンが送られたときのみデータを読みます。
- `npm run build` が成功するまで `git add` / `git commit` / `git push` はしないでください。
