# CampusSync AI v3 — TypeScript推論パッチ

このパッチは、Colabから共有された `campus_ai (2).pt` を検証し、TypeScript推論に使う `campus_ai.bin` / `campus_ai.json` に変換したものです。

## モデル設定
- vocab_size: 665
- d: 320
- layers: 4
- heads: 4
- block_size: 320
- パラメータ数: 5,247,680 (重み共有を含む state dict では head.weight を除いて書き出し)

## 含むファイル
- `lib/campus-ai/model.ts`: Python/PyTorchを使わないTypeScript推論
- `lib/campus-ai/answer.ts`: v3の状況行とスロット定義
- `lib/campus-ai/weights/campus_ai.bin` と `.json`: 変換済み重みとメタデータ
- `app/api/campus-ai/route.ts`: メニュー、売り切れ、混雑、時刻表、課題、教室、部活ノート、蔵書、キャリアセンター、落とし物、口コミ、貢献度、通知のデータ取得と回答への埋め込み
- `app/api/campus-ai/queue-vote/route.ts`: チャットからのメニュー別行列投票の保存
- `components/CampusAIChat.tsx`: 教室一覧の表表示、投票ボタン、Supabaseセッショントークンの送信

通知は、現時点でCampusSync画面に表示している `MOCK_NOTIFICATIONS` と同一のサンプル一覧を使っています。永続的な通知テーブルは未接続なので、通知を本当の動的データにするには、後で共通の通知テーブルへ移行が必要です。

教室一覧はフロントエンド初期値と `room_status` の最新行をIDでマージします。表示中にデータベース側で更新された状態はDB値を優先します。教室一覧はAPIから表データとして返し、チャット上でテーブル表示します。対象メニューの行列質問には「並びなし／普通／行列大」のボタンを表示し、選択を `cafeteria_votes` に保存します。

## 安全な反映手順（Codespaces）
1. `cd /workspaces/campus-sync && git status --short` で作業中の変更を確認する。
2. AIファイルを手動編集している場合は、先にコピーを作ってください。
3. ZIPを `/workspaces/campus-sync` に置いたあと、以下を実行します。

```bash
cd /workspaces/campus-sync
unzip -o campus-ai-v3-typescript-patch.zip -d /workspaces/campus-sync
npm run build
```

4. ビルド成功後に `npm run dev` で、メニュー、PC教室の気温、教室一覧、部活ノート、蔵書、キャリアセンター、落とし物、口コミ、貢献度、通知を試してください。
5. ビルドとデータの整合性が確認できるまでは commit/push しないでください。

## 注意
- このZIPは `components/CampusAIChat.tsx` を更新します。既にこのファイルを独自編集している場合は、展開前にコピーを取ってください。 `app/page.tsx` は上書きしません。
- APIの認証が必要な課題・個人貢献データは、チャット側からSupabaseセッションのBearerトークンが `Authorization` ヘッダーに送られる必要があります。
- 300/300および1200/1200は合成データ上のテンプレート評価です。実データの正しさや表示UI全体を保証するものではありません。
