# CampusSync AI をLINE公式アカウントで使う

このWebhookはLINEのテキストメッセージを既存の `/api/campus-ai` に渡し、その回答をLINEの返信として返します。別のAIモデルは追加せず、サイト内のCampusSync AIと同じ回答APIを使います。

## Vercelの環境変数

Vercelの **Project → Settings → Environment Variables** に以下を設定します。

- `LINE_CHANNEL_SECRET`: LINE Developersの対象Messaging APIチャネルにある「チャネル基本設定 → チャネルシークレット」
- `LINE_CHANNEL_ACCESS_TOKEN`: 既存のLINE配信機能でも使用しているチャネルアクセストークン
- `CAMPUS_SYNC_BASE_URL`（任意）: CampusSync本番サイトのベースURL。未設定の場合は `https://campus-sync-mocha.vercel.app` を使います。独自ドメインを使う場合は `https://...` 形式で指定してください。

環境変数を設定・変更した場合は、Vercelで再デプロイが必要です。秘密情報をブラウザ用の `NEXT_PUBLIC_` 変数に設定しないでください。

## LINE DevelopersのWebhook設定

1. LINE DevelopersでCampusSyncのMessaging APIチャネルを開きます。
2. 「Messaging API設定」のWebhook URLに、次のURLを設定します。

   `https://campus-sync-mocha.vercel.app/api/line-webhook`

3. Webhookの利用をONにし、「検証」を押します。成功するとHTTP 200が返ります。
4. LINE公式アカウント側の応答設定で、自動応答が同時に返って二重返信にならないよう、必要に応じて応答メッセージを調整します。

Webhook URLにGETアクセスすると、`CampusSync AI LINE webhook` の稼働確認JSONが返ります。LINEからのPOSTは `x-line-signature` を検証した後にだけ処理します。

## 使い方と注意点

友だちになったユーザーがLINE公式アカウントへ「今日のメニューは？」「次の電車は？」「教室の状況は？」「公開中のお知らせは？」などのテキストを送ると、CampusSync AIが回答します。表形式の結果は、LINE上で読みやすい箇条書きに変換して返信します。

- 質問はサイト内AI APIに合わせて100文字までです。
- このWebhookでは会話履歴を保存していないため、LINEでの追加質問は前の発言を自動では引き継ぎません。必要な条件は質問文に含めてください。
- 学校アカウントでのログインを必要とする個人別の課題・貢献度などは、LINEのメッセージだけでは認証できないため、サイトへのログインを案内します。
- LINEの返信は、ユーザーが送ったメッセージに対する返信メッセージとして送信します。実際の利用開始前に、LINE DevelopersのWebhook検証と自分のLINEからのテストを行ってください。
