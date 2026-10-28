# CampusSync: 落とし物モデレーションとLINE Flex Message

## GitHubで反映した実装

- 生徒投稿は `lost_and_found.status = pending` として保存し、公開一覧では `status = approved` のものだけを表示します。
- Adminの落とし物タブは `/api/admin/lost-and-found` からSupabaseの共通データを読み込みます。承認・返却は認証済みサーバーAPI経由です。
- 承認時に投稿者の6桁学籍番号が保存されていれば、貢献度を加算します。投稿直後には加算しません。
- Adminお知らせ／学食のお知らせと部活・委員会のLINE配信は共通のFlex Messageデザインを使います。
- `/api/line-train-timetable` はCRON_SECRETで保護され、`takanodai_timetable` の今後1時間分をFlex Messageで一斉配信します。
- 1時間ごとの配信履歴を保存し、同じ時間枠の二重送信を抑制します。

## Vercel環境変数

VercelのProject Settings → Environment Variablesで、少なくとも次を確認してください。設定した環境（Production / Preview）にも注意してください。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバー側のみ。NEXT_PUBLIC_は付けない）
- `CAMPUS_SYNC_ADMIN_PASSWORD`
- `ADMIN_BROADCAST_PASSWORD`（Adminから通常のお知らせをLINE配信する場合）
- `LINE_CHANNEL_ACCESS_TOKEN`
- `CRON_SECRET`
- `CLUB_NOTES_LINE_BROADCAST_ENABLED=true`（部活・委員会投稿を自動配信する場合）

Supabase値を未設定にしたままでもNext.jsのビルドがモジュール初期化で落ちないようにしましたが、実際にSupabaseを使うには上記値が必要です。

## Supabase SQLの実行

1. `supabase/lost-found-line-flex-hourly.sql` をSupabase Dashboard → SQL Editorで実行します。
2. SQLは落とし物の状態・投稿者ID・承認日時・返却日時・貢献度加算済み印と、時刻表配信履歴テーブルを作成します。
3. 以前の「全ユーザーが全行を読める」落とし物RLSポリシーを除去し、生徒は承認済みレコードだけ読めるようにします。挿入は、ログイン中メールアドレスの先頭6桁と一致するstudent_idでの未承認投稿だけにします。
4. SQL内のサンプル削除は、サンプルの品名・場所・説明文が一致する行だけを対象にします。画面コードの固定サンプルも削除済みです。

## 毎時00分の定期配信

1. `sql/setup_line_train_timetable_cron.sql` を開き、`YOUR-DEPLOYMENT.vercel.app` を実際のVercelドメインに置き換えます。
2. `REPLACE_WITH_CRON_SECRET` をVercel環境変数 `CRON_SECRET` と同じ値に置き換えます。秘密値を含むSQLはGitHubへコミットせず、Supabase SQL Editorに直接貼り付けて実行する方法を推奨します。
3. SQLの末尾の確認クエリで `campussync-hourly-train-timetable` が `active = true` で登録されたことを確認します。
4. `0 * * * *` は毎時00分の実行です。JSTはUTC+9で分がずれないため、日本時間も00分に実行されます。

## 確認項目

- 生徒でログインし、テスト投稿が受付済みになるが、公開一覧には出ないこと。
- Adminでパスワードを入力し、一覧を読み込み、実物確認の承認後に生徒の公開一覧に出ること。
- 承認前に貢献度が増えず、承認時に投稿者の貢献度が加算されること。
- 返却完了後、生徒の公開一覧から消えAdminでは返却済みとして残ること。
- Adminお知らせ、学食お知らせ、部活・委員会投稿がFlex Messageで届くこと。
- 時刻表APIに対するCronの手動テストと、毎時00分のCron実行を確認すること。

## LINE配信上の注意

毎時の時刻表はLINE公式アカウントの友だち全員への一斉配信です。友だち数と月間メッセージ通数上限・料金を確認してください。配信内容は登録済み時刻表データを使うもので、リアルタイムの遅延・運休情報ではありません。
