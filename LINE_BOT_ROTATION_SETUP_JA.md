# CampusSync: LINE公式アカウント BOT 1〜5 ローテーション設定

## ローテーション日程

毎月の暦日数に合わせて5アカウントの担当期間を均等に分けます。

- 30日月：BOT 1＝1〜6日、BOT 2＝7〜12日、BOT 3＝13〜18日、BOT 4＝19〜24日、BOT 5＝25〜30日
- 31日月：BOT 1〜4は各6日、BOT 5は7日
- 28・29日月：各アカウントの担当期間が5〜6日程度になるよう自動調整

Supabaseのpg_cronが毎日08:55（日本時間）に日付を確認し、対象BOT番号を更新します。実際に番号が変わった日だけAdmin画面に未確認の切替通知を作成します。切替予定時刻は09:00（日本時間）です。

## 1. LINE Developers側で5つのチャネルを準備

それぞれのLINE公式アカウントに対応するMessaging APIチャネルで、次の設定を行います。

1. Channel Secretを確認します。
2. 長期Channel Access Tokenを発行します。長期トークンはチャネルごとに1つで、再発行すると以前の長期トークンは無効になります。
3. Webhook URLを次に設定します。
   `https://campus-sync-mocha.vercel.app/api/line-webhook`
4. Webhook利用をONにします。
5. 「グループトーク・複数人トークへの参加を許可する」をONにします。

Webhookは5チャネル共通URLです。サーバーは5つのChannel Secretのいずれかで署名を検証し、返信にはイベントを送信したチャネルのアクセストークンを使用します。

## 2. Vercelへ10個の環境変数を登録

Vercel Dashboard → Project → Settings → Environment Variables で、次の10個をProduction環境に登録してください。Preview環境でも本番同等のテストをする場合だけ、Previewにも設定します。

| Environment Variable | 登録する値 |
|---|---|
| `LINE_CHANNEL_SECRET_1` | BOT 1のChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN_1` | BOT 1の長期Channel Access Token |
| `LINE_CHANNEL_SECRET_2` | BOT 2のChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN_2` | BOT 2の長期Channel Access Token |
| `LINE_CHANNEL_SECRET_3` | BOT 3のChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN_3` | BOT 3の長期Channel Access Token |
| `LINE_CHANNEL_SECRET_4` | BOT 4のChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN_4` | BOT 4の長期Channel Access Token |
| `LINE_CHANNEL_SECRET_5` | BOT 5のChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN_5` | BOT 5の長期Channel Access Token |

- 値はSupabase SQL、GitHub、Admin画面、チャットに貼り付けないでください。
- 値はブラウザに返されません。Admin画面では登録済み／未登録だけを表示します。
- 10個すべて登録した後、Vercelで再デプロイしてください。
- BOT 1だけの旧環境変数 `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` は、移行期間の後方互換として残して構いません。新しいBOT 1の環境変数を登録したらそちらが優先されます。

## 3. Supabase SQLを実行

Vercelに10個の環境変数を登録し、再デプロイが終わってから、Supabase SQL Editorで次を実行してください。

`supabase/line-bot-rotation.sql`

このSQLは次を作成します。

- 現在使用するBOT番号と次回切替日時
- BOT番号が変わったときのAdmin未確認通知
- 毎日08:55 JSTの切替チェックCron
- 5つのスロットの認証値は保存しません。

実行直後に現在の日付に対応するBOT番号が選ばれ、初期切替通知がAdminに表示されます。

## 4. グループの切替は手動で必要

LINE公式アカウントは、1つのグループに同時に1アカウントしか参加できません。SupabaseのBOT番号が自動で変わっても、グループ内のBOTは自動で退出・参加しません。

Adminに表示される各月のBOT切替通知を見て、次の作業をしてください。

1. 旧BOTをLINEグループから退出させる。
2. 新しいBOTを同じグループへ招待する。
3. 新BOTからグループ内へテストメッセージを送信し、Webhookが受信していることを確認する。
4. Admin画面のチェックボックスを確認し、「切替作業を確認済みにする」を押す。

グループは同じGroup IDを利用するため、Webhookで再検出されると既存の配信設定は引き継がれます。

## 5. 友だち向けBroadcastの注意

Broadcastは、その時点で選択されている公式アカウントの友だちにだけ届きます。BOT 1〜5は別々の友だちリストです。5つのアカウントすべてから同じ利用者へ配信したい場合、その利用者が各アカウントを友だち追加している必要があります。グループ配信と友だち向け配信の送信先が同じとは限りません。

## 6. 確認方法

Admin → ダッシュボード概要の「LINE公式アカウント BOT ローテーション」で確認します。

- 現在のBOT番号
- 次回切替日時
- BOT 1〜5の認証情報がVercelに登録済みかどうか（値は非表示）
- 旧BOT退出／新BOT招待／Webhook確認の未確認タスク

料金枠や複数アカウント運用がLINEの利用条件に適合するかは、運用開始前にLINE公式アカウントの案内・サポートで確認してください。各アカウントの無料枠を合算できるとは限りません。
