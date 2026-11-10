# CampusSync: Cloudflare Workers 移行準備

## 現在の状態

- この設定は cloudflare-workers-migration ブランチ上で準備する。
- main、Vercelの本番設定、Supabaseのテーブル・Cron、LINEのWebhook設定は変更しない。
- Next.js 16.4.5 は Cloudflare OpenNext アダプターで動作させる。
- Cloudflare側にR2、Images、Cron Trigger、Durable Objectsを追加しない初期構成とする。
- Supabase側にある既存の定期実行は、移行後もSupabaseで継続する。

## 主な変更

- wrangler.jsonc: Workersのエントリーポイントと静的アセットを設定。
- open-next.config.ts: SSG向けの読み取り専用静的アセットキャッシュを指定。
- scripts/generate-weather-icons.mjs: ZIP内の48種類のSVGをビルド時に展開し、既存API URLを保ったまま静的ファイルとして配信できるようにする。PNG形式のリクエストもビルド時に生成した画像へ振り分ける。
- sharp はビルド時の変換だけに使い、Workerの実行時コードから外す。
- Cloudflare用のツールは cloudflare:install でバージョン固定して追加する。既存の package-lock.json は変更しない。

## ビルド・プレビュー

    npm ci
    npm run cloudflare:build
    npx wrangler deploy --dry-run

ローカルのWorkersランタイムで確認する場合:

    npm run cloudflare:preview

Cloudflareへの実デプロイ:

    npm run cloudflare:deploy

実デプロイは、Cloudflareアカウント・認証・環境変数の登録と、実機での互換性テストが整うまで実行しない。

## 本番切替前に必ず行うこと

1. Workersのプレビューで、ログイン・OTP・生徒プロフィール・管理画面・全75個のAPIルートを確認する。
2. 環境変数とSecretをソースコードから全件洗い出し、Cloudflare側へ安全に登録する。Secret値をGitへ追加しない。
3. LINE DevelopersのWebhook URLを新しいホスト名の /api/line-webhook に変更する。
4. CAMPUS_SYNC_BASE_URL、Supabase Cron/Edge Functionから呼び出すURL、その他のVercel URL参照を新しいホスト名へ切り替える。
5. Supabase Authの許可URL/リダイレクトURLを新ホスト名に合わせる。
6. PWA・Service Worker・Push通知を新しいOriginで再登録する。Originが変わる場合、利用者は再ログインやPush通知の再許可・再登録が必要になることがある。
7. LINEの送受信、学校通知、課題通知、天気・地震情報、画像・添付ファイル、ファイルアップロード、チャットを実データで確認してから切り替える。
8. 問題があれば旧Vercel環境へ戻せるよう、切替前の設定を保存しておく。

## URLについて

campus-sync-mocha.vercel.app はVercelが提供するホスト名なので、そのままCloudflare Workersへ移すことはできない。初回は *.workers.dev の新しいOriginになる。所有する独自ドメインが別にある場合は、DNSを管理できることを確認したうえで後から接続する。

## 無料枠の注意

Workers Freeの主な上限は1日100,000リクエスト、HTTPリクエストごとのCPU時間10ms、メモリ128MB。無料枠を超えるアクセスやCPU負荷に備え、ログイン・地震データ・LINE Webhook・画像表示などの実測を行う。R2やCloudflare Imagesなど課金対象の追加機能は有効にしない。

## 2026-11-10 Cloudflare ビルド起動コミット

この更新は Cloudflare Workers Builds の新しいビルドを起動するためのドキュメントのみの変更。アプリケーションの実行コード、依存関係、main ブランチ、Vercel 本番設定、Supabase、LINE の設定は変更しない。
