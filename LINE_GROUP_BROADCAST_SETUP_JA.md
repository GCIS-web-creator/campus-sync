# CampusSync: 特定のLINEグループへ時刻表だけを配信

## 最初に行う設定

1. Supabase Dashboard → SQL Editor で `supabase/line-group-broadcast.sql` を実行します。
2. LINE Developers ConsoleでCampusSyncのMessaging APIチャネルを開き、「グループトーク・複数人トークへの参加を許可する」を有効にします。
3. Botを対象のLINEグループに招待します。Botが退出せず参加中であることを確認してください。グループに別のLINE公式アカウントが参加している場合は、LINEの制約で追加できないことがあります。
4. LINE DevelopersのWebhook URLが `https://campus-sync-mocha.vercel.app/api/line-webhook` であり、Webhook利用がONであることを確認します。
5. Botが参加できたら、グループ内でメッセージを1回送信します。WebhookからGroup IDが自動保存されます。

## Group IDを確認して、時刻表専用に指定する

SupabaseのSQL Editorで次のクエリを実行します。

```sql
select chat_id, chat_type, active, last_seen_at, last_event_type
from public.line_group_chats
order by last_seen_at desc;
```

`chat_id` がGroup ID（複数人トークの場合はroom ID）です。`active = true` で、対象のグループに対応する行を確認します。グループ名はWebhookに含まれないため、時刻を見て対象グループを判定してください。候補が複数ある場合は、対象グループ内でメッセージを送り、`last_seen_at` が更新された行を確認できます。

対象の `chat_id` をコピーし、次のSQLの `PASTE_GROUP_ID_HERE` だけを実際のIDに置き換えて実行します。

```sql
update public.line_group_chats
set receive_train_timetable = (chat_id = 'PASTE_GROUP_ID_HERE'),
    receive_class_timetable = (chat_id = 'PASTE_GROUP_ID_HERE'),
    receive_general_notifications = false
where chat_type in ('group', 'room');
```

この設定は、登録されているグループのうち**指定した1つだけ**を、電車時刻表と7組・8組の翌日時間割の受信先にし、すべてのグループで一般通知の受信をOFFにします。LINEの個人の友だち向け配信は従来どおり維持されます。

設定を確認するには、次を実行します。

```sql
select chat_id, chat_type, active, receive_general_notifications,
       receive_train_timetable, receive_class_timetable
from public.line_group_chats
order by last_seen_at desc;
```

対象グループの行が `active = true`、`receive_train_timetable = true`、`receive_class_timetable = true`、`receive_general_notifications = false` になっていれば設定完了です。

## 通知の送信先

- **指定したグループ**：毎日16:00〜18:00の電車時刻表まとめと、毎日21:00の翌日時間割を受信します。
- **ほかのグループ**：これら2種類を受信しません（別途、受信設定を変更した場合を除く）。
- **LINE公式アカウントの友だち**：学校のお知らせ、課題、部活・委員会、学食の売切、承認済みの落とし物など、既存の配信を従来どおり受信します。

グループ宛てのプッシュメッセージはメンバー全員に表示されます。送信通数も消費される場合があるため、公式アカウントのプランや通数上限を確認してください。
