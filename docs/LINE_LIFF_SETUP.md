# CampusSync 学校資料 LIFF 設定

## この機能の動作

LINEグループでは最初の案内メッセージだけを送信し、フォルダー移動・検索・PDF表示は /liff/materials の中で完結します。LIFFから送るIDトークンはサーバー側でLINEの検証APIに照会し、ブラウザーが送ったLINEユーザーIDを認証情報として扱うことはありません。

既存の line_student_links と profiles.verified_class を利用します。未連携のLINEアカウントには全校公開資料だけを返し、連携済みの場合も管理者確認済みクラスが登録されている場合に限って該当する学年・クラス資料を返します。認可は一覧取得時とファイル取得時の両方でサーバー側が再確認します。

## LINE Developers

1. 既存のMessaging APIチャネルと同じProvider内にLINE Loginチャネルを用意します。
2. そのLINE LoginチャネルのLIFFタブからLIFFアプリを追加します。
3. Endpoint URLを https://<CampusSyncの公開ドメイン>/liff/materials にします。
4. Scopeで openid を必ず有効にします。表示名やプロフィール画像は資料閲覧に使わないため、追加のProfile/Email scopeは不要です。
5. 発行されたLIFF IDと、LINE LoginチャネルのChannel IDを控えます。LIFF IDの先頭部分を推測して設定せず、画面に表示されるChannel IDをそのまま使ってください。

## Cloudflare Workers の環境変数

campus-sync Workerに以下を追加します。

| 変数 | 種類 | 内容 |
| --- | --- | --- |
| LINE_LIFF_ID | 通常の変数 | LINE Developersで発行されたLIFF ID |
| LINE_LIFF_CHANNEL_ID | 通常の変数 | LIFFを追加したLINE LoginチャネルのChannel ID |
| LINE_LIFF_SESSION_SECRET | Secret | 32文字以上のランダムな秘密値 |

LINE_LIFF_SESSION_SECRET はリポジトリに保存しないでください。十分に長いランダム値を生成し、CloudflareのSecretとして登録します。コードはこの値を使ってHttpOnlyセッションCookieに署名します。

## 動作確認

- LINEグループで CSAI 学校資料 を送信し、案内メッセージが1通だけ届くこと。
- 「開く」からLIFFが起動し、ログイン後にフォルダー移動・検索・PDF表示がLIFF画面内で完了すること。
- 画面内の操作でLINEトークに新しいメッセージが送信されないこと。
- 未連携アカウントでは全校公開資料だけが見えること。
- 連携済みかつ verified_class がある場合だけ、対象クラス資料が表示されること。
- 資料ファイルのURLを直接要求しても、ログイン状態と閲覧権限の再確認が行われること。

LIFF IDとChannel ID、Secretを設定するまでは、LINEから起動する本番テストは完了しません。
