# CampusSync：スマホ・PCのプッシュ通知設定

このパッケージは、ログイン後にブラウザーのプッシュ通知を登録し、テスト通知を送信し、提出期限に合わせて通知を自動送信するための追加ファイルです。既存アプリで動作確認はできていないため、ステージング環境や自分の端末で確認してから公開してください。

## 追加される機能

- 既存の「おせっかい提出警告リマインダー」に「この端末の通知を有効化」「テスト通知を送る」を追加
- ブラウザーごとの通知購読をSupabaseに保存
- `2日前20:00`、`前日20:00`、`当日07:00`、`期限の3時間前` にサーバーからプッシュ通知
- 設定した曜日のみ通知。時刻と曜日は日本時間 `Asia/Tokyo` 基準
- 課題詳細画面で実際の提出期限（日付・時刻）を保存

## 1. ファイルを配置

プロジェクトのルートでZIPを展開し、含まれているパスどおりに配置してください。`app/page.tsx` は既存機能を含む完全版です。必ず現在の `app/page.tsx` をバックアップしてから置き換えてください。ZIP内の次のファイルが追加・更新対象です。

- `app/page.tsx`
- `app/api/push/test/route.ts`
- `app/api/push/reminders/route.ts`
- `public/sw.js`
- `app/manifest.ts`（既存のmanifestがある場合は上書きせず、内容を統合）
- `sql/setup_web_push_reminders.sql`
- `sql/setup_push_cron.sql`
- `.env.webpush.example`

## 2. Supabaseのテーブルを作成

Supabase Dashboard → SQL Editorで、`sql/setup_web_push_reminders.sql` の内容を全部実行します。

これは `todos.due_at` と、通知の購読・設定・送信履歴のテーブルを追加します。既存の `todos.due`（「明日まで」などの表示文字列）はそのまま残ります。実際の期限が決まっている課題は、アプリのホーム画面で課題を開き、「実際の提出期限（日付・時刻）」を設定して保存してください。表示文言から実際の日付を推測して勝手に登録することはしません。

## 3. `web-push` をインストールしてVAPID鍵を生成

Codespacesのターミナルで実行：

```bash
npm install web-push && npm install -D @types/web-push
npx web-push generate-vapid-keys --json
```

生成結果は1回だけ使い、その同じ鍵を開発・本番環境で使い続けてください。公開鍵を後から変えると、以前に登録したブラウザー購読の再登録が必要になることがあります。

## 4. 環境変数を設定

ローカルでは `.env.local` に以下の項目を追加します（実際の値に置き換えてください）。`.env.local` をGitにコミットしないでください。

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=生成した公開鍵
VAPID_PUBLIC_KEY=生成した公開鍵
VAPID_PRIVATE_KEY=生成した秘密鍵
VAPID_SUBJECT=mailto:自分が管理するメールアドレス
SUPABASE_SERVICE_ROLE_KEY=Supabaseのサーバー用secret/service_roleキー
CRON_SECRET=十分に長いランダムな秘密文字列
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` 以外はサーバー専用です。秘密鍵・service roleキー・CRON_SECRETに `NEXT_PUBLIC_` を付けないでください。また、値をチャットやGitHubへ貼らないでください。

`CRON_SECRET` はCodespacesのターミナルで `openssl rand -hex 32` と実行して生成できます。生成した値を安全に控えて、VercelとSupabase Vaultに同じ値を設定してください。

Vercelでも、Project → Settings → Environment Variables で同じ変数を設定します。`NEXT_PUBLIC_VAPID_PUBLIC_KEY` はPublic、残りはSecretとして設定し、Production（必要に応じてPreview）を選び、保存後にRedeployします。`SUPABASE_SERVICE_ROLE_KEY` は以前のQRログイン引き継ぎAPIでも必要なサーバー側キーです。

## 5. ローカルで確認

```bash
npm run dev
```

HTTPSの公開サイト、またはlocalhostでCampusSyncにログインし、「設定」内の「おせっかい提出警告リマインダー」へ進みます。

1. 「この端末の通知を有効化」を押し、ブラウザーの許可ダイアログで許可
2. 「テスト通知を送る」を押す
3. ブラウザーやOSの通知領域に `CampusSync テスト通知` が届くか確認
4. 課題を開き、具体的な提出期限を保存する
5. 2日前・前日・当日・3時間前の設定と、月〜金の曜日設定を確認する

## 6. 自動通知スケジュールを設定

自動リマインダーはページを開いている間だけで動くタイマーではありません。Supabase Cronがサーバールートを5分ごとに呼び出します。

1. Vercelの環境変数 `CRON_SECRET` を設定し、アプリをデプロイします。
2. Supabase SQL Editorで `sql/setup_push_cron.sql` を開きます。
3. ファイル内の `REPLACE_WITH_THE_SAME_CRON_SECRET_CONFIGURED_IN_VERCEL` をVercelと同じ `CRON_SECRET` に置き換えて、SQLを1度だけ実行します。SQLには秘密文字列が含まれるので、編集済みSQLを公開・共有しないでください。
4. Supabase DashboardのCron/Jobs画面で、`campussync-push-reminders-every-five-minutes` が作成されているか確認します。
5. VercelのFunctions Logs、Supabase Cronの実行履歴、ブラウザーの通知領域を確認します。

`setup_push_cron.sql` は一度だけ実行します。重複して実行すると同じVault secretやCron jobが複数登録される可能性があるため、再実行前に既存のsecretとjobを確認してください。

## 対応条件と注意点

- Web Pushには、通知を受け取る端末・ブラウザーごとの登録が必要です。スマホとPCの両方に通知したい場合、両方の端末でCampusSyncを開き、同じログインで「通知を有効化」を押してください。
- HTTPSが必要です（localhostは開発用の例外）。通知がOS・ブラウザー側でブロックされていると届きません。
- iPhone/iPadでは、OSとブラウザーの要件を満たし、通常はWebアプリをホーム画面に追加してから通知を許可する必要があります。
- ブラウザーの購読を許可しても、ユーザーがOS通知を無効にした場合、端末が電源オフの場合、ネットワークやプッシュサービスの都合で配信が遅れる場合には、表示が保証されるわけではありません。
- 自動通知は `todos.due_at` が入っている未完了課題だけが対象です。既存の「本日中」「金曜まで」等の表示だけでは正確な期限時刻が分からないため、期限を明示的に保存してください。
- サーバーの自動実行は5分おきなので、「期限の3時間前」通知はスケジューラーの実行タイミングにより数分遅れることがあります。
