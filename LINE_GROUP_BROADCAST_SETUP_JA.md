# CampusSync: LINEグループにも全通知を配信

## 初回設定

1. Supabase Dashboard → SQL Editor で `supabase/line-group-broadcast.sql` を実行します。
2. LINE Developers ConsoleでCampusSyncのMessaging APIチャネルを開き、**「グループトーク・複数人トークへの参加を許可する」** を有効にします。
3. LINEアプリで、配信したいグループにCampusSyncのLINE公式アカウントを招待します。
4. LINE DevelopersでWebhook利用がONになっていることを確認します。設定済みURLは `https://campus-sync-mocha.vercel.app/api/line-webhook` です。
5. すでにBotが参加しているグループを後から設定した場合は、そのグループで誰かが一度メッセージを送るとIDが自動登録されます。新しく招待した場合は参加イベントから自動登録されます。
6. SQL確認クエリに対象グループが `active = true` で表示されることを確認します。

グループIDを手でコピーしたり、LINEアクセストークンをSQLやGitHubに書いたりする必要はありません。署名検証済みWebhookイベントからIDを登録します。

## グループにも送られる内容

既存のLINE友だち向け一斉配信を維持しつつ、登録済みのすべてのアクティブなLINEグループにも同じ内容を追加配信します。

- 学校全体のお知らせ（画像付きも含む）
- Adminの自由入力LINE一斉配信
- 鷹の台駅の毎時発車案内
- 部活・委員会の連絡ノート
- 学食の売切通知
- 事務室で承認された落とし物のお知らせ
- グループ内で送られたAIへの質問は、既存Webhookの返信としてグループに表示されます

グループへ送るには、Botがそのグループに参加中である必要があります。送信通数はグループの参加人数などに応じて消費されるため、LINE公式アカウントの利用プラン・通数上限を確認してください。
