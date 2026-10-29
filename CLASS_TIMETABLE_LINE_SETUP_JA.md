# 翌日の7組・8組時間割をLINEに送信する設定

## 実装内容

- CampusSyncの時間割画面は、A週／B週から7組／8組の時間割表示に変更しました。
- 7組・8組の時間割を2枚のFlex Messageカルーセルとして1つのメッセージで送信します。
- 毎日21:00（日本時間）に翌日の曜日を計算して配信します。
- 翌日が土曜または日曜になる金曜・土曜の夜は自動スキップします。日曜21:00は翌月曜日分を送信します。
- Adminの「翌日の時間割をテスト送信」ボタンも、当日ではなく翌日の曜日の時間割を送信します。実際のLINE配信になるため、LINE公式アカウントの友だちと、時間割受信をONにしたグループへ送信されます。

## 1. Supabaseのグループ受信設定を更新

Supabase Dashboard → SQL Editorで `supabase/line-group-broadcast.sql` をもう一度実行してください。既存のテーブルを壊さず、`receive_class_timetable` 列を追加します。

グループごとに3種類の受信設定を分離しています。

- `receive_train_timetable`: 鷹の台駅の毎時発車案内
- `receive_class_timetable`: 7組・8組の翌日時間割
- `receive_general_notifications`: 学校のお知らせ、課題、部活・委員会、学食、落とし物などの一般通知

すべての設定は既定値OFFです。電車時刻表専用のグループに授業時間割が届くことはありません。

## 2. 時間割を受け取りたいグループを設定（任意）

WebhookでGroup IDが保存されたら、次で確認します。

```sql
select chat_id, chat_type, active, last_seen_at,
       receive_general_notifications, receive_train_timetable, receive_class_timetable
from public.line_group_chats
order by last_seen_at desc;
```

授業時間割を受信するグループの `chat_id` を確認し、次のSQLの `PASTE_GROUP_ID_HERE` をその値に置き換えて実行します。

```sql
update public.line_group_chats
set receive_class_timetable = (chat_id = 'PASTE_GROUP_ID_HERE')
where chat_type in ('group', 'room');
```

このSQLはクラス時間割受信を指定グループだけONにし、それ以外のグループはOFFにします。他の通知設定は変更しません。時間割をLINE公式アカウントの友だちだけに送り、グループ配信を使わない場合は、この操作は不要です。

## 3. 21:00のCronを設定

Vercel Project Settings → Environment Variablesで `CRON_SECRET` を確認します。その後、`sql/setup_next_day_class_timetable_cron.sql` を開き、`REPLACE_WITH_CRON_SECRET` の箇所だけを同じ値に置き換え、SQLをSupabase SQL Editorへ直接貼り付けて実行してください。実際の秘密値はGitHubへ保存しないでください。

Supabaseデータベースは標準でUTCなので、Cronは `0 12 * * *`（UTC 12:00 = 日本時間21:00）です。既存の電車時刻表の毎時Cronは変更しません。

実行後、以下で `active = true` と `0 12 * * *` を確認します。

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'campussync-next-day-class-timetable';
```

## 4. Adminからテスト送信

Admin画面の「翌日の7組・8組時間割」欄にある「翌日の時間割をテスト送信」を押します。上にある共通のAdmin用パスワード欄を使用します。翌日が土日なら、送信せず時間割がない旨を表示します。

送信は本当のLINE配信です。送信テストは平日で行い、実際の受信先やLINE公式アカウントの送信通数を確認してください。
