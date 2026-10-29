# LINEグループへの時間割・電車・学食売切・課題通知

## 配信する内容

設定したグループには次の4種類を配信できます。

1. **7組・8組の時間割**：毎日21:00（日本時間）に翌日の曜日の時間割をFlex Messageで配信。翌日が土日なら送信しません。
2. **鷹の台駅の時刻表**：既存の毎時配信を維持します。
3. **学食売切通知**：Adminで売切を実行したときに即時配信します。
4. **課題通知**：新しい課題が公開されたときに配信し、さらに毎日21:00に提出期限が今後48時間以内に迫っている公開中の課題をまとめて配信します。

一般の学校のお知らせ、部活・委員会、落とし物などは別の設定です。指定グループでは `receive_general_notifications = false` にすれば混ざりません。

## 1. Supabaseのグループ受信設定を更新

Supabase Dashboard → SQL Editorで `supabase/line-group-broadcast.sql` を再実行してください。既存のGroup IDを保持したまま、配信種類の設定列を追加します。

## 2. 対象グループを選ぶ

WebhookでグループIDが保存されたら、SQL Editorで次を実行します。

```sql
select chat_id, chat_type, active, last_seen_at, last_event_type,
       receive_train_timetable, receive_class_timetable,
       receive_cafeteria_sold_out, receive_assignment_updates,
       receive_general_notifications
from public.line_group_chats
order by last_seen_at desc;
```

対象グループの `chat_id` をコピーします。Botはそのグループに参加中で、`active = true` である必要があります。

## 3. 指定したグループで4種類をONにする

次のSQLの `PASTE_GROUP_ID_HERE` を対象の `chat_id` に置き換えて実行します。

```sql
update public.line_group_chats
set receive_train_timetable = true,
    receive_class_timetable = true,
    receive_cafeteria_sold_out = true,
    receive_assignment_updates = true,
    receive_general_notifications = false
where chat_id = 'PASTE_GROUP_ID_HERE'
  and active = true;
```

これで1つのグループが4種類を受信します。他のグループの設定は変わりません。ほかのグループには送られません（そのグループ自身の受信設定を別途変更した場合を除く）。

## 4. 毎日21:00の時間割・課題期限通知を有効にする

Vercelの環境変数 `CRON_SECRET` を確認し、`sql/setup_next_day_class_timetable_cron.sql` 内の **2箇所**の `REPLACE_WITH_CRON_SECRET` をその値に置き換え、Supabase SQL Editorで実行してください。実際の秘密値をGitHubへコミットしないでください。

このSQLは以下の2つを日本時間21:00にスケジュールします。

- 翌日の7組・8組時間割
- 提出期限が今後48時間以内に迫っている課題一覧

既存の鷹の台駅の毎時Cronは変更しません。実行後、次で有効化状態を確認できます。

```sql
select jobname, schedule, active
from cron.job
where jobname in ('campussync-next-day-class-timetable', 'campussync-assignment-deadline-reminder');
```

## 5. 確認

設定したグループが4種類の列を `true`、`receive_general_notifications` を `false` にしていることを確認してください。Adminから学食売切をテストした場合と新規課題を公開した場合は実際にLINEに配信されるため、公開前に内容とグループを確認してください。
