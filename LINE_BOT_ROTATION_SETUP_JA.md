# CampusSync: LINE公式アカウント BOT 1〜3 ローテーション設定

## ローテーション日程

- BOT 1：毎月1日〜10日
- BOT 2：毎月11日〜20日
- BOT 3：毎月21日〜月末

Supabaseのpg_cronが毎日08:55（日本時間）に日付を確認し、対象BOT番号を更新します。実際に番号が変わった日だけAdmin画面に未確認の切替通知を作成します。日曜09:00の週間学校予定表より先に切替処理が行われます。

## 1. LINE Developers側で3つのチャネルを準備

それぞれのLINE公式アカウントに対応するMessaging APIチャネルで、次の設定を行います。

1. Channel Secretを確認します。
2. 長期Channel Access Tokenを発行します。長期トークンはチャネルごとに1つで、再発行すると以前の長期トークンは無効になります。
3. Webhook URLを次に設定します。
   `https://campus-sync-mocha.vercel.app/api/line-webhook`
4. Webhook利用をONにします。
5. 「グループトーク・複数人トークへの参加を許可する」をONにします。

Webhookは3チャネル共通URLです。サーバーは3つのChannel Secretのいずれかで署名を検証し、返信にはイベントを送信したチャネルのアクセストークンを使用します。

## 2. Vercelへ6つの環境変数を登録

Vercel Dashboard → Project → Settings → Environment Variables で、次の6つをProduction環境に登録してください。Preview環境でも本番同等のテストをする場合だけ、Previewにも設定します。

| Environment Variable | 登録する値 |
|---|---|
| `LINE_CHANNEL_SECRET_1` | BOT 1のChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN_1` | BOT 1の長期Channel Access Token |
| `LINE_CHANNEL_SECRET_2` | BOT 2のChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN_2` | BOT 2の長期Channel Access Token |
| `LINE_CHANNEL_SECRET_3` | BOT 3のChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN_3` | BOT 3の長期Channel Access Token |

- 値はSupabase SQL、GitHub、Admin画面、チャットに貼り付けないでください。
- 値はブラウザに返されません。Admin画面では登録済み／未登録だけを表示します。
- 6つすべて登録した後、Vercelで再デプロイしてください。
- BOT 1だけの旧環境変数 `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` は、移行期間の後方互換として残して構いません。新しいBOT 1の環境変数を登録したらそちらが優先されます。

## 3. Supabase SQLを実行

Vercelに6つの環境変数を登録し、再デプロイが終わってから、Supabase SQL Editorで次を実行してください。

`supabase/line-bot-rotation.sql`

このSQLは次を作成します。

- 現在使用するBOT番号と次回切替日時
- BOT番号が変わったときのAdmin未確認通知
- 毎日08:55 JSTの切替チェックCron
- 3つのスロットの認証値は保存しません。

実行直後に現在の日付に対応するBOT番号が選ばれ、初期切替通知がAdminに表示されます。

## 4. グループの切替は手動で必要

LINE公式アカウントは、1つのグループに同時に1アカウントしか参加できません。SupabaseのBOT番号が自動で変わっても、グループ内のBOTは自動で退出・参加しません。

毎月1日・11日・21日のAdmin通知を見て、次の作業をしてください。

1. 旧BOTをLINEグループから退出させる。
2. 新しいBOTを同じグループへ招待する。
3. 新BOTからグループ内へテストメッセージを送信し、Webhookが受信していることを確認する。
4. Admin画面のチェックボックスを確認し、「切替作業を確認済みにする」を押す。

グループは同じGroup IDを利用するため、Webhookで再検出されると既存の配信設定は引き継がれます。

## 5. 友だち向けBroadcastの注意

Broadcastは、その時点で選択されている公式アカウントの友だちにだけ届きます。BOT 1〜3は別々の友だちリストです。3つのアカウントすべてから同じ利用者へ配信したい場合、その利用者が各アカウントを友だち追加している必要があります。グループ配信と友だち向け配信の送信先が同じとは限りません。

## 6. 確認方法

Admin → ダッシュボード概要の「LINE公式アカウント BOT ローテーション」で確認します。

- 現在のBOT番号
- 次回切替日時
- BOT 1〜3の認証情報がVercelに登録済みかどうか（値は非表示）
- 旧BOT退出／新BOT招待／Webhook確認の未確認タスク

料金枠や複数アカウント運用がLINEの利用条件に適合するかは、運用開始前にLINE公式アカウントの案内・サポートで確認してください。各アカウントの無料枠を合算できるとは限りません。
