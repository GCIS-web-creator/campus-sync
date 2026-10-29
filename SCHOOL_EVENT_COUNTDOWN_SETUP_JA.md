# 学校イベント・カウントダウン設定手順

## 1. イベント用テーブルを作成

Supabase Dashboard → SQL Editor → New query で、リポジトリの `supabase/school-event-countdowns.sql` を全文実行します。

このテーブルはサーバー側の Service Role 経由でのみ読み書きし、生徒ブラウザーから直接アクセスさせません。

## 2. Vercel の環境変数を確認

次の環境変数が設定されていることを確認します。

- `CAMPUS_SYNC_ADMIN_PASSWORD`
- `NEXT_PUBLIC_SUPABASE_URL`（または `SUPABASE_URL`）
- `SUPABASE_SERVICE_ROLE_KEY`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `CRON_SECRET`

Supabase Vault に保存済みの `campussync_push_reminders_cron_secret` は、Vercel の `CRON_SECRET` と同じ値にしてください。値自体をチャットやソースコードに書かないでください。

## 3. 毎日12時のLINE定期配信を設定

Supabase SQL Editor で `sql/setup_school_event_countdown_cron.sql` を全文実行します。

このジョブは毎日12:00（日本時間）に実行されます。SQL の最後に `campussync-school-event-countdowns` と `active = true` が表示されれば登録済みです。

## 4. Admin でイベントを登録

サイトの `/admin` を開き、Admin ナビゲーションの「学校イベント・カウントダウン」を選びます。Admin 用パスワードを入力して、タイトル・概要・開催日を登録します。

- 「生徒用サイトに公開・LINE対象」がONのイベントは、開催日が未来または当日なら生徒用サイトに表示されます。
- OFF のイベントは生徒用サイトとLINE通知の両方から除外されます。
- 登録後は、生徒用ダッシュボードに開催日が最も近いイベントが大きく表示され、「他のカウントダウンを見る」から一覧を開けます。

## LINE通知の条件

毎日12:00（日本時間）に開催日までの日数を計算し、**30日前・15日前・7日前・5日前・3日前・1日前**に該当するイベントだけを通知します。その日に該当するイベントがなければ配信をスキップします。

対象イベントは LINE Flex Message のカルーセル（1メッセージ最大12イベント）で送信します。LINE公式アカウントの友だち全体に配信し、加えて既存のグループ配信設定で `receive_school_schedule = true` になっているグループにも送信します。
